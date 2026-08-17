/**
 * サポカ所持の画面キャプチャ読み取り（/card-import）の照合ロジック。
 * すべて幅540に正規化したRGBAバッファ上で動く純ロジック（Workerから使う）。
 * コミュニティ提供のテストデータ（スマホ/PC 42枚・354タイル）と手元のDMMキャプチャで較正済み。
 *
 * パイプライン:
 * 1. タイル格子検出: タイル間の白帯で行を出し、行内の白ギャップで3列に分ける。
 *    行の高さは58..120pxを許容し、タイル幅は行高に比例（160:91）で検証する
 *    （ウィンドウ幅よりゲームが狭いPCキャプチャ等のスケール差に追従）。
 * 2. 各タイルを基準サイズ160x91へリサンプル。
 * 3. カード同定（2段階）: アート上部の20x8RGB指紋を全カードの固定窓（スケール6×位置
 *    最大10=58窓）と照合 → スコアが低ければ上位8候補だけ、サムネイル上の
 *    位置×スケール実探索（積分画像＋山登りで高速化）で精査し、最大スコアを採用する。
 *    （ゲームのリスト切り抜きはカードごとにズーム・位置が大きく違うため）
 * 4. 凸数: Lvの桁数で開始位置が変わる4つの凸マークを、行内共有シフトで位置合わせし、
 *    タイル内の相対輝度で「点灯／すりガラス未点灯／暗色未点灯」を分離して数える。
 */

/** 正規化フレームの幅（高さはキャプチャに応じて可変） */
export const FRAME_W = 540;

/** タイルの基準サイズ（検出タイルはこの寸法へ正規化する） */
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
/** 粗選別で残す候補数と、精査に回す候補数 */
const COARSE_TOP = 24;
const REFINE_TOP = 8;
/** 固定窓のスコアがこれ以上なら精査を省略する（十分に確からしい） */
const REFINE_SKIP = 0.92;

/** アート領域のアスペクト（ライブラリ窓の高さ計算に使う） */
const FP_ASPECT = ART_W / ART_H;
/** ライブラリ固定窓のスケール候補 */
const SCALES = [1.0, 1.15, 1.3, 1.5] as const;
const Y_OFFSETS = [0, 1 / 3, 2 / 3, 1] as const;

/** 精査用の縮約カラー指紋 */
const REF_W = 12;
const REF_H = 5;
const REF_LEN = REF_W * REF_H * 3;
/** 精査の探索スケール（サムネ幅/窓幅）。
 * Rカードや「白背景にキャラが小さい」アートのリスト切り抜きは4〜5倍ズームに
 * なるため、そこまで探索する。 */
const REFINE_SCALES = [1.0, 1.25, 1.55, 1.9, 2.35, 2.9, 3.6, 4.5] as const;

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
  /** 凸判定が明確だったか（オーバーレイ等で読めなければ false=手動確認推奨） */
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

type CellSat = [Float64Array, Float64Array, Float64Array];

export type Library = {
  count: number;
  cellW: number;
  cellH: number;
  /** [cardIndex][variant] の指紋 */
  fine: Float32Array[][];
  coarse: Float32Array[][];
  /** 精査用: サムネごとのRGB積分画像 */
  sats: CellSat[];
};

/**
 * スプライト画像（cellW x cellH のサムネイルがcols列で並ぶ）からライブラリを作る。
 * 各カードにつき固定窓40個の指紋と、精査用の積分画像を持つ。
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
  const sats: CellSat[] = [];
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
    // 高倍率窓（顔アップ系のリスト切り抜き。Rカード等が該当）。
    // 粗選別・固定窓の段階で正解カードを上位候補に残すために必要
    // （精査は上位8候補にしか走らないため）。
    for (const scale of [1.9, 2.4] as const) {
      const winW = cellW / scale;
      const winH = baseWinH / scale;
      if (winH > cellH) continue;
      for (const fx of [0.3, 0.5, 0.7]) {
        const x0 = cellX + (cellW - winW) * fx;
        for (const fy of [0, 0.25, 0.5]) {
          const y0 = cellY + (cellH - winH) * fy;
          fps.push(fpFromRegion(rgba, imgW, x0, y0, winW, winH));
        }
      }
    }
    fine.push(fps);
    coarse.push(fps.map(coarseOf));
    // 積分画像（(w+1)x(h+1)）
    const sat: CellSat = [
      new Float64Array((cellW + 1) * (cellH + 1)),
      new Float64Array((cellW + 1) * (cellH + 1)),
      new Float64Array((cellW + 1) * (cellH + 1)),
    ];
    for (let y = 0; y < cellH; y++) {
      for (let x = 0; x < cellW; x++) {
        const idx = ((cellY + y) * imgW + cellX + x) * 4;
        for (let ch = 0; ch < 3; ch++) {
          sat[ch][(y + 1) * (cellW + 1) + (x + 1)] =
            rgba[idx + ch] +
            sat[ch][y * (cellW + 1) + (x + 1)] +
            sat[ch][(y + 1) * (cellW + 1) + x] -
            sat[ch][y * (cellW + 1) + x];
        }
      }
    }
    sats.push(sat);
  }
  return { count, cellW, cellH, fine, coarse, sats };
}

export type TileRect = { x: number; y: number; w: number; h: number };

/**
 * タイル格子の検出。
 * 領域指定が多少ズレてスケールが狂っても読めるよう、格子は毎フレーム動的に見つける:
 * 1) 白率>0.9 の横帯（タイル間の背景）で行境界を出す（高さ58..120を行とみなす）
 * 2) 行内で白率>0.85 の縦ラインの束（左右余白と列間ギャップ）を出し、
 *    その間の「行高に比例した幅」の区間をタイルとする（3列そろった行だけ採用）
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
    if (rowH < 58 || rowH > 120) continue;
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
    // タイル幅は行高に比例（160:91）。PCキャプチャ等のスケール差に追従する
    const expectW = rowH * (TILE_W / TILE_H);
    const rowTiles: TileRect[] = [];
    let gapEnd = -1;
    let x = 0;
    while (x < w) {
      if (gapAt[x]) {
        gapEnd = x;
        x++;
        continue;
      }
      let next = x;
      while (next < w && !gapAt[next]) next++;
      const width = next - x;
      if (
        gapEnd >= 0 &&
        next < w &&
        width >= expectW * 0.85 &&
        width <= expectW * 1.18
      ) {
        rowTiles.push({ x, y: top, w: width, h: rowH });
      }
      x = next;
    }
    if (rowTiles.length === 3) {
      // アートの白い縁が列間ギャップと誤認されるとタイルの端が食われて痩せる
      // （例: 左22px欠け→横伸び表示）。幅が期待値から大きく外れた1枚を、
      // 残り2枚の等間隔配置から幾何的に再構成する。
      const devs = rowTiles.map((t) => Math.abs(t.w - expectW));
      const worst = devs.indexOf(Math.max(...devs));
      const others = [0, 1, 2].filter((i) => i !== worst);
      if (devs[worst] > 8 && others.every((i) => devs[i] <= 6)) {
        const [a, b, c] = rowTiles;
        const tw = Math.round(
          (rowTiles[others[0]].w + rowTiles[others[1]].w) / 2,
        );
        if (worst === 1) {
          b.x = Math.round((a.x + c.x) / 2);
          b.w = tw;
        } else if (worst === 0) {
          a.x = Math.max(0, 2 * b.x - c.x);
          a.w = tw;
        } else {
          c.x = Math.min(w - tw, 2 * b.x - a.x);
          c.w = tw;
        }
      }
      tiles.push(...rowTiles);
    }
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

/** 精査用: タイルアートの縮約カラー指紋 */
function refineFpFromTile(tile: Uint8ClampedArray): Float32Array {
  const out = new Float32Array(REF_LEN);
  for (let j = 0; j < REF_H; j++) {
    const ys = 2 + (j * ART_H) / REF_H;
    const ye = 2 + ((j + 1) * ART_H) / REF_H;
    for (let i = 0; i < REF_W; i++) {
      const xs = 2 + (i * ART_W) / REF_W;
      const xe = 2 + ((i + 1) * ART_W) / REF_W;
      let r = 0,
        g = 0,
        b = 0,
        n = 0;
      for (let y = Math.floor(ys); y < ye; y++) {
        for (let x = Math.floor(xs); x < xe; x++) {
          const idx = (y * TILE_W + x) * 4;
          r += tile[idx];
          g += tile[idx + 1];
          b += tile[idx + 2];
          n++;
        }
      }
      const o = (j * REF_W + i) * 3;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
    }
  }
  return normalize(out);
}

/** 積分画像から矩形平均 */
function boxAvg(
  sat: Float64Array,
  W: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const a = sat[y0 * (W + 1) + x0];
  const b = sat[y0 * (W + 1) + x1];
  const c = sat[y1 * (W + 1) + x0];
  const d = sat[y1 * (W + 1) + x1];
  return (d - b - c + a) / ((x1 - x0) * (y1 - y0));
}

/** 候補サムネ上で精査指紋を位置×スケール探索して最大NCC。
 * 各スケールで粗い格子を走査したあと、そのスケールの最良位置から
 * 1px刻みの山登りで詰める（数pxのズレでもNCCは大きく落ちるため、
 * 粗い格子だけだと正解カードでも0.7台で頭打ちになる）。 */
function refineScore(
  refFp: Float32Array,
  sat: CellSat,
  cellW: number,
  cellH: number,
): number {
  let best = -2;
  const v = new Float32Array(REF_LEN);
  const ncc = (ox: number, oy: number, winW: number, winH: number): number => {
    for (let j = 0; j < REF_H; j++) {
      const y0 = Math.round(oy + (j * winH) / REF_H);
      const y1 = Math.max(y0 + 1, Math.round(oy + ((j + 1) * winH) / REF_H));
      for (let i = 0; i < REF_W; i++) {
        const x0 = Math.round(ox + (i * winW) / REF_W);
        const x1 = Math.max(x0 + 1, Math.round(ox + ((i + 1) * winW) / REF_W));
        const o = (j * REF_W + i) * 3;
        v[o] = boxAvg(sat[0], cellW, x0, y0, x1, y1);
        v[o + 1] = boxAvg(sat[1], cellW, x0, y0, x1, y1);
        v[o + 2] = boxAvg(sat[2], cellW, x0, y0, x1, y1);
      }
    }
    let mean = 0;
    for (let i = 0; i < REF_LEN; i++) mean += v[i];
    mean /= REF_LEN;
    let ss = 0;
    for (let i = 0; i < REF_LEN; i++) {
      const t = v[i] - mean;
      ss += t * t;
    }
    const norm = Math.sqrt(ss) || 1;
    let d = 0;
    for (let i = 0; i < REF_LEN; i++) d += ((v[i] - mean) / norm) * refFp[i];
    return d;
  };
  for (const scale of REFINE_SCALES) {
    const winW = cellW / scale;
    const winH = winW / FP_ASPECT;
    if (winH > cellH || winW < REF_W) continue;
    const maxX = cellW - winW;
    const maxY = cellH - winH;
    const stepX = Math.max(1.2, Math.min(maxX / 7, winW / 3));
    const stepY = Math.max(1.2, Math.min(maxY / 5, winH / 3));
    let sBest = -2;
    let sx = 0;
    let sy = 0;
    for (let oy = 0; oy <= maxY + 0.01; oy += stepY) {
      for (let ox = 0; ox <= maxX + 0.01; ox += stepX) {
        const d = ncc(ox, oy, winW, winH);
        if (d > sBest) {
          sBest = d;
          sx = ox;
          sy = oy;
        }
      }
    }
    // 山登り（1px刻み・最大6歩）
    for (let step = 0; step < 6; step++) {
      let moved = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = sx + dx;
        const ny = sy + dy;
        if (nx < 0 || ny < 0 || nx > maxX || ny > maxY) continue;
        const d = ncc(nx, ny, winW, winH);
        if (d > sBest) {
          sBest = d;
          sx = nx;
          sy = ny;
          moved = true;
        }
      }
      if (!moved) break;
    }
    if (sBest > best) best = sBest;
  }
  return best;
}

/**
 * フレーム間で同一内容のタイルの再照合を避けるキャッシュ。
 * 指紋同士の相関が0.995以上（=事実上同じ絵）のときだけ前回結果を返すので、
 * 誤同定のリスクなしに、静止画面やスクロール中の残留行の精査をスキップできる。
 */
export type MatchCache = {
  entries: { fp: Float32Array; index: number; score: number; margin: number }[];
  cursor: number;
};
export function createMatchCache(): MatchCache {
  return { entries: [], cursor: 0 };
}
const CACHE_MAX = 384;

/**
 * タイル1枚をライブラリと照合する（キャッシュ→粗選別→固定窓→必要なら精査）。
 */
function matchTile(
  tile: Uint8ClampedArray,
  lib: Library,
  cache?: MatchCache,
): { index: number; score: number; margin: number } {
  const fp = tileFingerprint(tile);
  if (cache) {
    for (const e of cache.entries) {
      if (dot(fp, e.fp) >= 0.995) {
        return { index: e.index, score: e.score, margin: e.margin };
      }
    }
  }
  const cfp = coarseOf(fp);
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
  const fineScores: { c: number; s: number }[] = [];
  for (const { c } of coarseScores.slice(0, COARSE_TOP)) {
    let s = -2;
    for (const v of lib.fine[c]) {
      const d = dot(fp, v);
      if (d > s) s = d;
    }
    fineScores.push({ c, s });
  }
  fineScores.sort((a, b) => b.s - a.s);
  let result: { index: number; score: number; margin: number };
  if ((fineScores[0]?.s ?? -2) >= REFINE_SKIP) {
    // 固定窓で十分確からしければ精査を省略
    result = {
      index: fineScores[0].c,
      score: fineScores[0].s,
      margin: fineScores[0].s - (fineScores[1]?.s ?? -2),
    };
  } else {
    // 精査: 上位候補をサムネ上の実探索で採点し、固定窓との最大値で決める
    const refFp = refineFpFromTile(tile);
    let best = { c: -1, s: -2 };
    let second = -2;
    for (const cand of fineScores.slice(0, REFINE_TOP)) {
      const ref = refineScore(refFp, lib.sats[cand.c], lib.cellW, lib.cellH);
      const s = Math.max(cand.s, ref);
      if (s > best.s) {
        second = best.s;
        best = { c: cand.c, s };
      } else if (s > second) {
        second = s;
      }
    }
    result = { index: best.c, score: best.s, margin: best.s - second };
  }
  if (cache) {
    const entry = { fp, ...result };
    if (cache.entries.length < CACHE_MAX) {
      cache.entries.push(entry);
    } else {
      cache.entries[cache.cursor] = entry;
      cache.cursor = (cache.cursor + 1) % CACHE_MAX;
    }
  }
  return result;
}

/**
 * 凸マーク（4スター、左から埋まる）の判定 v5。基準サイズ(160x91)タイルで、
 * Lvが1桁なら x=30.5、2桁なら x=46.5 から間隔16.2で並ぶ。
 *
 * 両ケースで共通の「共有スロット」x=46.6/62.8/79.0 は必ずスターなので、
 * まずそこを相対輝度で 点灯/未点灯 に分類する
 * （未点灯の見た目は環境で違う: すりガラス風の白半透明 or 灰色シルエット）。
 * 次に排他位置 L(x≈30.5) を見る。ここは「1桁Lvの1個目スター」か
 * 「2桁Lvの数字・背景」のどちらか:
 * - Lが明るく太い塊(≥7px) → スター（点灯マークは中実の円形） → Lv1桁
 * - Lが細い線(≤4px) → 数字のストロークや背景の格子線 → Lv2桁
 * スターと数字グリフは高さ・明るさが同じで縦投影では区別できないが、
 * ストローク幅だけは確実に違う（実測: スター8-11px / 数字・格子線2-5px）。
 * 桁数が決まれば凸数は共有スロットの分類から一意に決まる
 * （2桁Lvで共有3つが全点灯のときだけ、4個目 x≈95.2 の輝度で3凸/4凸を分ける）。
 * 「上限解放可能」等のリボンがスターを覆っていたら判定不能(ok=false)。
 */
export function analyzeStars(tile: Uint8ClampedArray): {
  count: number;
  ok: boolean;
} {
  const imgW = TILE_W;
  // リボン検出: スター帯に彩度の高い黄色が横に長く続くか
  let yellowRun = 0;
  let maxYellowRun = 0;
  for (let x = 25; x < 115; x++) {
    let yellow = 0,
      n = 0;
    for (let y = 63; y <= 79; y += 2) {
      const i = (y * imgW + x) * 4;
      const r = tile[i],
        g = tile[i + 1],
        b = tile[i + 2];
      if (r > 200 && g > 160 && b < 140 && r - b > 80) yellow++;
      n++;
    }
    if (yellow / n >= 0.6) {
      yellowRun++;
      maxYellowRun = Math.max(maxYellowRun, yellowRun);
    } else {
      yellowRun = 0;
    }
  }
  if (maxYellowRun >= 55) return { count: 0, ok: false };

  // スロット評価: コア(5x5)平均輝度と、星らしさ（白 or 暗の面積）
  const slotAt = (cx0: number, sh: number) => {
    const cx = Math.round(cx0 + sh);
    let wCnt = 0,
      dCnt = 0,
      n = 0,
      core = 0,
      cn = 0;
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const i = ((71 + dy) * imgW + cx + dx) * 4;
        const r = tile[i],
          g = tile[i + 1],
          b = tile[i + 2];
        const lum = (r + g + b) / 3;
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        if (lum > 195 && sat < 60) wCnt++;
        if (lum < 150) dCnt++;
        n++;
        if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2) {
          core += lum;
          cn++;
        }
      }
    }
    return { white: wCnt / n, dark: dCnt / n, core: core / cn };
  };
  /** ±r シフトのコア輝度最大（点灯コアの取りこぼし防止） */
  const coreMaxAt = (cx0: number, sh: number, r = 2): number => {
    let m = 0;
    for (let d = -r; d <= r; d++) m = Math.max(m, slotAt(cx0, sh + d).core);
    return m;
  };

  // 共有スロット（両ケースでスターの位置）で行内シフトを合わせる。
  // 白/暗の星らしさが平坦な行でシフトが端に張り付かないよう |sh| に微ペナルティ
  const SHARED = [46.6, 62.8, 79.0];
  let shift = 0;
  let shiftScore = -1;
  for (let sh = -5; sh <= 5; sh++) {
    const score =
      SHARED.reduce((a, cx) => {
        const s = slotAt(cx, sh);
        return a + Math.max(s.white, s.dark);
      }, 0) -
      0.015 * Math.abs(sh);
    if (score > shiftScore) {
      shiftScore = score;
      shift = sh;
    }
  }

  // 共有スロットの分類: 相対輝度のギャップ分割 → 不成立なら一様ルール
  const shared = SHARED.map((cx) => {
    let best = slotAt(cx, shift);
    for (let d = -2; d <= 2; d++) {
      const s = slotAt(cx, shift + d);
      if (Math.max(s.white, s.dark) > Math.max(best.white, best.dark)) best = s;
    }
    return { ...best, coreMax: coreMaxAt(cx, shift) };
  });
  const lums = shared.map((s) => s.coreMax);
  const sorted = [...lums].sort((a, b) => b - a);
  const avgDark = shared.reduce((a, s) => a + s.dark, 0) / 3;
  let lit: number[];
  let clean = true;
  const uniformRules = (): number[] => {
    const mean = lums.reduce((a, b) => a + b, 0) / 3;
    if (mean >= 234) return [1, 1, 1];
    if (avgDark >= 0.28) return [0, 0, 0]; // 暗色シルエット
    if (mean >= 185 && mean <= 232) return [0, 0, 0]; // すりガラス
    return [-1, -1, -1];
  };
  if (shared.every((s) => s.dark >= 0.25)) {
    // 全スロットが暗色シルエット。背景アートの明暗でコア輝度はばらつくため
    // 輝度分割より先に判定する
    lit = [0, 0, 0];
  } else if (sorted[0] - sorted[2] >= 35) {
    // 輝度差が大きい: ギャップの大きい方で点灯/未点灯グループに分割
    let found: number[] | null = null;
    const splits = [1, 2]
      .map((at) => ({ at, gap: sorted[at - 1] - sorted[at] }))
      .sort((a, b) => b.gap - a.gap);
    for (const { at, gap } of splits) {
      if (gap < 25 || sorted[at - 1] < 218) continue;
      const cand = lums.map((v) => (v >= sorted[at - 1] - 0.001 ? 1 : 0));
      if (cand[1] <= cand[0] && cand[2] <= cand[1]) {
        found = cand;
        break;
      }
    }
    if (found) lit = found;
    else {
      lit = uniformRules();
      clean = false;
    }
  } else {
    lit = uniformRules();
  }
  if (lit.includes(-1) || lit[1] > lit[0] || lit[2] > lit[1]) {
    // 分類不能 or 単調でない → 要確認。数はそれらしく丸める
    const k = lit.filter((v) => v === 1).length;
    return { count: k, ok: false };
  }
  const k = lit[0] + lit[1] + lit[2];
  const litCores = lums.filter((_, i) => lit[i] === 1);
  const unlitCores = lums.filter((_, i) => lit[i] === 0);

  // 4個目スター（2桁Lvのみ存在。x≈95.2）の点灯判定。
  // スター間隔の個体差が右端で累積するため探索は±4に広げる。
  // 点灯(≥235)と未点灯(すりガラス~230以下/シルエット~150以下)の境界帯は要確認
  const evalR = (): { lit: boolean; sure: boolean } => {
    const coreR = coreMaxAt(95.2, shift, 4);
    const threshold = Math.max(
      227,
      litCores.length > 0 ? Math.min(...litCores) - 15 : 0,
    );
    return { lit: coreR >= threshold, sure: Math.abs(coreR - threshold) > 6 };
  };

  // 排他位置 L（1桁Lvの1個目スター or 2桁Lvの数字・背景）の評価
  const coreL = coreMaxAt(30.5, shift, 3);
  // 点灯とみなす条件: 絶対的に明るく、未点灯スターより有意に明るく、
  // 点灯スターがいるならその明るさに近い（点灯マークの描画は行内で同一）
  let brightL = coreL >= 227;
  if (unlitCores.length > 0 && coreL < Math.max(...unlitCores) + 18) brightL = false;
  if (litCores.length > 0 && coreL < Math.min(...litCores) - 25) brightL = false;

  let count: number;
  let ok = clean;
  if (!brightL) {
    // Lにスターの点灯なし → 1桁Lvなら0凸のはず。共有に点灯があるなら2桁Lv確定
    count = k;
    if (k === 3) {
      const r = evalR();
      count = r.lit ? 4 : 3;
      if (!r.sure) ok = false;
    }
  } else {
    // Lが明るい: 太い塊ならスター（Lv1桁）、細い線なら数字/格子線（Lv2桁）。
    // 中央行帯 y68..74 で「コア輝度に近い明るさ」の横ランのうち
    // 中心列(cx±1)を通るものの長さの中央値を測る。中心を通す条件は、
    // 隣の点灯スターの縁がL窓の端にかすったときの誤検出を防ぐ。
    // 実測でスターは7px以上、数字ストローク・背景の格子線は5px以下に分離する
    const cx = Math.round(30.5 + shift);
    const centerRunAt = (y: number): number => {
      let run = 0;
      let runStart = -7;
      let centerRun = 0;
      for (let dx = -7; dx <= 8; dx++) {
        const i = (y * imgW + cx + dx) * 4;
        const lum = dx <= 7 ? (tile[i] + tile[i + 1] + tile[i + 2]) / 3 : -1;
        if (lum >= coreL - 28) {
          if (run === 0) runStart = dx;
          run++;
        } else {
          if (run > centerRun && runStart <= 1 && runStart + run - 1 >= -1) {
            centerRun = run;
          }
          run = 0;
        }
      }
      return centerRun;
    };
    const runs: number[] = [];
    for (let y = 68; y <= 74; y++) runs.push(centerRunAt(y));
    runs.sort((a, b) => a - b);
    const thickness = runs[Math.floor(runs.length / 2)];
    if (thickness >= 13) {
      // 窓幅いっぱいに明るい → 一様に明るい背景であってスターではない
      // （実測のスターは中央値7..11）。桁数を決められないので要確認
      count = k;
      ok = false;
      if (k === 3) {
        const r = evalR();
        count = r.lit ? 4 : 3;
      }
    } else if (thickness >= 7) {
      // 中実の塊 → 1個目スター点灯 → Lv1桁
      count = 1 + k;
    } else {
      // 細い線（数字ストローク・格子線）→ Lv2桁。
      // 6は数字の横棒（5,7等）でも出るため2桁側に倒して要確認にする
      count = k;
      if (k === 3) {
        const r = evalR();
        count = r.lit ? 4 : 3;
        if (!r.sure) ok = false;
      }
      if (thickness === 6) ok = false;
    }
  }
  return { count, ok };
}

/** 1フレームぶんの解析: 格子検出 → タイル正規化 → 照合と凸判定 */
export function analyzeListFrame(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  lib: Library,
  cache?: MatchCache,
): TileMatch[] {
  const out: TileMatch[] = [];
  for (const rect of findTileGrid(rgba, w, h)) {
    const tile = normalizeTile(rgba, w, rect);
    const m = matchTile(tile, lib, cache);
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
