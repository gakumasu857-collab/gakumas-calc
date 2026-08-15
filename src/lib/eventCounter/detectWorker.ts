/**
 * 画面判定を裏で回す Web Worker。
 * メインスレッドは 200ms ごとにフレーム(RGBA)を渡し、結果だけ受け取る
 * （イベント照合・スキルカード検出込みで1フレーム約100msかかるため、
 *   メインスレッドで回すとUIが固まる）。
 */
import {
  analyzeFrame,
  prepareCard,
  type CardTemplate,
  type GrayImage,
  type TemplateKey,
} from "./detect";

type GrayLike = { w: number; h: number; data: Float32Array };

let landmarks: Partial<Record<TemplateKey, GrayImage>> = {};
let cards: (CardTemplate | null)[] = [];

type InMessage =
  | { type: "landmarks"; landmarks: Record<string, GrayLike> }
  | { type: "cards"; cards: (GrayLike | null)[] }
  | { type: "frame"; w: number; h: number; buffer: ArrayBuffer };

self.onmessage = (e: MessageEvent<InMessage>) => {
  const msg = e.data;
  if (msg.type === "landmarks") {
    landmarks = {};
    for (const [key, v] of Object.entries(msg.landmarks)) {
      landmarks[key as TemplateKey] = {
        w: v.w,
        h: v.h,
        data: new Float32Array(v.data),
      };
    }
    return;
  }
  if (msg.type === "cards") {
    cards = msg.cards.map((c) =>
      c ? prepareCard({ w: c.w, h: c.h, data: new Float32Array(c.data) }) : null,
    );
    return;
  }
  // frame
  const frame = {
    width: msg.w,
    height: msg.h,
    data: new Uint8ClampedArray(msg.buffer),
  };
  const result = analyzeFrame(
    frame,
    landmarks,
    cards.length > 0 ? cards : undefined,
  );
  self.postMessage({ type: "result", result });
};
