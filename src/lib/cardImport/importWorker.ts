/**
 * サポカ所持読み取りの Web Worker。
 * init でスプライト画像からライブラリ指紋を構築し、frame ごとにタイル照合を返す。
 * フレームのバッファは transfer で受け取り、使い終わったら返す（再利用）。
 */
import { analyzeListFrame, buildLibrary, type Library } from "./match";

type InitMsg = {
  type: "init";
  sprite: ArrayBuffer;
  width: number;
  height: number;
  count: number;
  cellW: number;
  cellH: number;
  cols: number;
};
type FrameMsg = { type: "frame"; rgba: ArrayBuffer; width: number; height: number };

let lib: Library | null = null;

self.onmessage = (e: MessageEvent<InitMsg | FrameMsg>) => {
  const msg = e.data;
  if (msg.type === "init") {
    lib = buildLibrary(
      new Uint8ClampedArray(msg.sprite),
      msg.width,
      msg.count,
      msg.cellW,
      msg.cellH,
      msg.cols,
    );
    self.postMessage({ type: "ready", count: lib.count });
    return;
  }
  if (msg.type === "frame") {
    if (!lib) return;
    const rgba = new Uint8ClampedArray(msg.rgba);
    const tiles = analyzeListFrame(rgba, msg.width, msg.height, lib);
    // バッファは呼び出し側に返して再利用してもらう
    (self as unknown as Worker).postMessage({ type: "result", tiles, rgba: msg.rgba }, [
      msg.rgba,
    ]);
  }
};
