import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, Download, Home, Square, X } from "lucide-react";

/**
 * イベントカウンター（開発中）。
 *
 * フェーズ1: 取り込みの土台。
 * 1. 画面共有（getDisplayMedia）でゲームウィンドウを取り込む
 * 2. プレビュー上でゲーム画面の範囲をドラッグ指定（ウィンドウ枠・タイトルバーを除く）
 * 3. 指定範囲を 540x960（判定の作業サイズ）へ正規化して約5Hzでプレビュー
 *
 * 検出・追跡・記録は今後のフェーズで載せる（Python版 gakumas_event_counter の
 * detect/tracker/stats を OpenCV.js で移植する予定）。判定は Python 版と同じく
 * 「540x960 に正規化してから」行うので、このページの正規化出力がそのまま入力になる。
 */

/** 判定の作業サイズ（Python版 detect.py の to_work_size と同じ） */
const WORK_W = 540;
const WORK_H = 960;
/** 正規化プレビューの更新間隔（ms）。判定も将来この周期で回す */
const TICK_MS = 200;
const REGION_KEY = "gakumas:eventCounterRegion:v1";

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

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCapturing(false);
    setVideoSize(null);
    setDrag(null);
    setTickInfo(null);
  }, []);

  /** ストリームを取り付ける（画面共有・開発検証の両方から使う） */
  const attachStream = useCallback(
    (s: MediaStream) => {
      stop();
      streamRef.current = s;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = s;
      void video.play().catch(() => undefined);
      video.onloadedmetadata = () => {
        setVideoSize({ w: video.videoWidth, h: video.videoHeight });
      };
      // 共有バーの「共有を停止」で止められたとき
      s.getVideoTracks()[0]?.addEventListener("ended", stop);
      setCapturing(true);
    },
    [stop],
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
              開発中
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

        <div className="flex flex-col gap-4 lg:flex-row">
          {/* 取り込みプレビュー＋範囲指定 */}
          <section className="min-w-0 flex-1">
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
              className="h-[480px] w-[270px] rounded-xl border border-slate-300 bg-slate-900"
            />
          </section>
        </div>

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
              左のプレビューで、ゲーム画面の部分（縦長の画面そのもの）をドラッグで囲う
            </li>
            <li>
              右の正規化プレビューがゲーム画面ぴったりになればOK（この画像が今後の自動判定の入力になります）
            </li>
          </ol>
          <p className="mt-3 text-xs text-slate-400">
            ※ 映像はブラウザの中だけで処理され、どこにも送信されません。
            イベントの自動検出・記録・統計は今後のアップデートで追加予定です（Windows版ツールの移植）。
            キャプチャ中はゲームのウィンドウを他のウィンドウで覆わないでください（共有映像も隠れます）。
            スマホ版のブラウザでは画面共有が使えないため、PC専用です。
          </p>
        </section>
      </main>
    </div>
  );
}
