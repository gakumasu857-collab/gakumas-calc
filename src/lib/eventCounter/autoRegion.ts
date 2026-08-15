/**
 * ゲーム画面領域の自動検出。
 *
 * DMM版のウィンドウ共有映像は「暗いウィンドウ枠・背景」の中に
 * 明るい縦長（9:16）のゲーム画面が入っている。そこで:
 * 1. 映像を縮小して、四隅から推定した背景色と「違う」画素を数える
 * 2. 違う画素が多い行・列の連続区間 → ゲーム領域の候補
 * 3. 9:16 から大きくずれていれば、候補の中に収まる 9:16 矩形へ補正
 */

export type Rect = { x: number; y: number; w: number; h: number };

/** 解析に使う縮小幅（速度優先。検出結果は元解像度に戻す） */
const SCAN_W = 320;
/** 背景色との差（R+G+B の絶対差合計）がこれ以上なら「内容がある」画素 */
const DIFF_THRESHOLD = 90;
/** 行・列を「内容あり」とみなす画素割合 */
const LINE_FRACTION = 0.35;
/** ゲーム画面のアスペクト比（縦長 9:16） */
const GAME_ASPECT = 9 / 16;
/** アスペクト比の許容ずれ（これ以内ならそのまま採用） */
const ASPECT_TOLERANCE = 0.06;

/** 映像フレームからゲーム画面領域を検出する（見つからなければ null） */
export function detectGameRegion(
  video: HTMLVideoElement,
): Rect | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const scale = Math.min(1, SCAN_W / vw);
  const sw = Math.max(2, Math.round(vw * scale));
  const sh = Math.max(2, Math.round(vh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, sw, sh);
  const { data } = ctx.getImageData(0, 0, sw, sh);

  // 背景色: 四隅の少し内側 4点の中央値っぽい平均
  const corner = (x: number, y: number) => {
    const p = (y * sw + x) * 4;
    return [data[p], data[p + 1], data[p + 2]] as const;
  };
  const pad = 2;
  const corners = [
    corner(pad, pad),
    corner(sw - 1 - pad, pad),
    corner(pad, sh - 1 - pad),
    corner(sw - 1 - pad, sh - 1 - pad),
  ];
  const bg = [0, 1, 2].map(
    (c) => corners.reduce((s, v) => s + v[c], 0) / corners.length,
  );

  // 「内容あり」判定のマスク
  const content = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const p = (y * sw + x) * 4;
      const diff =
        Math.abs(data[p] - bg[0]) +
        Math.abs(data[p + 1] - bg[1]) +
        Math.abs(data[p + 2] - bg[2]);
      if (diff >= DIFF_THRESHOLD) content[y * sw + x] = 1;
    }
  }

  // 一番長い連続区間を取る
  const longestRun = (hits: Float32Array): [number, number] | null => {
    let best: [number, number] | null = null;
    let start = -1;
    for (let i = 0; i <= hits.length; i++) {
      const on = i < hits.length && hits[i] >= LINE_FRACTION;
      if (on && start < 0) start = i;
      if (!on && start >= 0) {
        if (!best || i - start > best[1] - best[0]) best = [start, i];
        start = -1;
      }
    }
    return best;
  };

  // 1) 列方向: 全行に対する割合でゲームの横範囲を出す
  //    （ゲーム列は縦のほとんどが内容ありなので高い割合になる）
  const colHits = new Float32Array(sw);
  for (let y = 0; y < sh; y++)
    for (let x = 0; x < sw; x++) colHits[x] += content[y * sw + x];
  for (let x = 0; x < sw; x++) colHits[x] /= sh;
  const colRun = longestRun(colHits);
  if (!colRun) return null;

  // 2) 行方向: 見つけた横範囲の「中だけ」で割合を出す
  //    （横長ウィンドウだと全幅に対する割合では埋もれてしまうため）
  const rowHits = new Float32Array(sh);
  const runW = colRun[1] - colRun[0];
  for (let y = 0; y < sh; y++) {
    let hits = 0;
    for (let x = colRun[0]; x < colRun[1]; x++) hits += content[y * sw + x];
    rowHits[y] = hits / runW;
  }
  const rowRun = longestRun(rowHits);
  if (!rowRun) return null;

  let x = colRun[0];
  let y = rowRun[0];
  let w = colRun[1] - colRun[0];
  let h = rowRun[1] - rowRun[0];
  // 小さすぎる検出は失敗扱い（映像の1/4未満）
  if (w < sw * 0.15 || h < sh * 0.25) return null;

  // 9:16 から大きくずれていたら、検出範囲の中に収まる 9:16 へ補正（中央合わせ）
  const aspect = w / h;
  if (Math.abs(aspect - GAME_ASPECT) > ASPECT_TOLERANCE) {
    if (aspect > GAME_ASPECT) {
      const fitW = h * GAME_ASPECT;
      x += (w - fitW) / 2;
      w = fitW;
    } else {
      const fitH = w / GAME_ASPECT;
      y += (h - fitH) / 2;
      h = fitH;
    }
  }

  return {
    x: Math.round(x / scale),
    y: Math.round(y / scale),
    w: Math.round(w / scale),
    h: Math.round(h / scale),
  };
}
