import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, Download, Home, ScanSearch, Square, X } from "lucide-react";
import {
  CurrentEventsPanel,
  RunListPanel,
  StatsPanel,
  TrackerStatusPanel,
} from "@/components/event-counter/RecordsPanels";
import { detectGameRegion } from "@/lib/eventCounter/autoRegion";
import {
  cardsQuality,
  DEFAULT_THRESHOLDS,
  EVENT_TOP_MAX,
  extractCards,
  loadLandmarks,
  SCREEN_LABELS,
  TEMPLATE_KEYS,
  toGray,
  WORK_H,
  WORK_W,
  type AnalyzeResult,
  type GrayImage,
  type TemplateKey,
} from "@/lib/eventCounter/detect";
import {
  currentTeamId,
  deleteRun,
  fingerprint,
  loadRuns,
  loadTeams,
  matchTeam,
  saveTeams,
  setCurrentTeamId,
  upsertRun,
  type StoredRun,
  type Team,
} from "@/lib/eventCounter/store";
import { RunTracker, type EventKind } from "@/lib/eventCounter/tracker";

/**
 * イベントカウンター。
 *
 * 画面共有 → ゲーム領域の自動検出 → 540x960 正規化 → 画面判定（Web Worker）
 * → サポカ自動読み取り・イベント照合 → 育成の自動記録（tracker）→ 統計。
 * 判定・追跡のロジックは Python 版 gakumas_event_counter の移植
 * （lib/eventCounter/ 配下。検証は Python 版の正解ラベル付き実画面で実施）。
 */

/** 正規化プレビュー・判定の周期（ms）。Python版の既定と同じ5Hz */
const TICK_MS = 200;
const REGION_KEY = "gakumas:eventCounterRegion:v1";
/** 旧バージョンのサポカ保存（編成ストアへ移行済み） */
const LEGACY_CARDS_KEY = "gakumas:eventCounterCards:v1";
/** サポカ読み取りの最短間隔（ms）。開始確認画面にいる間ずっと読み直さない */
const CARD_CAPTURE_INTERVAL = 1500;

/** dataURL → ImageData（保存済みサポカの復元用） */
async function dataUrlToImageData(url: string): Promise<ImageData | null> {
  try {
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0);
    return ctx.getImageData(0, 0, bmp.width, bmp.height);
  } catch {
    return null;
  }
}

/** ImageData → dataURL（サムネイル保存用） */
function imageDataToDataUrl(img: ImageData): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

/** 目印の短い表示名 */
const LANDMARK_LABELS: Record<TemplateKey, string> = {
  start_tab: "開始確認",
  schedule: "スケジュール",
  day_line: "日数表示",
  produce_end: "ホーム",
  produce_done: "プロデュース完了",
  exam_line: "突破ライン",
  info_page: "編成情報",
};

/** 選択範囲（映像ピクセル座標）。映像サイズが変わったら無効にするため寸法も持つ */
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

export default function EventCounterPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const [tickInfo, setTickInfo] = useState<string | null>(null);
  const [autoMsg, setAutoMsg] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [runs, setRuns] = useState<StoredRun[]>(loadRuns);
  const [log, setLog] = useState<string[]>([]);
  // tracker.run は内部で書き換わるので、変化時にこのカウンタで再描画する
  const [, setRunTick] = useState(0);
  const workerRef = useRef<Worker | null>(null);
  const workerBusy = useRef(false);
  const lastCardCapture = useRef(0);
  const teamRef = useRef<Team | null>(null);
  teamRef.current = team;

  const pushLog = useCallback((messages: string[]) => {
    if (messages.length === 0) return;
    const stamp = new Date().toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    setLog((prev) =>
      [...prev, ...messages.map((m) => `${stamp} ${m}`)].slice(-50),
    );
  }, []);

  /** 今の育成を保存する（イベント・ターンが進むたびに呼ばれる） */
  const persistRun = useCallback(() => {
    const tracker = trackerRef.current;
    setRunTick((t) => t + 1);
    if (!tracker.run) return;
    const teamId = teamRef.current?.id;
    if (!teamId) return;
    setRuns(upsertRun({ ...tracker.run, teamId }));
  }, []);

  // 育成の追跡（Python版 tracker の移植）。コールバックは ref 経由で最新を見る
  const trackerRef = useRef<RunTracker>(null as unknown as RunTracker);
  if (trackerRef.current === null) {
    trackerRef.current = new RunTracker({
      onChanged: () => persistRunRef.current(),
      onRunFinished: (run) => {
        const teamId = teamRef.current?.id;
        if (teamId) setRuns(upsertRun({ ...run, teamId }));
      },
      onRunResume: () => {
        const teamId = teamRef.current?.id;
        if (!teamId) return null;
        const all = loadRuns().filter((r) => r.teamId === teamId);
        // 中断したままの記録があれば、その続きにする
        const unfinished = [...all].reverse().find((r) => !r.completed);
        if (unfinished) return { ...unfinished };
        // 無ければ本戦の新規。直近の完走した選抜と結びつける
        const lastQualifier = [...all]
          .reverse()
          .find((r) => r.completed && r.stage === "qualifier");
        return { prevRunId: lastQualifier?.id ?? null };
      },
    });
  }
  const persistRunRef = useRef(persistRun);
  persistRunRef.current = persistRun;

  /** 読み取ったサポカ6枚を確定する（編成の同定・保存・Workerへ送信） */
  const commitCards = useCallback(
    (
      extracted: ({ thumb: ImageData; gray: GrayImage } | null)[],
      quality: number,
    ) => {
      workerRef.current?.postMessage({
        type: "cards",
        cards: extracted.map((c) => (c ? c.gray : null)),
      });
      const thumbs = extracted.map((c) =>
        c ? imageDataToDataUrl(c.thumb) : null,
      );
      const fps = extracted.map((c) => (c ? fingerprint(c.gray) : null));
      const teams = loadTeams();
      let matched = matchTeam(teams, fps);
      if (matched) {
        // 同じ編成。写りが良ければ画像を差し替える（名前は引き継ぐ）
        if (quality > matched.quality) {
          matched = { ...matched, thumbs, fps, quality };
          saveTeams(teams.map((t) => (t.id === matched!.id ? matched! : t)));
        }
      } else {
        matched = {
          id: crypto.randomUUID().replace(/-/g, "").slice(0, 12),
          thumbs,
          names: [null, null, null, null, null, null],
          fps,
          quality,
          createdAt: Date.now() / 1000,
        };
        saveTeams([...teams, matched]);
        pushLog(["新しい編成として登録しました"]);
      }
      setCurrentTeamId(matched.id);
      setTeam(matched);
    },
    [pushLog],
  );

  /** 開始確認/編成情報の画面が見えたら、サポカ6枚を自動で読み取る */
  const maybeCaptureCards = useCallback(
    (source: "start" | "info") => {
      const now = performance.now();
      if (now - lastCardCapture.current < CARD_CAPTURE_INTERVAL) return;
      lastCardCapture.current = now;
      const ctx = canvasRef.current?.getContext("2d", {
        willReadFrequently: true,
      });
      if (!ctx) return;
      const frame = ctx.getImageData(0, 0, WORK_W, WORK_H);
      const extracted = extractCards(frame, source);
      if (extracted.filter((c) => c !== null).length !== 6) return;
      // 暗転中などの写りが悪い読み取りで、今持っている絵を上書きしない
      // （同じ編成なら quality 比較は commitCards 側でも行う）
      const quality = cardsQuality(extracted.map((c) => c?.gray ?? null));
      const current = teamRef.current;
      if (current && quality <= current.quality) {
        // 同じ編成かどうかだけ確かめる（別の編成なら品質に関係なく切り替える）
        const fps = extracted.map((c) => (c ? fingerprint(c.gray) : null));
        const stillSame = matchTeam([current], fps) !== null;
        if (stillSame) return;
      }
      commitCards(extracted, quality);
    },
    [commitCards],
  );

  // 判定Worker: 起動して目印と保存済みサポカを送り込む
  useEffect(() => {
    const worker = new Worker(
      new URL("../../lib/eventCounter/detectWorker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent) => {
      const data = e.data as { type: string; result?: AnalyzeResult };
      if (data.type !== "result" || !data.result) return;
      workerBusy.current = false;
      setAnalysis(data.result);
      if (data.result.screen === "start") maybeCaptureCards("start");
      else if (data.result.screen === "info") maybeCaptureCards("info");
      // 育成の追跡（記録）
      pushLog(trackerRef.current.update(data.result, Date.now() / 1000));
    };
    void loadLandmarks().then((lm) => {
      worker.postMessage({ type: "landmarks", landmarks: lm });
    });
    // 保存済みの編成を復元してWorkerへ
    void (async () => {
      let teams = loadTeams();
      // 旧形式（編成なしのサポカ保存）からの移行
      try {
        const legacy = localStorage.getItem(LEGACY_CARDS_KEY);
        if (legacy && teams.length === 0) {
          const parsed = JSON.parse(legacy) as {
            quality: number;
            thumbs: (string | null)[];
          };
          const grays = await Promise.all(
            parsed.thumbs.map(async (url) => {
              if (!url) return null;
              const img = await dataUrlToImageData(url);
              return img ? toGray(img) : null;
            }),
          );
          const migrated: Team = {
            id: crypto.randomUUID().replace(/-/g, "").slice(0, 12),
            thumbs: parsed.thumbs,
            names: [null, null, null, null, null, null],
            fps: grays.map((g) => (g ? fingerprint(g) : null)),
            quality: parsed.quality,
            createdAt: Date.now() / 1000,
          };
          teams = [migrated];
          saveTeams(teams);
          setCurrentTeamId(migrated.id);
          localStorage.removeItem(LEGACY_CARDS_KEY);
        }
      } catch {
        // 移行失敗は無視（次の読み取りで新規登録される）
      }
      const id = currentTeamId();
      const current = teams.find((t) => t.id === id) ?? null;
      if (!current) return;
      setTeam(current);
      const grays = await Promise.all(
        current.thumbs.map(async (url) => {
          if (!url) return null;
          const img = await dataUrlToImageData(url);
          return img ? toGray(img) : null;
        }),
      );
      worker.postMessage({ type: "cards", cards: grays });
    })();
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [maybeCaptureCards, pushLog]);

  /** 読み取ったサポカを消す（編成の記録は残る。次の開始確認画面で読み直す） */
  const clearCards = () => {
    setTeam(null);
    setCurrentTeamId(null);
    workerRef.current?.postMessage({ type: "cards", cards: [] });
  };

  /** サポカに名前を付ける（統計・CSVで使う） */
  const renameCard = (index: number) => {
    const current = teamRef.current;
    if (!current) return;
    const name = window.prompt(
      `サポカ${index + 1}の名前（統計・CSVに表示されます）`,
      current.names[index] ?? "",
    );
    if (name === null) return;
    const names = current.names.slice();
    names[index] = name.trim() || null;
    const updated = { ...current, names };
    saveTeams(loadTeams().map((t) => (t.id === updated.id ? updated : t)));
    setTeam(updated);
  };

  /** 手動でイベントを記録する */
  const recordManual = (card: number, kind: EventKind) => {
    const tracker = trackerRef.current;
    const now = Date.now() / 1000;
    if (tracker.ensureManualRun(now)) {
      pushLog(["手動記録用に育成の記録を始めました"]);
    }
    const run = tracker.run!;
    run.events.push({
      card,
      kind,
      turn: run.turns,
      time: now,
      score: 0,
      manual: true,
    });
    persistRun();
  };

  /** 今の育成のイベントを削除する */
  const deleteCurrentEvent = (index: number) => {
    const run = trackerRef.current.run;
    if (!run) return;
    run.events.splice(index, 1);
    persistRun();
  };

  /** ゲーム画面領域の自動検出（映像が来てから呼ぶ） */
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
    setTickInfo(null);
    setAnalysis(null);
    setAutoMsg(null);
  }, []);

  /** ストリームを取り付ける（画面共有・開発検証の両方から使う） */
  const attachStream = useCallback(
    (s: MediaStream) => {
      stop();
      streamRef.current = s;
      const video = videoRef.current;
      if (!video) return;
      // play() より先にハンドラを付ける（メタデータ読込を取りこぼさないように）
      const onMeta = () => {
        setVideoSize({ w: video.videoWidth, h: video.videoHeight });
        // 最初のフレームが描けるようになってからゲーム領域を自動検出
        setTimeout(autoDetect, 400);
      };
      video.onloadedmetadata = onMeta;
      video.srcObject = s;
      void video.play().catch(() => undefined);
      // 既にメタデータが読めている場合（即時に整うストリーム）はその場で処理
      if (video.readyState >= 1 && video.videoWidth > 0) onMeta();
      // 共有バーの「共有を停止」で止められたとき
      s.getVideoTracks()[0]?.addEventListener("ended", stop);
      setCapturing(true);
    },
    [stop, autoDetect],
  );

  const start = async () => {
    setError(null);
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

  // アンマウント時に停止
  useEffect(() => stop, [stop]);

  // 開発検証用: コンソールから任意の MediaStream を流し込める
  // （canvas.captureStream() でゲーム画面を模擬してテストするため。通常利用には影響なし）
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__eventCounterInject =
      attachStream;
    return () => {
      delete (window as unknown as Record<string, unknown>)
        .__eventCounterInject;
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

  // 正規化ループ: 指定範囲（無ければ全体）を 540x960 へ縮めて描く
  useEffect(() => {
    if (!capturing) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frames = 0;
    let lastStamp = performance.now();
    const timer = setInterval(() => {
      if (video.readyState < 2 || video.videoWidth === 0) return;
      const src = region ?? {
        x: 0,
        y: 0,
        w: video.videoWidth,
        h: video.videoHeight,
      };
      ctx.drawImage(
        video,
        src.x,
        src.y,
        src.w,
        src.h,
        0,
        0,
        WORK_W,
        WORK_H,
      );
      // 判定はWorkerへ（前の判定が終わっていない時はこのフレームを飛ばす）
      const worker = workerRef.current;
      if (worker && !workerBusy.current) {
        const img = ctx.getImageData(0, 0, WORK_W, WORK_H);
        workerBusy.current = true;
        worker.postMessage(
          { type: "frame", w: img.width, h: img.height, buffer: img.data.buffer },
          [img.data.buffer],
        );
      }
      frames++;
      const now = performance.now();
      if (now - lastStamp >= 1000) {
        setTickInfo(
          `${((frames * 1000) / (now - lastStamp)).toFixed(1)} fps / 入力 ${video.videoWidth}×${video.videoHeight}`,
        );
        frames = 0;
        lastStamp = now;
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [capturing, region]);

  /** マウス座標 → 映像ピクセル座標（プレビューは幅100%表示なので線形変換） */
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
    const p = toVideoCoords(e);
    if (!p) return;
    e.preventDefault();
    setDrag({ sx: p.x, sy: p.y, cx: p.x, cy: p.y });
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag) return;
    const p = toVideoCoords(e);
    if (!p) return;
    setDrag({ ...drag, cx: p.x, cy: p.y });
  };
  const onMouseUp = () => {
    if (!drag || !videoSize) return;
    const x = Math.min(drag.sx, drag.cx);
    const y = Math.min(drag.sy, drag.cy);
    const w = Math.abs(drag.cx - drag.sx);
    const h = Math.abs(drag.cy - drag.sy);
    setDrag(null);
    // 小さすぎるドラッグは誤操作扱い
    if (w < 24 || h < 24) return;
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
      // 容量超過などは無視
    }
  };

  const clearRegion = () => {
    setRegion(null);
    try {
      localStorage.removeItem(REGION_KEY);
    } catch {
      // 無視
    }
  };

  /** いま表示中の正規化画像（540x960）をPNG保存（判定調整・検証用） */
  const savePng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `event-counter-${Date.now()}.png`;
    a.click();
  };

  // ドラッグ中 or 確定済みの選択矩形（映像座標 → 表示%）
  const rectShown = drag
    ? {
        x: Math.min(drag.sx, drag.cx),
        y: Math.min(drag.sy, drag.cy),
        w: Math.abs(drag.cx - drag.sx),
        h: Math.abs(drag.cy - drag.sy),
      }
    : region;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ツール専用ヘッダー */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-base font-bold tracking-tight text-blue-600">
            <Camera size={18} />
            イベントカウンター
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              β版
            </span>
          </span>
          <Link
            to="/"
            className="ml-auto flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
          >
            <Home size={14} />
            ホームへ
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5">
        {/* 操作列 */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {!capturing ? (
            <button
              type="button"
              onClick={() => void start()}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-blue-500"
            >
              <Camera size={15} />
              キャプチャ開始（ゲームのウィンドウを選ぶ）
            </button>
          ) : (
            <button
              type="button"
              onClick={stop}
              className="flex items-center gap-1.5 rounded-lg bg-slate-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-slate-500"
            >
              <Square size={14} />
              キャプチャ停止
            </button>
          )}
          <button
            type="button"
            onClick={autoDetect}
            disabled={!capturing}
            className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
          >
            <ScanSearch size={13} />
            範囲を自動検出し直す
          </button>
          <button
            type="button"
            onClick={clearRegion}
            disabled={!region}
            className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
          >
            <X size={13} />
            範囲指定を解除（全体に戻す）
          </button>
          <button
            type="button"
            onClick={savePng}
            disabled={!capturing}
            className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
          >
            <Download size={13} />
            この画面を保存（540×960）
          </button>
          {tickInfo && (
            <span className="text-xs tabular-nums text-slate-400">
              {tickInfo}
            </span>
          )}
        </div>
        {error && (
          <p className="mb-3 text-sm font-semibold text-red-500">{error}</p>
        )}
        {autoMsg && (
          <p className="mb-3 text-xs font-semibold text-blue-600">{autoMsg}</p>
        )}

        <div className="flex flex-col gap-4 lg:flex-row">
          {/* 取り込みプレビュー＋範囲指定（範囲ドラッグできる最小限の大きさに抑える） */}
          <section className="min-w-0 w-full max-w-md shrink-0">
            <h2 className="mb-1.5 text-sm font-bold text-slate-700">
              取り込みプレビュー
              <span className="ml-2 text-xs font-normal text-slate-400">
                ゲーム画面の部分をドラッグで囲ってください（枠・黒帯は含めない）
              </span>
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
              <video
                ref={videoRef}
                muted
                playsInline
                className="block w-full"
              />
              {!capturing && (
                <div className="flex aspect-video w-full items-center justify-center text-sm text-slate-400">
                  「キャプチャ開始」を押して、学マスのウィンドウを選んでください
                </div>
              )}
              {/* 選択矩形（外側を暗くして分かりやすく） */}
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
            {region && (
              <p className="mt-1 text-xs tabular-nums text-slate-400">
                選択範囲: x{region.x} y{region.y} / {region.w}×{region.h}
                （次回も自動で復元されます）
              </p>
            )}
          </section>

          {/* 正規化プレビュー */}
          <section className="shrink-0">
            <h2 className="mb-1.5 text-sm font-bold text-slate-700">
              正規化プレビュー（540×960）
              <span className="ml-2 text-xs font-normal text-slate-400">
                判定はこの画像に対して行います
              </span>
            </h2>
            <canvas
              ref={canvasRef}
              width={WORK_W}
              height={WORK_H}
              className="h-[320px] w-[180px] rounded-xl border border-slate-300 bg-slate-900"
            />
          </section>

          {/* 画面判定（目印の一致度） */}
          <section className="w-full shrink-0 lg:w-64">
            <h2 className="mb-1.5 text-sm font-bold text-slate-700">
              画面判定
            </h2>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-400">今の画面</p>
              <p className="mb-2 text-lg font-bold text-blue-700">
                {analysis ? (SCREEN_LABELS[analysis.screen] ?? "—") : "—"}
              </p>
              <table className="w-full text-xs tabular-nums">
                <tbody>
                  {TEMPLATE_KEYS.map((key) => {
                    const score = analysis?.scores[key] ?? 0;
                    const hit = score >= (DEFAULT_THRESHOLDS[key] ?? 1);
                    return (
                      <tr key={key} className="border-t border-slate-100">
                        <td className="py-1 text-slate-500">
                          {LANDMARK_LABELS[key]}
                        </td>
                        <td
                          className={`py-1 text-right font-semibold ${
                            hit ? "text-emerald-600" : "text-slate-400"
                          }`}
                        >
                          {score.toFixed(3)}
                          {hit ? " ✓" : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* イベント検出（サポカ読み取り後に有効になる） */}
              <table className="mt-2 w-full border-t border-slate-200 text-xs tabular-nums">
                <tbody>
                  <tr>
                    <td className="py-1 text-slate-500">イベント絵</td>
                    <td
                      className={`py-1 text-right font-semibold ${
                        analysis?.screen === "event"
                          ? "text-emerald-600"
                          : "text-slate-400"
                      }`}
                    >
                      {analysis && team
                        ? `${analysis.eventCard !== null ? `${analysis.eventCard + 1}枚目 ` : ""}${(analysis.scores.event ?? 0).toFixed(3)}`
                        : "—"}
                    </td>
                  </tr>
                  <tr className="border-t border-slate-100">
                    <td className="py-1 text-slate-500">絵上ノイズ</td>
                    <td
                      className={`py-1 text-right font-semibold ${
                        analysis && analysis.eventClear
                          ? "text-emerald-600"
                          : "text-slate-400"
                      }`}
                    >
                      {analysis && team
                        ? `${(analysis.scores.event_top ?? 0).toFixed(3)}（≦${EVENT_TOP_MAX}）`
                        : "—"}
                    </td>
                  </tr>
                  <tr className="border-t border-slate-100">
                    <td className="py-1 text-slate-500">スキルカード</td>
                    <td
                      className={`py-1 text-right font-semibold ${
                        analysis?.skillCard
                          ? "text-emerald-600"
                          : "text-slate-400"
                      }`}
                    >
                      {analysis?.skillCard ? "検出 ✓" : "—"}
                    </td>
                  </tr>
                  <tr className="border-t border-slate-100">
                    <td className="py-1 text-slate-500">日数表示</td>
                    <td
                      className={`py-1 text-right font-semibold ${
                        analysis?.dayMask
                          ? "text-emerald-600"
                          : "text-slate-400"
                      }`}
                    >
                      {analysis?.dayMask ? "読み取り中 ✓" : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
              {analysis && (
                <p className="mt-2 text-[10px] text-slate-400">
                  判定 {analysis.elapsedMs.toFixed(0)}ms／
                  {TICK_MS}ms周期
                </p>
              )}
            </div>
          </section>
        </div>

        {/* 記録の状態・ログ */}
        <section className="mt-4">
          <TrackerStatusPanel
            stateLabel={trackerRef.current.stateLabel()}
            run={trackerRef.current.run}
            paused={trackerRef.current.paused}
            capturing={capturing}
            log={log}
            onTogglePause={() => {
              pushLog(
                trackerRef.current.setPaused(
                  !trackerRef.current.paused,
                  Date.now() / 1000,
                ),
              );
              setRunTick((t) => t + 1);
            }}
            onDropRun={() => {
              const id = trackerRef.current.run?.id;
              trackerRef.current.dropRun();
              if (id) setRuns(deleteRun(id));
              pushLog(["今の育成の記録を捨てました"]);
            }}
          />
        </section>

        {/* サポカ読み取り＋手動記録 */}
        <section className="mt-4">
          <h2 className="mb-1.5 flex items-center gap-2 text-sm font-bold text-slate-700">
            編成サポカ
            <span className="text-xs font-normal text-slate-400">
              名前をクリックで変更／ボタンで手動記録もできます
            </span>
            {team && (
              <button
                type="button"
                onClick={clearCards}
                className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-100"
              >
                選択解除
              </button>
            )}
          </h2>
          {team ? (
            <div className="flex flex-wrap items-start gap-2">
              {team.thumbs.map((url, i) => (
                <div key={i} className="w-24">
                  <div
                    className={`relative overflow-hidden rounded border-2 ${
                      analysis?.screen === "event" && analysis.eventCard === i
                        ? "border-emerald-500"
                        : "border-slate-200"
                    }`}
                  >
                    {url ? (
                      <img
                        src={url}
                        alt={`サポカ${i + 1}`}
                        className="h-12 w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-full items-center justify-center bg-slate-100 text-[10px] text-slate-400">
                        空き
                      </div>
                    )}
                    <span className="absolute left-0 top-0 bg-slate-900/60 px-1 text-[10px] font-bold text-white">
                      {i + 1}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => renameCard(i)}
                    title="名前を変更"
                    className="mt-0.5 w-full truncate text-center text-[10px] text-slate-500 hover:text-blue-600 hover:underline"
                  >
                    {team.names[i] || `サポカ${i + 1}`}
                  </button>
                  <div className="mt-0.5 flex justify-center gap-0.5">
                    {(
                      [
                        ["pre", "前"],
                        ["post", "後"],
                        ["status", "ス"],
                      ] as [EventKind, string][]
                    ).map(([kind, label]) => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => recordManual(i, kind)}
                        title={`${label}イベを手動で記録`}
                        className="h-5 w-6 rounded bg-slate-100 text-[10px] font-bold text-slate-500 transition hover:bg-blue-600 hover:text-white"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-400">
              まだ読み取っていません。プロデュースの「4.
              開始確認」画面（または編成情報ページ）を映すと、編成サポカ6枚を自動で読み取って、イベントの記録が始まります。
            </p>
          )}
        </section>

        {/* 今の育成のイベント・統計・記録一覧 */}
        <section className="mt-4 flex flex-col gap-4">
          <CurrentEventsPanel
            run={trackerRef.current.run}
            team={team}
            onDeleteEvent={deleteCurrentEvent}
          />
          <StatsPanel
            runs={runs.filter((r) => r.teamId === team?.id)}
            team={team}
          />
          <RunListPanel
            runs={runs.filter((r) => r.teamId === team?.id)}
            onDelete={(id) => setRuns(deleteRun(id))}
          />
        </section>

        {/* 使い方 */}
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-600">
          <h2 className="mb-2 font-bold text-slate-800">使い方（現在できること）</h2>
          <ol className="list-decimal space-y-1 pl-5">
            <li>DMM版の学マスを起動して、育成画面を表示しておく</li>
            <li>
              「キャプチャ開始」を押して、共有ダイアログで「ウィンドウ」→ gakumas
              を選ぶ
            </li>
            <li>
              ゲーム画面の範囲は自動で検出されます（ずれている時だけプレビューをドラッグして調整）
            </li>
            <li>
              「画面判定」に今の画面（スケジュール選択・試験中など）がリアルタイムで表示されればOK
            </li>
            <li>
              プロデュースの「4.
              開始確認」画面（または編成情報ページ）が映ると、編成サポカ6枚を自動で読み取ります。以降、イベントシーンが出ると「どのサポカのイベントか」を自動判定します（該当サムネイルが緑枠になります）
            </li>
          </ol>
          <p className="mt-3 text-xs text-slate-400">
            ※ 映像はブラウザの中だけで処理され、どこにも送信されません。
            キャプチャ中はゲームのウィンドウを他のウィンドウで覆わないでください（共有映像も隠れます）。
            スマホ版のブラウザでは画面共有が使えないため、PC専用です。
          </p>
        </section>
      </main>
    </div>
  );
}
