/**
 * イベントカウンターの画面判定（Python版 gakumas_event_counter/detect.py の移植）。
 *
 * キャプチャ画像を 540x960 に揃えてから、目印画像（landmarks）を
 * テンプレートマッチ（OpenCV の TM_CCOEFF_NORMED と同じ式）で探して
 * 「今どの画面か」を判定する。座標・しきい値・優先順位は Python 版と同一。
 * （イベントシーンのサポカ照合・スキルカード検出は次フェーズで移植する）
 */

/** 判定の作業サイズ（detect.py の WORK_W/WORK_H と同じ） */
export const WORK_W = 540;
export const WORK_H = 960;

/** 目印を「探す」範囲 [x, y, w, h]（detect.py DEFAULT_SEARCH と同じ） */
export const DEFAULT_SEARCH: Record<string, [number, number, number, number]> =
  {
    start_tab: [80, 14, 150, 44],
    schedule: [166, 626, 208, 46],
    day_line: [14, 26, 150, 60],
    produce_end: [170, 720, 210, 62],
    produce_done: [300, 10, 210, 84],
    // 「突破ライン」は自分の順位によって左右に動くので、横いっぱい探す
    exam_line: [0, 34, 540, 54],
    info_page: [10, 15, 380, 55],
  };

/** 一致とみなす点数（detect.py DEFAULT_THRESHOLDS と同じ） */
export const DEFAULT_THRESHOLDS: Record<string, number> = {
  start_tab: 0.85,
  schedule: 0.8,
  day_line: 0.8,
  produce_end: 0.85,
  produce_done: 0.85,
  exam_line: 0.85,
  info_page: 0.85,
  support_card: 0.88,
};

/** 試験に「入る」ときに必要な突破ラインの一致度（detect.py EXAM_ENTER） */
export const EXAM_ENTER = 0.93;

export const TEMPLATE_KEYS = [
  "start_tab",
  "schedule",
  "day_line",
  "produce_end",
  "produce_done",
  "exam_line",
  "info_page",
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

/** 画面の種類 → 表示名 */
export const SCREEN_LABELS: Record<string, string> = {
  start: "プロデュース開始確認",
  schedule: "スケジュール選択",
  exam: "選抜試験中",
  done: "プロデュース完了",
  end: "ホーム画面",
  info: "編成情報ページ",
  event: "イベントシーン",
  other: "その他",
};

/** グレースケール画像（0..255 の Float32、行優先） */
export type GrayImage = { w: number; h: number; data: Float32Array };

/** RGBA の ImageData → グレースケール（cv2.COLOR_BGR2GRAY と同じ BT.601 係数） */
export function toGray(img: ImageData): GrayImage {
  const { width: w, height: h, data } = img;
  const out = new Float32Array(w * h);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return { w, h, data: out };
}

/** 範囲を画面内に収める（matcher.clamp_region と同じ） */
function clampRegion(
  region: [number, number, number, number],
  frameW: number,
  frameH: number,
): [number, number, number, number] {
  let [x, y, w, h] = region.map((v) => Math.trunc(v));
  x = Math.max(0, Math.min(x, frameW - 1));
  y = Math.max(0, Math.min(y, frameH - 1));
  w = Math.max(0, Math.min(w, frameW - x));
  h = Math.max(0, Math.min(h, frameH - y));
  return [x, y, w, h];
}

/** グレー画像から範囲を切り抜く */
export function cropGray(
  src: GrayImage,
  region: [number, number, number, number],
): GrayImage | null {
  const [x, y, w, h] = clampRegion(region, src.w, src.h);
  if (w < 2 || h < 2) return null;
  const out = new Float32Array(w * h);
  for (let row = 0; row < h; row++) {
    out.set(src.data.subarray((y + row) * src.w + x, (y + row) * src.w + x + w), row * w);
  }
  return { w, h, data: out };
}

/** 2x2平均で半分に縮小する（ピラミッド粗探索用） */
function halve(src: GrayImage): GrayImage {
  const w = Math.floor(src.w / 2);
  const h = Math.floor(src.h / 2);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = 2 * y * src.w + 2 * x;
      out[y * w + x] =
        (src.data[p] +
          src.data[p + 1] +
          src.data[p + src.w] +
          src.data[p + src.w + 1]) /
        4;
    }
  }
  return { w, h, data: out };
}

/**
 * NCC全探索（cv2 TM_CCOEFF_NORMED と同じ式）。win で探索窓を絞れる。
 * 式: 相関 = Σ(T'·W') / sqrt(ΣT'² · ΣW'²)（T', W' は各窓での平均引き）。
 * テンプレートは平均を引いておくと Σ(T'·W) だけで分子が出る（ΣT'=0 のため）。
 * 窓側の ΣW・ΣW² は積分画像で O(1) にする。
 */
function nccSearch(
  area: GrayImage,
  tpl: GrayImage,
  win?: { x0: number; y0: number; x1: number; y1: number },
): { score: number; x: number; y: number } {
  const { w: aw, h: ah, data: a } = area;
  const { w: tw, h: th, data: t } = tpl;
  if (tw > aw || th > ah) return { score: 0, x: 0, y: 0 };

  // テンプレートの平均引きとノルム
  let tMean = 0;
  for (let i = 0; i < t.length; i++) tMean += t[i];
  tMean /= t.length;
  const t0 = new Float32Array(t.length);
  let tNorm2 = 0;
  for (let i = 0; i < t.length; i++) {
    t0[i] = t[i] - tMean;
    tNorm2 += t0[i] * t0[i];
  }
  if (tNorm2 <= 1e-9) return { score: 0, x: 0, y: 0 };

  // 積分画像（和・二乗和）。サイズ (aw+1)x(ah+1)
  const iw = aw + 1;
  const sum = new Float64Array(iw * (ah + 1));
  const sq = new Float64Array(iw * (ah + 1));
  for (let y = 0; y < ah; y++) {
    let rowSum = 0;
    let rowSq = 0;
    for (let x = 0; x < aw; x++) {
      const v = a[y * aw + x];
      rowSum += v;
      rowSq += v * v;
      sum[(y + 1) * iw + x + 1] = sum[y * iw + x + 1] + rowSum;
      sq[(y + 1) * iw + x + 1] = sq[y * iw + x + 1] + rowSq;
    }
  }

  const n = tw * th;
  const maxX = aw - tw;
  const maxY = ah - th;
  const x0 = Math.max(0, win?.x0 ?? 0);
  const y0 = Math.max(0, win?.y0 ?? 0);
  const x1 = Math.min(maxX, win?.x1 ?? maxX);
  const y1 = Math.min(maxY, win?.y1 ?? maxY);
  let best = -2;
  let bx = x0;
  let by = y0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      // 分子: Σ t0 · W（窓の平均引きは ΣT'=0 なので不要）
      let dot = 0;
      for (let ty = 0; ty < th; ty++) {
        const aOff = (y + ty) * aw + x;
        const tOff = ty * tw;
        for (let tx = 0; tx < tw; tx++) {
          dot += t0[tOff + tx] * a[aOff + tx];
        }
      }
      const ws =
        sum[(y + th) * iw + x + tw] -
        sum[y * iw + x + tw] -
        sum[(y + th) * iw + x] +
        sum[y * iw + x];
      const wSq =
        sq[(y + th) * iw + x + tw] -
        sq[y * iw + x + tw] -
        sq[(y + th) * iw + x] +
        sq[y * iw + x];
      const wVar = wSq - (ws * ws) / n; // ΣW'²
      if (wVar <= 1e-9) continue;
      const score = dot / Math.sqrt(tNorm2 * wVar);
      if (score > best) {
        best = score;
        bx = x;
        by = y;
      }
    }
  }
  return { score: Math.max(0, best), x: bx, y: by };
}

/** 精査を諦めて全探索する計算量の上限（位置数×テンプレ画素数） */
const FULL_SEARCH_COST = 3_000_000;

/**
 * テンプレートマッチの最大値と位置。
 * 小さい探索は全探索、大きい探索は「1/2縮小で粗探索 → 最良位置の周囲±3pxを
 * 原寸で精査」の2段構え（縮小の平滑化でピークがなだらかになるので峰を外さない。
 * 実画面29枚の回帰テストで全探索と同一判定になることを確認済み）。
 */
export function matchTemplateMax(
  area: GrayImage,
  tpl: GrayImage,
): { score: number; x: number; y: number } {
  const positions = (area.w - tpl.w + 1) * (area.h - tpl.h + 1);
  if (
    positions <= 0 ||
    positions * tpl.w * tpl.h <= FULL_SEARCH_COST ||
    tpl.w < 12 ||
    tpl.h < 12
  ) {
    return nccSearch(area, tpl);
  }
  const coarse = nccSearch(halve(area), halve(tpl));
  const cx = coarse.x * 2;
  const cy = coarse.y * 2;
  return nccSearch(area, tpl, {
    x0: cx - 3,
    y0: cy - 3,
    x1: cx + 3,
    y1: cy + 3,
  });
}

/** 目印画像（public/event-counter/landmarks/*.png）を読み込む */
export async function loadLandmarks(): Promise<
  Partial<Record<TemplateKey, GrayImage>>
> {
  const out: Partial<Record<TemplateKey, GrayImage>> = {};
  await Promise.all(
    TEMPLATE_KEYS.map(async (key) => {
      try {
        const res = await fetch(`/event-counter/landmarks/${key}.png`);
        if (!res.ok) return;
        const bmp = await createImageBitmap(await res.blob());
        const canvas = document.createElement("canvas");
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(bmp, 0, 0);
        out[key] = toGray(ctx.getImageData(0, 0, bmp.width, bmp.height));
      } catch {
        // 読み込めない目印はスコア0扱い（analyze 側で欠けを許容）
      }
    }),
  );
  return out;
}

export type AnalyzeResult = {
  /** "start" | "schedule" | "exam" | "done" | "end" | "info" | "other" */
  screen: string;
  /** 目印ごとの一致度（調整表示用） */
  scores: Record<string, number>;
  /** 突破ラインが見えているか / はっきり見えているか */
  exam: boolean;
  examStrong: boolean;
  /** 目印が見つかった位置（将来の日数読み取り用） */
  positions: Partial<Record<TemplateKey, { x: number; y: number }>>;
  /** 判定にかかった時間（ms） */
  elapsedMs: number;
};

/**
 * 540x960 のフレームから今の画面を判定する（detect.py ScreenDetector.analyze の
 * 目印部分。イベントシーン・スキルカードは次フェーズ）。
 */
export function analyzeFrame(
  frame: ImageData,
  landmarks: Partial<Record<TemplateKey, GrayImage>>,
): AnalyzeResult {
  const t0 = performance.now();
  const gray = toGray(frame);
  const scores: Record<string, number> = {};
  const positions: AnalyzeResult["positions"] = {};
  for (const key of TEMPLATE_KEYS) {
    const tpl = landmarks[key];
    if (!tpl) {
      scores[key] = 0;
      continue;
    }
    const search = DEFAULT_SEARCH[key];
    const area = cropGray(gray, search);
    if (!area) {
      scores[key] = 0;
      continue;
    }
    const m = matchTemplateMax(area, tpl);
    scores[key] = m.score;
    positions[key] = { x: search[0] + m.x, y: search[1] + m.y };
  }

  const exam = (scores.exam_line ?? 0) >= DEFAULT_THRESHOLDS.exam_line;
  const examStrong = (scores.exam_line ?? 0) >= EXAM_ENTER;

  // どの画面かを決める（優先度の高い順。detect.py と同じ並び）
  let screen = "other";
  if ((scores.start_tab ?? 0) >= DEFAULT_THRESHOLDS.start_tab) screen = "start";
  else if ((scores.produce_done ?? 0) >= DEFAULT_THRESHOLDS.produce_done)
    screen = "done";
  else if ((scores.produce_end ?? 0) >= DEFAULT_THRESHOLDS.produce_end)
    screen = "end";
  else if ((scores.info_page ?? 0) >= DEFAULT_THRESHOLDS.info_page)
    screen = "info";
  else if (exam) screen = "exam";
  // （イベントシーンの判定はサポカ照合の移植後にここへ入る）
  else if ((scores.schedule ?? 0) >= DEFAULT_THRESHOLDS.schedule)
    screen = "schedule";

  return {
    screen,
    scores,
    exam,
    examStrong,
    positions,
    elapsedMs: performance.now() - t0,
  };
}
