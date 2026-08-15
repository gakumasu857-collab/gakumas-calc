/**
 * イベントカウンターの画面判定（Python版 gakumas_event_counter/detect.py の移植）。
 *
 * キャプチャ画像を 540x960 に揃えてから、
 * - 目印画像（landmarks）のテンプレートマッチ → 今どの画面か
 * - サポカ6枚のマルチスケール照合 → イベントシーンがどのカードか
 * - 中央の直線ペア検出 → スキルカード（後イベの目印）
 * - 日数の2値マスク → ターンの変わり目
 * を判定する。座標・しきい値・優先順位は Python 版と同一。
 * DOM に依存しない純関数のみ（Web Worker からも使う）。loadLandmarks だけは
 * メインスレッド専用（canvas を使うため）。
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

/** 探索範囲側の前計算（積分画像）。同じ範囲を何回も照合する時に使い回す */
type PreparedArea = {
  img: GrayImage;
  iw: number;
  sum: Float64Array;
  sq: Float64Array;
};

function prepareArea(img: GrayImage): PreparedArea {
  const { w: aw, h: ah, data: a } = img;
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
  return { img, iw, sum, sq };
}

/** テンプレート側の前計算（平均引きとノルム）。ノルムが無い(平坦)なら null */
type PreparedTpl = { w: number; h: number; t0: Float32Array; tNorm2: number };

function prepareTpl(img: GrayImage): PreparedTpl | null {
  const { w, h, data: t } = img;
  let tMean = 0;
  for (let i = 0; i < t.length; i++) tMean += t[i];
  tMean /= t.length;
  const t0 = new Float32Array(t.length);
  let tNorm2 = 0;
  for (let i = 0; i < t.length; i++) {
    t0[i] = t[i] - tMean;
    tNorm2 += t0[i] * t0[i];
  }
  return tNorm2 <= 1e-9 ? null : { w, h, t0, tNorm2 };
}

/**
 * NCC探索の本体（cv2 TM_CCOEFF_NORMED と同じ式）。win で探索窓を絞れる。
 * 式: 相関 = Σ(T'·W') / sqrt(ΣT'² · ΣW'²)（T', W' は各窓での平均引き）。
 * テンプレートは平均を引いてあるので分子は Σ(T'·W) だけでよい（ΣT'=0）。
 * 窓側の ΣW・ΣW² は積分画像で O(1)。
 */
function nccMax(
  area: PreparedArea,
  tpl: PreparedTpl,
  win?: { x0: number; y0: number; x1: number; y1: number },
): { score: number; x: number; y: number } {
  const { w: aw, h: ah, data: a } = area.img;
  const { iw, sum, sq } = area;
  const { w: tw, h: th, t0, tNorm2 } = tpl;
  if (tw > aw || th > ah) return { score: 0, x: 0, y: 0 };
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
      // ΣW'²。ほぼ平坦な窓は照合対象にしない（積分画像の桁落ちで分散が
      // 微小な正値になり、スコアが1超えに暴発する。cv2も平坦窓は0扱い）
      const wVar = wSq - (ws * ws) / n;
      if (wVar <= n * 0.1) continue;
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

/** 前計算なし版（目印など単発の照合用） */
function nccSearch(
  area: GrayImage,
  tpl: GrayImage,
  win?: { x0: number; y0: number; x1: number; y1: number },
): { score: number; x: number; y: number } {
  const prepared = prepareTpl(tpl);
  if (!prepared) return { score: 0, x: 0, y: 0 };
  return nccMax(prepareArea(area), prepared, win);
}

/** 画面の各部分の位置 [x, y, w, h]（detect.py DEFAULT_REGIONS の必要分） */
export const REGIONS: Record<string, [number, number, number, number]> = {
  event_card: [30, 344, 480, 272],
  event_top: [30, 110, 480, 220],
  support_grid: [49, 431, 249, 210],
  info_grid: [45, 86, 294, 254],
  skill_area: [130, 343, 280, 340],
};

const SUPPORT_COLS = 2;
const SUPPORT_ROWS = 3;
const SUPPORT_GAP = [7, 12] as const; // (横の空き, 縦の空き) px
/** カードの上から何割が「絵」か（下はLv表示とレア度のバー） */
export const SUPPORT_ART_RATIO = 0.62;
const INFO_CELL = [142, 72] as const;
const INFO_PITCH = [152, 91] as const;

/** 開始確認画面のサポカ6枚それぞれの範囲（左上から右へ、次の行へ） */
export function supportCardSlots(): [number, number, number, number][] {
  const [x, y, w, h] = REGIONS.support_grid;
  const [gapX, gapY] = SUPPORT_GAP;
  const cellW = (w - gapX * (SUPPORT_COLS - 1)) / SUPPORT_COLS;
  const cellH = (h - gapY * (SUPPORT_ROWS - 1)) / SUPPORT_ROWS;
  const slots: [number, number, number, number][] = [];
  for (let row = 0; row < SUPPORT_ROWS; row++) {
    for (let col = 0; col < SUPPORT_COLS; col++) {
      slots.push([
        Math.round(x + col * (cellW + gapX)),
        Math.round(y + row * (cellH + gapY)),
        Math.round(cellW),
        Math.round(cellH),
      ]);
    }
  }
  return slots;
}

/** 編成情報ページのサポカ6枚それぞれの範囲 */
export function infoCardSlots(): [number, number, number, number][] {
  const [x, y] = REGIONS.info_grid;
  const slots: [number, number, number, number][] = [];
  for (let row = 0; row < SUPPORT_ROWS; row++) {
    for (let col = 0; col < SUPPORT_COLS; col++) {
      slots.push([
        x + col * INFO_PITCH[0],
        y + row * INFO_PITCH[1],
        INFO_CELL[0],
        INFO_CELL[1],
      ]);
    }
  }
  return slots;
}

/** グレー画像の標準偏差（カードの明暗幅。空き枠判定・淡い絵のしきい値に使う） */
export function grayStd(img: GrayImage): number {
  let mean = 0;
  for (let i = 0; i < img.data.length; i++) mean += img.data[i];
  mean /= img.data.length;
  let varSum = 0;
  for (let i = 0; i < img.data.length; i++) {
    const d = img.data[i] - mean;
    varSum += d * d;
  }
  return Math.sqrt(varSum / img.data.length);
}

/** そこにカードが入っているか（空き枠は暗くて変化が少ない。detect.py _looks_like_card） */
export function looksLikeCard(piece: GrayImage): boolean {
  return grayStd(piece) >= 8.0;
}

/** 読み取ったサポカの写りの良さ（明暗幅の平均。暗転中の読み取りで上書きしないため） */
export function cardsQuality(cards: (GrayImage | null)[]): number {
  const values = cards.filter((c): c is GrayImage => c !== null).map(grayStd);
  return values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : 0;
}

/**
 * 面積平均のリサイズ（cv2 INTER_AREA の縮小相当）。
 * 出力画素ごとに元画像の対応する矩形の重み付き平均を取る。
 */
export function resizeArea(src: GrayImage, dw: number, dh: number): GrayImage {
  if (src.w === dw && src.h === dh) return src;
  const out = new Float32Array(dw * dh);
  const sx = src.w / dw;
  const sy = src.h / dh;
  for (let oy = 0; oy < dh; oy++) {
    const y0 = oy * sy;
    const y1 = Math.min(src.h, y0 + sy);
    for (let ox = 0; ox < dw; ox++) {
      const x0 = ox * sx;
      const x1 = Math.min(src.w, x0 + sx);
      let acc = 0;
      let wsum = 0;
      for (let y = Math.floor(y0); y < y1; y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        for (let x = Math.floor(x0); x < x1; x++) {
          const wx = Math.min(x + 1, x1) - Math.max(x, x0);
          acc += src.data[y * src.w + x] * wx * wy;
          wsum += wx * wy;
        }
      }
      out[oy * dw + ox] = wsum > 0 ? acc / wsum : 0;
    }
  }
  return { w: dw, h: dh, data: out };
}

/**
 * 3x3ガウスぼかし（cv2 GaussianBlur (3,3) 相当。境界は反射）。
 * 分離フィルタ＋内部は境界判定なしの直接アクセスで速くしてある。
 */
function blur3(src: GrayImage): GrayImage {
  const { w, h, data } = src;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  // 横方向
  for (let y = 0; y < h; y++) {
    const row = y * w;
    tmp[row] = (data[row + 1] + 2 * data[row] + data[row + 1]) / 4;
    for (let x = 1; x < w - 1; x++) {
      tmp[row + x] =
        (data[row + x - 1] + 2 * data[row + x] + data[row + x + 1]) / 4;
    }
    tmp[row + w - 1] =
      (data[row + w - 2] + 2 * data[row + w - 1] + data[row + w - 2]) / 4;
  }
  // 縦方向
  for (let x = 0; x < w; x++) {
    out[x] = (tmp[w + x] + 2 * tmp[x] + tmp[w + x]) / 4;
    out[(h - 1) * w + x] =
      (tmp[(h - 2) * w + x] + 2 * tmp[(h - 1) * w + x] + tmp[(h - 2) * w + x]) /
      4;
  }
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      out[row + x] = (tmp[row - w + x] + 2 * tmp[row + x] + tmp[row + w + x]) / 4;
    }
  }
  return { w, h, data: out };
}

/**
 * 3x3 Sobel（dx=true で横方向の変化。cv2 Sobel ksize=3 相当）。
 * 内部だけを直接アクセスで計算し、境界1pxは0のまま（用途はエッジ検出の
 * しきい値判定なので、枠1pxの欠けは判定に影響しない）。
 */
function sobel3(src: GrayImage, dx: boolean): Float32Array {
  const { w, h, data } = src;
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    const rm = (y - 1) * w;
    const r0 = y * w;
    const rp = (y + 1) * w;
    if (dx) {
      for (let x = 1; x < w - 1; x++) {
        out[r0 + x] =
          data[rm + x + 1] +
          2 * data[r0 + x + 1] +
          data[rp + x + 1] -
          data[rm + x - 1] -
          2 * data[r0 + x - 1] -
          data[rp + x - 1];
      }
    } else {
      for (let x = 1; x < w - 1; x++) {
        out[r0 + x] =
          data[rp + x - 1] +
          2 * data[rp + x] +
          data[rp + x + 1] -
          data[rm + x - 1] -
          2 * data[rm + x] -
          data[rm + x + 1];
      }
    }
  }
  return out;
}

/**
 * Canny エッジの密度（cv2.Canny(60, 150) 相当・L1勾配）。
 * 非最大抑制＋ヒステリシスまで実装し、エッジ画素の割合(0〜1)を返す。
 */
function cannyDensity(src: GrayImage, low = 60, high = 150): number {
  const blurred = blur3(src);
  const { w, h } = blurred;
  const gx = sobel3(blurred, true);
  const gy = sobel3(blurred, false);
  const mag = new Float32Array(w * h);
  for (let i = 0; i < mag.length; i++)
    mag[i] = Math.abs(gx[i]) + Math.abs(gy[i]);

  // 非最大抑制（勾配方向を4方向に量子化して、方向に沿った隣より大きい画素だけ残す）
  const TAN22 = 0.4142135623730951;
  const TAN67 = 2.414213562373095;
  const state = new Uint8Array(w * h); // 0=なし 1=弱 2=強
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const m = mag[i];
      if (m < low) continue;
      const ax = Math.abs(gx[i]);
      const ay = Math.abs(gy[i]);
      let m1: number;
      let m2: number;
      if (ay <= ax * TAN22) {
        m1 = mag[i - 1];
        m2 = mag[i + 1];
      } else if (ay >= ax * TAN67) {
        m1 = mag[i - w];
        m2 = mag[i + w];
      } else if (gx[i] * gy[i] > 0) {
        m1 = mag[i - w - 1];
        m2 = mag[i + w + 1];
      } else {
        m1 = mag[i - w + 1];
        m2 = mag[i + w - 1];
      }
      if (m >= m1 && m > m2) state[i] = m >= high ? 2 : 1;
    }
  }
  // ヒステリシス: 強エッジから8近傍でつながる弱エッジを昇格
  const stack: number[] = [];
  for (let i = 0; i < state.length; i++) if (state[i] === 2) stack.push(i);
  const offsets = [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1];
  while (stack.length) {
    const i = stack.pop()!;
    for (const o of offsets) {
      const j = i + o;
      if (j >= 0 && j < state.length && state[j] === 1) {
        state[j] = 2;
        stack.push(j);
      }
    }
  }
  let edges = 0;
  for (let i = 0; i < state.length; i++) if (state[i] === 2) edges++;
  return edges / (w * h);
}

/**
 * イベントの絵の上の範囲に、どれだけ「線」があるか(0〜1)。
 * 本物のイベントは無地のグラデーションでほぼ0、演出はUIが写り込んで上がる。
 */
export function topClutter(frameGray: GrayImage): number {
  const area = cropGray(frameGray, REGIONS.event_top);
  if (!area) return 1.0;
  return cannyDensity(area);
}

// ============================================================================
// スキルカードの検出（中央に大きく出てくるカードだけ。detect.py と同一）
// ============================================================================

export const DEFAULT_SKILL_PARAMS = {
  center_x: 270,
  center_y: 513,
  half_w_min: 62,
  half_w_max: 92,
  half_h_min: 84,
  half_h_max: 118,
  aspect: 0.76,
  aspect_tol: 0.08,
  gradient: 40,
  min_run: 60,
  tolerance: 3,
};

/** 2値の列で「縦(横)に min_run 以上つながっている所」だけ残す（1次元モルフォロジー開演算） */
function keepLongRuns(
  mask: Uint8Array,
  w: number,
  h: number,
  run: number,
  vertical: boolean,
): Uint8Array {
  const out = new Uint8Array(w * h);
  const outer = vertical ? w : h;
  const inner = vertical ? h : w;
  for (let o = 0; o < outer; o++) {
    let start = -1;
    for (let i = 0; i <= inner; i++) {
      const idx = vertical ? i * w + o : o * w + i;
      const on = i < inner && mask[idx] === 1;
      if (on && start < 0) start = i;
      if (!on && start >= 0) {
        if (i - start >= run) {
          for (let k = start; k < i; k++)
            out[vertical ? k * w + o : o * w + k] = 1;
        }
        start = -1;
      }
    }
  }
  return out;
}

/** 「線がある」場所を (位置, 長さ) で返す（detect.py _line_positions） */
function linePositions(
  profile: Int32Array,
  minLength: number,
): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  for (let i = 0; i <= profile.length; i++) {
    const value = i < profile.length ? profile[i] : 0;
    if (value >= minLength && start < 0) start = i;
    else if (value < minLength && start >= 0) {
      let bestOff = 0;
      for (let k = start; k < i; k++)
        if (profile[k] > profile[start + bestOff]) bestOff = k - start;
      out.push([start + bestOff, profile[start + bestOff]]);
      start = -1;
    }
  }
  return out;
}

/** 中心から左右(上下)に同じだけ離れた線の組（detect.py _symmetric_pairs） */
function symmetricPairs(
  positions: [number, number][],
  center: number,
  tol: number,
  minHalf: number,
  maxHalf: number,
): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < positions.length; i++) {
    const [a, lenA] = positions[i];
    if (a >= center) break;
    for (let j = i + 1; j < positions.length; j++) {
      const [b, lenB] = positions[j];
      if (b <= center) continue;
      if (Math.abs((a + b) / 2 - center) > tol) continue;
      const half = (b - a) / 2;
      if (half >= minHalf && half <= maxHalf) {
        pairs.push([Math.round(half), Math.min(lenA, lenB)]);
      }
    }
  }
  return pairs;
}

/** 中央に「スキルカード」が出ているか（後イベの目印） */
export function detectSkillCard(frameGray: GrayImage): {
  found: boolean;
  box: [number, number, number, number] | null;
} {
  const p = DEFAULT_SKILL_PARAMS;
  const region = REGIONS.skill_area;
  const area = cropGray(frameGray, region);
  if (!area || area.w < 40 || area.h < 40) return { found: false, box: null };

  const gray = blur3(area);
  const run = p.min_run;
  const { w, h } = gray;
  const gxAbs = sobel3(gray, true);
  const gyAbs = sobel3(gray, false);
  const strongX = new Uint8Array(w * h);
  const strongY = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (Math.abs(gxAbs[i]) > p.gradient) strongX[i] = 1;
    if (Math.abs(gyAbs[i]) > p.gradient) strongY[i] = 1;
  }
  const vertical = keepLongRuns(strongX, w, h, run, true);
  const horizontal = keepLongRuns(strongY, w, h, run, false);
  const colScore = new Int32Array(w);
  const rowScore = new Int32Array(h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      colScore[x] += vertical[y * w + x];
      rowScore[y] += horizontal[y * w + x];
    }

  const cx = p.center_x - region[0];
  const cy = p.center_y - region[1];
  const lo = p.aspect - p.aspect_tol;
  const hi = p.aspect + p.aspect_tol;
  const widths = symmetricPairs(
    linePositions(colScore, run),
    cx,
    p.tolerance,
    p.half_w_min,
    p.half_w_max,
  );
  const heights = symmetricPairs(
    linePositions(rowScore, run),
    cy,
    p.tolerance,
    p.half_h_min,
    p.half_h_max,
  );

  let best: [number, number, number] | null = null;
  for (const [halfW, scoreV] of widths) {
    for (const [halfH, scoreH] of heights) {
      const aspect = halfW / halfH;
      if (aspect < lo || aspect > hi) continue;
      const score = Math.min(scoreV, scoreH);
      if (!best || score > best[0]) best = [score, halfW, halfH];
    }
  }
  if (!best) return { found: false, box: null };
  const [, halfW, halfH] = best;
  return {
    found: true,
    box: [p.center_x - halfW, p.center_y - halfH, halfW * 2, halfH * 2],
  };
}

// ============================================================================
// 左上の日数表示（ターン数のもと。数字は読まず「変わったか」だけ見る）
// ============================================================================

export const DAY_NUMBER_OFFSET = [-6, 12, 68, 42] as const;
const DAY_NUMBER_DARK = 140;
const DAY_SAME_THRESHOLD = 0.9;

/** 日数の数字だけを白黒2値にして返す（読み取れなければ null） */
export function dayNumberMask(
  frameGray: GrayImage,
  linePos: { x: number; y: number },
): Uint8Array | null {
  const [ox, oy, w, h] = DAY_NUMBER_OFFSET;
  const piece = cropGray(frameGray, [linePos.x + ox, linePos.y + oy, w, h]);
  if (!piece || piece.w !== w || piece.h !== h) return null;
  const mask = new Uint8Array(w * h);
  let sum = 0;
  for (let i = 0; i < mask.length; i++) {
    if (piece.data[i] < DAY_NUMBER_DARK) {
      mask[i] = 1;
      sum++;
    }
  }
  // 文字がまったく無い(真っ白)ときは、読み取り失敗とみなす
  return sum >= 20 ? mask : null;
}

/** 2つの数字が同じかどうか（重なっている割合＝IoUで見る） */
export function sameDayNumber(
  a: Uint8Array | null,
  b: Uint8Array | null,
): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] | b[i]) union++;
    if (a[i] & b[i]) inter++;
  }
  if (union === 0) return true;
  return inter / union >= DAY_SAME_THRESHOLD;
}

// ============================================================================
// サポカの絵の照合（イベントシーン。detect.py CardMatcher と同一）
// ============================================================================

export const MATCH_W = 120;
export const MATCH_H = 68;
const MATCH_SCALES = Array.from({ length: 14 }, (_, i) =>
  Math.round((0.6 + 0.03 * i) * 100) / 100,
);
const PALE_CONTRAST = 48.0;
const PALE_SLOPE = 0.004;
const PALE_FLOOR = 0.86;

/** 照合用に前処理したサポカ1枚（何段階かの大きさの見本＋明暗幅） */
export type CardTemplate = {
  /** 各大きさの見本（原寸・1/2・1/4 をそれぞれ前計算済み） */
  variants: { full: PreparedTpl; half: PreparedTpl; quarter: PreparedTpl }[];
  contrast: number;
};

/** サポカ1枚（グレー全体）→ 照合用テンプレート（絵の上62%を14段階に縮小） */
export function prepareCard(cardGray: GrayImage): CardTemplate {
  const artH = Math.max(2, Math.trunc(cardGray.h * SUPPORT_ART_RATIO));
  const art = cropGray(cardGray, [0, 0, cardGray.w, artH]);
  const variants: CardTemplate["variants"] = [];
  if (art && art.w >= 2 && art.h >= 2) {
    for (const scale of MATCH_SCALES) {
      const w = Math.round(MATCH_W * scale);
      const h = Math.max(2, Math.round((w * art.h) / art.w));
      if (w < 8 || w > MATCH_W || h > MATCH_H) continue;
      const resized = resizeArea(art, w, h);
      const halved = halve(resized);
      const quartered = halve(halved);
      if (quartered.w < 2 || quartered.h < 2) continue;
      const full = prepareTpl(resized);
      const half = prepareTpl(halved);
      const quarter = prepareTpl(quartered);
      if (full && half && quarter) variants.push({ full, half, quarter });
    }
  }
  return { variants, contrast: grayStd(cardGray) };
}

/** このカードを本物のイベントとみなす一致度（淡い絵は少し下げる） */
export function thresholdFor(
  card: CardTemplate | null | undefined,
  base: number,
): number {
  if (!card) return base;
  const contrast = card.contrast;
  if (contrast <= 0 || contrast >= PALE_CONTRAST) return base;
  return Math.max(PALE_FLOOR, base - (PALE_CONTRAST - contrast) * PALE_SLOPE);
}

/**
 * イベントシーンの範囲から (何枚目か, 一致度) を求める。
 * 各カード・各大きさごとに「1/2縮小で位置の粗探索 → 原寸で周囲±3pxを精査」し、
 * 精査後の一致度で勝者を決める（縮小スコアで候補を絞ると本命の大きさを
 * 取りこぼすことがあるため、絞るのは位置だけにする）。
 */
/** 原寸精査に進める候補数の上限と、1位からの許容差（1/2縮小スコア基準） */
const REFINE_TOP = 12;
const REFINE_MARGIN = 0.06;

export function bestCardMatch(
  eventArea: GrayImage,
  cards: (CardTemplate | null)[],
): { index: number | null; score: number } {
  const small = prepareArea(resizeArea(eventArea, MATCH_W, MATCH_H));
  const smallHalf = prepareArea(halve(small.img));
  const smallQuarter = prepareArea(halve(smallHalf.img));

  // 1/4縮小で位置の粗探索 → 1/2縮小で位置を確定しつつ候補のスコアを出す
  type Candidate = {
    index: number;
    variant: CardTemplate["variants"][number];
    halfScore: number;
    hx: number;
    hy: number;
  };
  const candidates: Candidate[] = [];
  cards.forEach((card, index) => {
    if (!card) return;
    for (const variant of card.variants) {
      const c4 = nccMax(smallQuarter, variant.quarter);
      const c2 = nccMax(smallHalf, variant.half, {
        x0: c4.x * 2 - 1,
        y0: c4.y * 2 - 1,
        x1: c4.x * 2 + 1,
        y1: c4.y * 2 + 1,
      });
      candidates.push({
        index,
        variant,
        halfScore: c2.score,
        hx: c2.x,
        hy: c2.y,
      });
    }
  });
  if (candidates.length === 0) return { index: null, score: 0 };

  // 有望な候補だけを原寸で精査（しきい値判定に使うスコアは必ず原寸の値）
  candidates.sort((a, b) => b.halfScore - a.halfScore);
  const cutoff = candidates[0].halfScore - REFINE_MARGIN;
  let bestIndex: number | null = null;
  let bestScore = 0;
  for (const c of candidates.slice(0, REFINE_TOP)) {
    if (c.halfScore < cutoff) break;
    const fine = nccMax(small, c.variant.full, {
      x0: c.hx * 2 - 1,
      y0: c.hy * 2 - 1,
      x1: c.hx * 2 + 1,
      y1: c.hy * 2 + 1,
    });
    if (fine.score > bestScore) {
      bestScore = fine.score;
      bestIndex = c.index;
    }
  }
  return { index: bestIndex, score: bestScore };
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
  /** "start" | "schedule" | "event" | "exam" | "done" | "end" | "info" | "other" */
  screen: string;
  /** 目印ごとの一致度（調整表示用。event / event_top も入る） */
  scores: Record<string, number>;
  /** 突破ラインが見えているか / はっきり見えているか */
  exam: boolean;
  examStrong: boolean;
  /** 目印が見つかった位置 */
  positions: Partial<Record<TemplateKey, { x: number; y: number }>>;
  /** イベントシーンで一致したサポカの番号（0始まり。無ければ null） */
  eventCard: number | null;
  /** その一致度 / 絵の上が無地か（本物のイベントの条件） */
  eventScore: number;
  eventClear: boolean;
  /** 中央にスキルカードが出ているか（後イベの目印）とその場所 */
  skillCard: boolean;
  skillBox: [number, number, number, number] | null;
  /** 左上の日数の2値マスク（見えない時は null。変わったら1ターン進む） */
  dayMask: Uint8Array | null;
  /** 判定にかかった時間（ms） */
  elapsedMs: number;
};

/** 540x960 のフレームから今の画面を判定する（detect.py ScreenDetector.analyze 相当） */
export function analyzeFrame(
  frame: { width: number; height: number; data: Uint8ClampedArray },
  landmarks: Partial<Record<TemplateKey, GrayImage>>,
  cards?: (CardTemplate | null)[],
): AnalyzeResult {
  const t0 = performance.now();
  const gray = toGray(frame as ImageData);
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

  // 左上の日数表示 → ターン数のもとになる数字
  let dayMask: Uint8Array | null = null;
  if ((scores.day_line ?? 0) >= DEFAULT_THRESHOLDS.day_line) {
    const pos = positions.day_line;
    if (pos) dayMask = dayNumberMask(gray, pos);
  }

  const exam = (scores.exam_line ?? 0) >= DEFAULT_THRESHOLDS.exam_line;
  const examStrong = (scores.exam_line ?? 0) >= EXAM_ENTER;

  // 目印だけで画面が確定するフレームか（イベントシーンに目印は出ないので、
  // そういうフレームではイベント照合を省いても判定結果は変わらない。
  // 毎フレームの照合コストを抑えるための省略で、Python版と同じ判定になる）
  const landmarkScreen =
    (scores.start_tab ?? 0) >= DEFAULT_THRESHOLDS.start_tab ||
    (scores.produce_done ?? 0) >= DEFAULT_THRESHOLDS.produce_done ||
    (scores.produce_end ?? 0) >= DEFAULT_THRESHOLDS.produce_end ||
    (scores.info_page ?? 0) >= DEFAULT_THRESHOLDS.info_page ||
    exam ||
    (scores.schedule ?? 0) >= DEFAULT_THRESHOLDS.schedule;

  // イベントシーン（中央のサポカの絵）。本物は絵の上が無地であることも確かめる
  let eventCard: number | null = null;
  let eventScore = 0;
  let eventClear = false;
  const hasCards = !!cards && cards.some((c) => c !== null);
  if (hasCards && !landmarkScreen) {
    const area = cropGray(gray, REGIONS.event_card);
    if (area) {
      const m = bestCardMatch(area, cards!);
      eventCard = m.index;
      eventScore = m.score;
      const clutter = topClutter(gray);
      eventClear = clutter <= EVENT_TOP_MAX;
      scores.event = m.score;
      scores.event_top = clutter;
    }
  }

  // スキルカード（後イベの目印）
  const skill = detectSkillCard(gray);

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
  else if (
    hasCards &&
    eventScore >=
      thresholdFor(
        eventCard !== null ? cards![eventCard] : null,
        DEFAULT_THRESHOLDS.support_card,
      ) &&
    eventClear
  )
    screen = "event";
  else if ((scores.schedule ?? 0) >= DEFAULT_THRESHOLDS.schedule)
    screen = "schedule";

  return {
    screen,
    scores,
    exam,
    examStrong,
    positions,
    eventCard,
    eventScore,
    eventClear,
    skillCard: skill.found,
    skillBox: skill.box,
    dayMask,
    elapsedMs: performance.now() - t0,
  };
}

/** イベントシーンでの追加判定用しきい値（detect.py EVENT_TOP_MAX） */
export const EVENT_TOP_MAX = 0.052;

// ============================================================================
// サポカ6枚の切り出し（開始確認画面・編成情報ページ）
// ============================================================================

/** ImageData から範囲を切り抜く（サムネイル用。カラーのまま） */
export function cropImageData(
  src: { width: number; height: number; data: Uint8ClampedArray },
  region: [number, number, number, number],
): ImageData | null {
  const [x, y, w, h] = region;
  if (x < 0 || y < 0 || x + w > src.width || y + h > src.height || w < 2 || h < 2)
    return null;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) {
    const srcOff = ((y + row) * src.width + x) * 4;
    out.set(src.data.subarray(srcOff, srcOff + w * 4), row * w * 4);
  }
  return new ImageData(out, w, h);
}

export type ExtractedCard = { thumb: ImageData; gray: GrayImage };

/**
 * 540x960 フレームからサポカ6枚を切り出す（空き枠・読み取り不能は null）。
 * source: "start"=開始確認画面 / "info"=編成情報ページ
 */
export function extractCards(
  frame: { width: number; height: number; data: Uint8ClampedArray },
  source: "start" | "info",
): (ExtractedCard | null)[] {
  const slots = source === "start" ? supportCardSlots() : infoCardSlots();
  return slots.map((slot) => {
    const thumb = cropImageData(frame, slot);
    if (!thumb) return null;
    const gray = toGray(thumb);
    if (!looksLikeCard(gray)) return null;
    return { thumb, gray };
  });
}
