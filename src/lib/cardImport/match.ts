/**
 * サポカ所持の画面キャプチャ読み取り（/card-import）の照合ロジック。
 *
 * ゲームのサポカ一覧（正規化540x960）から:
 * - タイル行の検出: タイル間の背景がほぼ白なので「白率>0.9の横帯」を行境界にする
 * - カード同定: タイルのアート上部(156x56)を20x8RGB指紋にし、
 *   ライブラリ画像（スプライト80x45）から作った複数窓（スケール×位置=40通り）の
 *   指紋との正規化相関の最大値で照合する（ゲームのリスト用切り抜きはカードごとに
 *   ズーム・位置が違うため、複数窓で吸収する。実測: 手持ちスクショ117タイルで
 *   94/117がスコア0.8超、低スコアはシート未収録カード等）
 * - 凸数: Lvの桁数で開始xが変わる4つの凸マーク（白=点灯）を、
 *   両仮説（1桁=x30.5 / 2桁=x46.5、間隔16.2）×局所探索(±4px)で判定する
 *
 * すべて 540x960 の RGBA バッファ上で動く純ロジック（Worker から使う）。
 */

/** 正規化フレームの寸法 */
export const FRAME_W = 540;
export const FRAME_H = 960;

/** タイルの基準サイズ（540x960基準の実測値。検出タイルはこの寸法へ正規化する） */
export const TILE_W = 160;
export const TILE_H = 91;
/** タイル内アート（白枠2pxを除く）の幅と、指紋に使う上部の高さ */
const ART_W = 156;
const ART_H = 56;

/** 指紋サイズ（RGB） */
const FP_W = 20;
const FP_H = 8;
const FP_LEN = FP_W * FP_H * 3;
/** 粗選別用の縮約指紋（20x8 → 5x2 に平均、RGB 30値） */
const COARSE_LEN = 5 * 2 * 3;
/** 粗選別で残す候補数 */
const COARSE_TOP = 24;

/** アート領域のアスペクト（ライブラリ窓の高さ計算に使う） */
const FP_ASPECT = ART_W / ART_H;
/** ライブラリ窓のスケール候補（ゲームのリスト切り抜きのズーム差を吸収） */
const SCALES = [1.0, 1.15, 1.3, 1.5] as const;
const Y_OFFSETS = [0, 1 / 3, 2 / 3, 1] as const;

export type TileMatch = {
  /** フレーム内でのタイル位置（表示・切り抜き用） */
  rect: { x: number; y: number; w: number; h: number };
  /** ライブラリ（スプライトnames）のインデックス。照合不能は -1 */
  index: number;
  score: number;
  /** 1位と2位のスコア差（小さいと紛らわしい） */
  margin: number;
  /** 凸数 0..4 */
  tsuki: number;
  /** 凸判定が明確だったか（曖昧なら手動確認推奨） */
  tsukiOk: boolean;
};

/** ベクトルを平均0・ノルム1に正規化する */
function normalize(v: Float32Array): Float32Array {
  let mean = 0;
  for (let i = 0; i < v.length; i++) mean += v[i];
  mean /= v.length;
  let ss = 0;
  for (let i = 0; i < v.length; i++) {
    v[i] -= mean;
    ss += v[i] * v[i];
  }
  const norm = Math.sqrt(ss) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** RGBA画像の矩形(x0,y0,w,h)を FP_W x FP_H のRGB指紋にする（箱平均） */
function fpFromRegion(
  rgba: Uint8ClampedArray,
  imgW: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
): Float32Array {
  const out = new Float32Array(FP_LEN);
  for (let j = 0; j < FP_H; j++) {
    const ys = y0 + (j * h) / FP_H;
    const ye = y0 + ((j + 1) * h) / FP_H;
    for (let i = 0; i < FP_W; i++) {
      const xs = x0 + (i * w) / FP_W;
      const xe = x0 + ((i + 1) * w) / FP_W;
      let r = 0,
        g = 0,
        b = 0,
        n = 0;
      for (let y = Math.floor(ys); y < ye; y++) {
        for (let x = Math.floor(xs); x < xe; x++) {
          const idx = (y * imgW + x) * 4;
          r += rgba[idx];
          g += rgba[idx + 1];
          b += rgba[idx + 2];
          n++;
        }
      }
      const o = (j * FP_W + i) * 3;
      if (n > 0) {
        out[o] = r / n;
        out[o + 1] = g / n;
        out[o + 2] = b / n;
      }
    }
  }
  return normalize(out);
}

/** 正規化済み指紋 → 粗選別用の縮約指紋（4x4セル平均で 5x2）*/
function coarseOf(fp: Float32Array): Float32Array {
  const out = new Float32Array(COARSE_LEN);
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 5; i++) {
      let r = 0,
        g = 0,
        b = 0;
      for (let dj = 0; dj < 4; dj++) {
        for (let di = 0; di < 4; di++) {
          const o = ((j * 4 + dj) * FP_W + (i * 4 + di)) * 3;
          r += fp[o];
          g += fp[o + 1];
          b += fp[o + 2];
        }
      }
      const o = (j * 5 + i) * 3;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
    }
  }
  return normalize(out);
}

export type Library = {
  count: number;
  /** [cardIndex][variant] の指紋 */
  fine: Float32Array[][];
  coarse: Float32Array[][];
};

/**
 * スプライト画像（cellW x cellH のサムネイルがcols列で並ぶ）からライブラリを作る。
 * 各カードにつき スケール4 x 縦4 x 横(1or3) = 40窓 の指紋を持つ。
 */
export function buildLibrary(
  rgba: Uint8ClampedArray,
  imgW: number,
  count: number,
  cellW: number,
  cellH: number,
  cols: number,
): Library {
  const fine: Float32Array[][] = [];
  const coarse: Float32Array[][] = [];
  // 16:9の元画像に幅1/scale・アスペクトFP_ASPECTの窓を置いたときの、サムネ座標系での窓高
  const baseWinH = ((16 / 9) * cellH) / FP_ASPECT;
  for (let c = 0; c < count; c++) {
    const cellX = (c % cols) * cellW;
    const cellY = Math.floor(c / cols) * cellH;
    const fps: Float32Array[] = [];
    for (const scale of SCALES) {
      const winW = cellW / scale;
      const winH = baseWinH / scale;
      if (winH > cellH) continue;
      const xs = scale === 1.0 ? [0.5] : [0.25, 0.5, 0.75];
      for (const fx of xs) {
        const x0 = cellX + (cellW - winW) * fx;
        for (const fy of Y_OFFSETS) {
          const y0 = cellY + (cellH - winH) * fy;
          fps.push(fpFromRegion(rgba, imgW, x0, y0, winW, winH));
        }
      }
    }
    fine.push(fps);
    coarse.push(fps.map(coarseOf));
  }
  return { count, fine, coarse };
}

export type TileRect = { x: number; y: number; w: number; h: number };

/**
 * タイル格子の検出。
 * 領域指定が多少ズレてスケールが狂っても読めるよう、格子は毎フレーム動的に見つける:
 * 1) 白率>0.9 の横帯（タイル間の背景）で行境界を出す（高さ78..110を行とみなす）
 * 2) 行内で白率>0.85 の縦ラインの束（左右余白と列間ギャップ）を出し、
 *    その間の幅140..185の区間をタイルとする（3列そろった行だけ採用）
 * 見つけたタイルは後段で 160x91 の基準サイズにリサンプルしてから照合する。
 */
export function findTileGrid(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
): TileRect[] {
  const bandAt: boolean[] = new Array(h);
  for (let y = 0; y < h; y++) {
    let white = 0,
      n = 0;
    for (let x = 15; x < w - 15; x += 3) {
      const i = (y * w + x) * 4;
      if (rgba[i] > 235 && rgba[i + 1] > 235 && rgba[i + 2] > 235) white++;
      n++;
    }
    bandAt[y] = white / n > 0.9;
  }
  const bands: [number, number][] = [];
  let run: [number, number] | null = null;
  for (let y = 0; y < h; y++) {
    if (bandAt[y]) {
      if (!run) run = [y, y];
      else run[1] = y;
    } else if (run) {
      bands.push(run);
      run = null;
    }
  }
  if (run) bands.push(run);

  const tiles: TileRect[] = [];
  for (let i = 0; i + 1 < bands.length; i++) {
    const top = bands[i][1] + 1;
    const bot = bands[i + 1][0] - 1;
    const rowH = bot - top + 1;
    if (rowH < 78 || rowH > 110) continue;
    // 行内の白い縦ライン（余白・列間ギャップ）を検出
    const gapAt: boolean[] = new Array(w).fill(false);
    for (let x = 0; x < w; x++) {
      let white = 0,
        n = 0;
      for (let y = top + 2; y < bot - 2; y += 2) {
        const idx = (y * w + x) * 4;
        if (rgba[idx] > 235 && rgba[idx + 1] > 235 && rgba[idx + 2] > 235)
          white++;
        n++;
      }
      gapAt[x] = white / n > 0.85;
    }
    // ギャップ間の幅140..185の区間をタイルに
    const rowTiles: TileRect[] = [];
    let gapEnd = -1;
    let x = 0;
    while (x < w) {
      if (gapAt[x]) {
        gapEnd = x;
        x++;
        continue;
      }
      // 非ギャップ区間 [x, next)
      let next = x;
      while (next < w && !gapAt[next]) next++;
      const width = next - x;
      if (gapEnd >= 0 && next < w && width >= 140 && width <= 185) {
        rowTiles.push({ x, y: top, w: width, h: rowH });
      }
      x = next;
    }
    if (rowTiles.length === 3) tiles.push(...rowTiles);
  }
  return tiles;
}

/** タイルを基準サイズ 160x91 のRGBAへ箱平均でリサンプルする */
export function normalizeTile(
  rgba: Uint8ClampedArray,
  imgW: number,
  rect: TileRect,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(TILE_W * TILE_H * 4);
  for (let j = 0; j < TILE_H; j++) {
    const ys = rect.y + (j * rect.h) / TILE_H;
    const ye = rect.y + ((j + 1) * rect.h) / TILE_H;
    for (let i = 0; i < TILE_W; i++) {
      const xs = rect.x + (i * rect.w) / TILE_W;
      const xe = rect.x + ((i + 1) * rect.w) / TILE_W;
      let r = 0,
        g = 0,
        b = 0,
        n = 0;
      for (let y = Math.floor(ys); y < ye; y++) {
        for (let x = Math.floor(xs); x < xe; x++) {
          const idx = (y * imgW + x) * 4;
          r += rgba[idx];
          g += rgba[idx + 1];
          b += rgba[idx + 2];
          n++;
        }
      }
      const o = (j * TILE_W + i) * 4;
      if (n > 0) {
        out[o] = r / n;
        out[o + 1] = g / n;
        out[o + 2] = b / n;
        out[o + 3] = 255;
      }
    }
  }
  return out;
}

/** 基準サイズ(160x91)タイルのアート指紋 */
export function tileFingerprint(tile: Uint8ClampedArray): Float32Array {
  return fpFromRegion(tile, TILE_W, 2, 2, ART_W, ART_H);
}

/** 指紋をライブラリと照合（粗選別→精査） */
export function matchFingerprint(
  fp: Float32Array,
  lib: Library,
): { index: number; score: number; margin: number } {
  const cfp = coarseOf(fp);
  // 粗選別: カードごとの最良粗スコア
  const coarseScores: { c: number; s: number }[] = [];
  for (let c = 0; c < lib.count; c++) {
    let s = -2;
    for (const v of lib.coarse[c]) {
      const d = dot(cfp, v);
      if (d > s) s = d;
    }
    coarseScores.push({ c, s });
  }
  coarseScores.sort((a, b) => b.s - a.s);
  // 精査: 上位候補のみ全窓で照合
  let best = -1,
    bScore = -2,
    second = -2;
  for (const { c } of coarseScores.slice(0, COARSE_TOP)) {
    let s = -2;
    for (const v of lib.fine[c]) {
      const d = dot(fp, v);
      if (d > s) s = d;
    }
    if (s > bScore) {
      second = bScore;
      bScore = s;
      best = c;
    } else if (s > second) {
      second = s;
    }
  }
  return { index: best, score: bScore, margin: bScore - second };
}

/**
 * 凸マーク（4スター、白=点灯・左から埋まる）の判定。基準サイズ(160x91)タイルで、
 * Lvが1桁なら x=30.5、2桁なら x=46.5 から間隔16.2で並ぶ。両仮説を試し、
 * スロットごとに±4pxの局所探索で星中心にスナップして白率/暗率で点灯判定する。
 */
export function analyzeStars(
  tile: Uint8ClampedArray,
): { count: number; ok: boolean } {
  const imgW = TILE_W;
  const left = 0;
  const top = 0;
  const slotEval = (cx0: number) => {
    let bestWhite = 0,
      bestDark = 0;
    for (let sh = -4; sh <= 4; sh++) {
      let wCnt = 0,
        dCnt = 0,
        n = 0;
      const cx = Math.round(cx0 + sh);
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const i = ((top + 71 + dy) * imgW + cx + dx) * 4;
          const r = tile[i],
            g = tile[i + 1],
            b = tile[i + 2];
          if (r > 215 && g > 215 && b > 215) wCnt++;
          if ((r + g + b) / 3 < 145) dCnt++;
          n++;
        }
      }
      if (wCnt / n > bestWhite) bestWhite = wCnt / n;
      if (dCnt / n > bestDark) bestDark = dCnt / n;
    }
    return { white: bestWhite, dark: bestDark };
  };
  type Hypo = {
    lit: number[];
    mono: boolean;
    starness: number;
  };
  const hypos: Hypo[] = [];
  for (const start of [30.5, 46.5]) {
    const slots = [0, 1, 2, 3].map((k) => slotEval(left + start + 16.2 * k));
    const lit = slots.map((s) => (s.white >= 0.5 ? 1 : s.dark >= 0.35 ? 0 : -1));
    let mono = true;
    for (let i = 1; i < 4; i++) if (lit[i] > lit[i - 1]) mono = false;
    const starness = slots.reduce((a, s) => a + Math.max(s.white, s.dark), 0) / 4;
    hypos.push({ lit, mono, starness });
  }
  hypos.sort((a, b) => {
    const okA = a.mono && !a.lit.includes(-1) ? 1 : 0;
    const okB = b.mono && !b.lit.includes(-1) ? 1 : 0;
    if (okA !== okB) return okB - okA;
    return b.starness - a.starness;
  });
  const h = hypos[0];
  return {
    count: h.lit.filter((v) => v === 1).length,
    ok: h.mono && !h.lit.includes(-1),
  };
}

/** 1フレームぶんの解析: 格子検出 → タイル正規化 → 照合と凸判定 */
export function analyzeListFrame(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  lib: Library,
): TileMatch[] {
  const out: TileMatch[] = [];
  for (const rect of findTileGrid(rgba, w, h)) {
    const tile = normalizeTile(rgba, w, rect);
    const fp = tileFingerprint(tile);
    const m = matchFingerprint(fp, lib);
    const stars = analyzeStars(tile);
    out.push({
      rect,
      index: m.index,
      score: m.score,
      margin: m.margin,
      tsuki: stars.count,
      tsukiOk: stars.ok,
    });
  }
  return out;
}
