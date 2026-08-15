/**
 * サポカ所持の画面キャプチャ読み取り（β）。
 *
 * ゲームのサポカ一覧を画面共有し、スクロールしながらカードと凸数を自動読み取りする。
 * 読み取り結果は一覧で確認・手動修正してから所持データ（/support と同じストア）へ反映する。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, Square, Trash2 } from "lucide-react";
import spriteMeta from "@/data/generated/cardSprite.json";
import { SUPPORT_CATALOG } from "@/data/supportCardCatalog";
import {
  FRAME_H,
  FRAME_W,
  TILE_H,
  TILE_W,
  type TileMatch,
} from "@/lib/cardImport/match";
import { detectGameRegion } from "@/lib/eventCounter/autoRegion";
import { imageUrl } from "@/lib/config";
import { useOwnedLevels } from "@/lib/useOwnedLevels";

const REGION_KEY = "gakumas:cardImportRegion:v1";
const TICK_MS = 350;
/** これ未満のスコアは照合失敗として無視する */
const MIN_SCORE = 0.55;
/** これ以上なら自動判定を信頼できる目安 */
const SURE_SCORE = 0.8;

/** スプライトのインデックス → カード（画像ファイル名=カード名で対応づけ） */
const CARD_BY_SPRITE = spriteMeta.names.map(
  (name) => SUPPORT_CATALOG.find((c) => c.name === name) ?? null,
);
const CATALOG_BY_NAME = new Map(SUPPORT_CATALOG.map((c) => [c.name, c]));

type StoredRegion = {
  x: number;
  y: number;
  w: number;
  h: number;
  videoW: number;
  videoH: number;
};

function loadRegion(): StoredRegion | null {
  try {
    const raw = localStorage.getItem(REGION_KEY);
    if (raw) return JSON.parse(raw) as StoredRegion;
  } catch {
    // 破損データは無視
  }
  return null;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

type Detection = {
  id: string;
  name: string;
  rarity: string;
  score: number;
  margin: number;
  tsuki: number;
  tsukiOk: boolean;
  /** 手動で割り当て・修正済み */
  manual: boolean;
  /** キャプチャからの切り抜き（確認用） */
  thumb: string;
};

export default function CardImportPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const workerBusy = useRef(false);
  /** Workerに送ったフレームの複製（結果が返ったらここから切り抜く） */
  const pendingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastTilesRef = useRef<TileMatch[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [libReady, setLibReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoMsg, setAutoMsg] = useState<string | null>(null);
  const [videoSize, setVideoSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  const [region, setRegion] = useState<StoredRegion | null>(loadRegion);
  const [drag, setDrag] = useState<{
    sx: number;
    sy: number;
    cx: number;
    cy: number;
  } | null>(null);
  const [detections, setDetections] = useState<Map<string, Detection>>(
    () => new Map(),
  );
  const [unownedRest, setUnownedRest] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);
  const { applyLevels } = useOwnedLevels();

  // ---- 照合Worker: 起動してスプライトのライブラリを構築する ----
  useEffect(() => {
    const worker = new Worker(
      new URL("../../lib/cardImport/importWorker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent) => {
      const data = e.data as {
        type: string;
        tiles?: TileMatch[];
        count?: number;
      };
      if (data.type === "ready") setLibReady(true);
      if (data.type === "result" && data.tiles) {
        workerBusy.current = false;
        lastTilesRef.current = data.tiles;
        handleTiles(data.tiles);
      }
    };
    // スプライトを読み込んでWorkerへ（同一オリジンなのでcanvasで安全に読める）
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, img.width, img.height);
      worker.postMessage(
        {
          type: "init",
          sprite: data.data.buffer,
          width: img.width,
          height: img.height,
          count: spriteMeta.names.length,
          cellW: spriteMeta.cellW,
          cellH: spriteMeta.cellH,
          cols: spriteMeta.cols,
        },
        [data.data.buffer],
      );
    };
    img.onerror = () =>
      setError("照合用データ（sprite.png）を読み込めませんでした。");
    img.src = "/card-import/sprite.png";
    return () => worker.terminate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Workerの結果を検出一覧へ反映（良いスコアで上書き） */
  const handleTiles = useCallback((tiles: TileMatch[]) => {
    const pending = pendingCanvasRef.current;
    if (!pending) return;
    setDetections((prev) => {
      let next: Map<string, Detection> | null = null;
      for (const t of tiles) {
        if (t.index < 0 || t.score < MIN_SCORE) continue;
        const card = CARD_BY_SPRITE[t.index];
        if (!card) continue;
        const existing = (next ?? prev).get(card.id);
        if (existing && (existing.manual || existing.score >= t.score)) continue;
        // 確認用の切り抜きを作る（新規・更新時のみ）
        const crop = document.createElement("canvas");
        crop.width = TILE_W;
        crop.height = TILE_H;
        const cctx = crop.getContext("2d");
        if (!cctx) continue;
        cctx.drawImage(
          pending,
          t.rect.x,
          t.rect.y,
          t.rect.w,
          t.rect.h,
          0,
          0,
          TILE_W,
          TILE_H,
        );
        if (!next) next = new Map(prev);
        next.set(card.id, {
          id: card.id,
          name: card.name,
          rarity: card.rarity,
          score: t.score,
          margin: t.margin,
          tsuki: t.tsuki,
          tsukiOk: t.tsukiOk,
          manual: false,
          thumb: crop.toDataURL("image/jpeg", 0.75),
        });
      }
      return next ?? prev;
    });
  }, []);

  // ---- キャプチャ ----
  const autoDetect = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const found = detectGameRegion(video);
    if (found) {
      const next: StoredRegion = {
        ...found,
        videoW: video.videoWidth,
        videoH: video.videoHeight,
      };
      setRegion(next);
      setAutoMsg(
        `ゲーム画面を自動検出しました（${found.w}×${found.h}）。ずれている場合はプレビューをドラッグして直せます。`,
      );
      try {
        localStorage.setItem(REGION_KEY, JSON.stringify(next));
      } catch {
        // 無視
      }
    } else {
      setAutoMsg(
        "ゲーム画面を自動検出できませんでした。プレビュー上をドラッグして範囲を指定してください。",
      );
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCapturing(false);
    setVideoSize(null);
    setDrag(null);
    setAutoMsg(null);
  }, []);

  const attachStream = useCallback(
    (s: MediaStream) => {
      stop();
      streamRef.current = s;
      const video = videoRef.current;
      if (!video) return;
      const onMeta = () => {
        setVideoSize({ w: video.videoWidth, h: video.videoHeight });
        setTimeout(autoDetect, 400);
      };
      video.onloadedmetadata = onMeta;
      video.srcObject = s;
      void video.play().catch(() => undefined);
      if (video.readyState >= 1 && video.videoWidth > 0) onMeta();
      s.getVideoTracks()[0]?.addEventListener("ended", stop);
      setCapturing(true);
    },
    [stop, autoDetect],
  );

  const start = async () => {
    setError(null);
    setApplied(null);
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 10 },
        audio: false,
      });
      attachStream(s);
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      setError(
        name === "NotAllowedError"
          ? "キャプチャがキャンセルされました。もう一度「キャプチャ開始」を押して、ゲームのウィンドウを選んでください。"
          : "キャプチャを開始できませんでした。ブラウザが画面共有に対応しているか確認してください。",
      );
    }
  };

  useEffect(() => stop, [stop]);

  // 開発検証用: コンソールから任意の MediaStream を流し込める
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__cardImportInject =
      attachStream;
    return () => {
      delete (window as unknown as Record<string, unknown>).__cardImportInject;
    };
  }, [attachStream]);

  // 映像サイズが確定したら、保存済みの範囲が同じ寸法のときだけ復元する
  useEffect(() => {
    if (!videoSize) return;
    setRegion((prev) =>
      prev && prev.videoW === videoSize.w && prev.videoH === videoSize.h
        ? prev
        : null,
    );
  }, [videoSize]);

  // ---- 周期処理: 正規化 → Worker照合 → プレビュー描画 ----
  useEffect(() => {
    if (!capturing || !region || !libReady) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const timer = setInterval(() => {
      if (video.readyState < 2 || video.videoWidth === 0) return;
      ctx.drawImage(
        video,
        region.x,
        region.y,
        region.w,
        region.h,
        0,
        0,
        FRAME_W,
        FRAME_H,
      );
      // 直近の検出タイルを枠で示す（1フレーム前の位置なので目安）
      for (const t of lastTilesRef.current) {
        ctx.strokeStyle =
          t.score >= SURE_SCORE
            ? "rgba(16,185,129,0.9)"
            : t.score >= MIN_SCORE
              ? "rgba(245,158,11,0.9)"
              : "rgba(239,68,68,0.9)";
        ctx.lineWidth = 3;
        ctx.strokeRect(t.rect.x, t.rect.y, t.rect.w, t.rect.h);
      }
      if (workerBusy.current) return;
      // Workerへ送るフレームを取り直す（枠の描画を含めないように再描画）
      ctx.drawImage(
        video,
        region.x,
        region.y,
        region.w,
        region.h,
        0,
        0,
        FRAME_W,
        FRAME_H,
      );
      const frame = ctx.getImageData(0, 0, FRAME_W, FRAME_H);
      // 結果が返ったときの切り抜き用に複製を保存
      let pending = pendingCanvasRef.current;
      if (!pending) {
        pending = document.createElement("canvas");
        pending.width = FRAME_W;
        pending.height = FRAME_H;
        pendingCanvasRef.current = pending;
      }
      pending.getContext("2d")?.putImageData(frame, 0, 0);
      workerBusy.current = true;
      workerRef.current?.postMessage(
        { type: "frame", rgba: frame.data.buffer, width: FRAME_W, height: FRAME_H },
        [frame.data.buffer],
      );
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [capturing, region, libReady]);

  // ---- プレビュー上のドラッグで範囲指定（自動検出の保険） ----
  const toVideoCoords = (e: React.MouseEvent) => {
    const wrap = wrapRef.current;
    if (!wrap || !videoSize) return null;
    const rect = wrap.getBoundingClientRect();
    return {
      x: clamp(((e.clientX - rect.left) / rect.width) * videoSize.w, 0, videoSize.w),
      y: clamp(((e.clientY - rect.top) / rect.height) * videoSize.h, 0, videoSize.h),
    };
  };
  const onMouseDown = (e: React.MouseEvent) => {
    if (!capturing) return;
    const p = toVideoCoords(e);
    if (p) setDrag({ sx: p.x, sy: p.y, cx: p.x, cy: p.y });
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag) return;
    const p = toVideoCoords(e);
    if (p) setDrag({ ...drag, cx: p.x, cy: p.y });
  };
  const onMouseUp = () => {
    if (!drag || !videoSize) return;
    const x = Math.min(drag.sx, drag.cx);
    const y = Math.min(drag.sy, drag.cy);
    const w = Math.abs(drag.cx - drag.sx);
    const h = Math.abs(drag.cy - drag.sy);
    setDrag(null);
    if (w < 40 || h < 40) return;
    const next: StoredRegion = {
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(w),
      h: Math.round(h),
      videoW: videoSize.w,
      videoH: videoSize.h,
    };
    setRegion(next);
    try {
      localStorage.setItem(REGION_KEY, JSON.stringify(next));
    } catch {
      // 無視
    }
  };
  const rectShown = drag
    ? {
        x: Math.min(drag.sx, drag.cx),
        y: Math.min(drag.sy, drag.cy),
        w: Math.abs(drag.cx - drag.sx),
        h: Math.abs(drag.cy - drag.sy),
      }
    : region;

  // ---- 検出一覧の操作 ----
  const setTsuki = (id: string, tsuki: number) => {
    setDetections((prev) => {
      const next = new Map(prev);
      const d = next.get(id);
      if (d) next.set(id, { ...d, tsuki, tsukiOk: true, manual: true });
      return next;
    });
  };
  const removeDetection = (id: string) => {
    setDetections((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };
  /** カードの割り当てを手動で変更する（名前で指定） */
  const reassign = (oldId: string, newName: string) => {
    const card = CATALOG_BY_NAME.get(newName);
    if (!card) return;
    setDetections((prev) => {
      const next = new Map(prev);
      const d = next.get(oldId);
      if (!d) return prev;
      next.delete(oldId);
      next.set(card.id, {
        ...d,
        id: card.id,
        name: card.name,
        rarity: card.rarity,
        score: 1,
        margin: 1,
        manual: true,
      });
      return next;
    });
  };

  const apply = () => {
    const entries: Record<string, number> = {};
    for (const d of detections.values()) entries[d.id] = d.tsuki;
    let unownedCount = 0;
    if (unownedRest) {
      for (const c of SUPPORT_CATALOG) {
        if (!detections.has(c.id)) {
          entries[c.id] = -1;
          unownedCount++;
        }
      }
    }
    if (
      !window.confirm(
        `${detections.size}枚の所持・凸数を反映します${
          unownedRest ? `（未検出の${unownedCount}枚は未所持にします）` : ""
        }。よろしいですか？`,
      )
    )
      return;
    applyLevels(entries);
    setApplied(
      `${detections.size}枚を反映しました${unownedRest ? `（${unownedCount}枚を未所持化）` : ""}。所持状況入力ページで確認できます。`,
    );
  };

  const list = [...detections.values()];
  const needCheck = list
    .filter((d) => !d.manual && (d.score < SURE_SCORE || !d.tsukiOk || d.margin < 0.05))
    .sort((a, b) => a.score - b.score);
  const okList = list
    .filter((d) => d.manual || (d.score >= SURE_SCORE && d.tsukiOk && d.margin >= 0.05))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  const missing = SUPPORT_CATALOG.filter((c) => !detections.has(c.id));

  return (
    <div>
      <p className="mb-3 text-sm text-slate-600">
        ゲームの<b>サポートカード一覧</b>を画面共有して、ゆっくりスクロールすると
        カードと凸数（白い星の数）を自動で読み取ります。読み取り結果を確認・修正してから
        「所持データに反映」を押してください。
        <Link to="/support" className="ml-2 text-blue-600 underline">
          ← 所持状況入力へ戻る
        </Link>
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {!capturing ? (
          <button
            type="button"
            onClick={() => void start()}
            disabled={!libReady}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-blue-500 disabled:opacity-40"
          >
            <Camera size={15} />
            {libReady ? "キャプチャ開始" : "照合データ準備中…"}
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            className="flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-2 text-sm font-bold text-white transition hover:bg-slate-600"
          >
            <Square size={15} />
            キャプチャ停止
          </button>
        )}
        <button
          type="button"
          onClick={() => setDetections(new Map())}
          disabled={detections.size === 0}
          className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
        >
          <Trash2 size={13} />
          読み取り結果をクリア
        </button>
        <span className="text-sm tabular-nums text-slate-600">
          検出 <b className="text-blue-700">{detections.size}</b> /{" "}
          {SUPPORT_CATALOG.length}枚
        </span>
      </div>
      {error && <p className="mb-3 text-sm font-semibold text-red-500">{error}</p>}
      {autoMsg && (
        <p className="mb-3 text-xs font-semibold text-blue-600">{autoMsg}</p>
      )}
      {applied && (
        <p className="mb-3 text-sm font-semibold text-emerald-600">{applied}</p>
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* 取り込みプレビュー（範囲指定） */}
        <section className="w-full max-w-sm shrink-0">
          <h2 className="mb-1.5 text-sm font-bold text-slate-700">
            取り込みプレビュー
          </h2>
          <div
            ref={wrapRef}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            className={`relative w-full select-none overflow-hidden rounded-xl border border-slate-300 bg-slate-900 ${
              capturing ? "cursor-crosshair" : ""
            }`}
          >
            <video ref={videoRef} muted playsInline className="block w-full" />
            {!capturing && (
              <div className="flex aspect-video w-full items-center justify-center px-4 text-center text-xs text-slate-400">
                「キャプチャ開始」を押して、学マスのウィンドウを選んでください
              </div>
            )}
            {capturing && videoSize && rectShown && (
              <div
                className="pointer-events-none absolute border-2 border-blue-400"
                style={{
                  left: `${(rectShown.x / videoSize.w) * 100}%`,
                  top: `${(rectShown.y / videoSize.h) * 100}%`,
                  width: `${(rectShown.w / videoSize.w) * 100}%`,
                  height: `${(rectShown.h / videoSize.h) * 100}%`,
                  boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.45)",
                }}
              />
            )}
          </div>
        </section>

        {/* 正規化プレビュー（検出枠つき） */}
        <section className="shrink-0">
          <h2 className="mb-1.5 text-sm font-bold text-slate-700">
            読み取りプレビュー
            <span className="ml-2 text-xs font-normal text-slate-400">
              緑=確定 黄=要確認
            </span>
          </h2>
          <canvas
            ref={canvasRef}
            width={FRAME_W}
            height={FRAME_H}
            className="h-[320px] w-[180px] rounded-xl border border-slate-300 bg-slate-900"
          />
        </section>

        {/* 反映操作 */}
        <section className="min-w-0 flex-1">
          <h2 className="mb-1.5 text-sm font-bold text-slate-700">反映</h2>
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={unownedRest}
                onChange={(e) => setUnownedRest(e.target.checked)}
                className="accent-blue-600"
              />
              検出されなかった{missing.length}枚を未所持にする
            </label>
            <p className="mt-1 text-xs text-slate-400">
              読み飛ばしがあると未所持になってしまうので、全カードをスクロールし終えた
              ときだけチェックしてください。
            </p>
            <button
              type="button"
              onClick={apply}
              disabled={detections.size === 0}
              className="mt-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-40"
            >
              所持データに反映（{detections.size}枚）
            </button>
            {missing.length > 0 && (
              <details className="mt-2 text-xs text-slate-500">
                <summary className="cursor-pointer">
                  未検出のカード（{missing.length}枚）
                </summary>
                <p className="mt-1 leading-5">
                  {missing.map((c) => c.name).join("、")}
                </p>
              </details>
            )}
          </div>
        </section>
      </div>

      {/* 検出一覧 */}
      {needCheck.length > 0 && (
        <DetectionGroup
          title={`要確認（${needCheck.length}枚）`}
          hint="照合スコアが低い・凸が読み取れなかったなど。カード名や凸を手で直してください"
          items={needCheck}
          onTsuki={setTsuki}
          onRemove={removeDetection}
          onReassign={reassign}
        />
      )}
      {okList.length > 0 && (
        <DetectionGroup
          title={`読み取りOK（${okList.length}枚）`}
          hint="自動判定に自信あり。間違いがあればここでも直せます"
          items={okList}
          onTsuki={setTsuki}
          onRemove={removeDetection}
          onReassign={reassign}
        />
      )}

      {/* カード名の入力候補（割り当て修正用） */}
      <datalist id="card-import-names">
        {SUPPORT_CATALOG.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>
    </div>
  );
}

function DetectionGroup({
  title,
  hint,
  items,
  onTsuki,
  onRemove,
  onReassign,
}: {
  title: string;
  hint: string;
  items: Detection[];
  onTsuki: (id: string, tsuki: number) => void;
  onRemove: (id: string) => void;
  onReassign: (id: string, name: string) => void;
}) {
  return (
    <section className="mt-4">
      <h2 className="mb-1 text-sm font-bold text-slate-700">
        {title}
        <span className="ml-2 text-xs font-normal text-slate-400">{hint}</span>
      </h2>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {items.map((d) => (
          <div
            key={d.id}
            className="flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-white p-2"
          >
            <div className="flex items-center gap-2">
              {/* キャプチャの切り抜き */}
              <img
                src={d.thumb}
                alt=""
                className="h-[46px] w-[80px] shrink-0 rounded object-cover"
              />
              <span className="text-slate-300">→</span>
              {/* 照合されたカード */}
              <img
                src={imageUrl(`${d.name}.webp`)}
                alt={d.name}
                loading="lazy"
                className="h-[46px] w-[80px] shrink-0 rounded object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-800" title={d.name}>
                  {d.name}
                </p>
                <p className="text-[10px] text-slate-400">
                  {d.rarity === "EventSSR" ? "配布SSR" : d.rarity}
                  {d.manual ? (
                    <span className="ml-1 font-bold text-blue-600">手動</span>
                  ) : (
                    <span
                      className={`ml-1 font-bold ${
                        d.score >= SURE_SCORE ? "text-emerald-600" : "text-amber-600"
                      }`}
                    >
                      一致{Math.round(d.score * 100)}%
                    </span>
                  )}
                  {!d.tsukiOk && !d.manual && (
                    <span className="ml-1 font-bold text-red-500">凸要確認</span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(d.id)}
                title="この読み取りを破棄"
                className="shrink-0 rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-500"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-slate-400">凸</span>
              {[0, 1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onTsuki(d.id, n)}
                  className={`h-6 w-6 rounded text-xs font-bold transition ${
                    d.tsuki === n
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {n}
                </button>
              ))}
              <input
                list="card-import-names"
                placeholder="カード名を修正…"
                onChange={(e) => {
                  const name = e.target.value;
                  if (name !== d.name && name.length > 0) onReassign(d.id, name);
                }}
                className="ml-auto w-36 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px]"
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
