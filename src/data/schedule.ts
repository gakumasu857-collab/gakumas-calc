/**
 * レッスン・オーディション（選抜試験）・授業ページのマスターデータ。
 *
 * レッスンは「スター性重視の公開レッスン」と「通常の公開レッスン」の2種で、
 * 値は [非SP, SP] のペアで持つ。
 *
 * ※ サブパラメータは「選択しなかった残り2タイプの両方に入る」想定で計算している。
 *   （1タイプのみ等、実際の仕様が違う場合は要修正 → ヘルプモーダルにも明記）
 */

import { AFFECTION_DEFAULT, starWithAffection } from "./affection";

export type LessonKind = "star" | "normal";

/** HIFワッペンの最大発動回数（札を何枚取ってもこれ以上は発動しない） */
export const WAPPEN_MAX = 20;
/** ワッペン1回のスター性（素の値。親愛度37＝+50%なら15） */
export const WAPPEN_STAR_BASE = 10;
/** ワッペンのスター性の合計（1回ごとに切り捨て） */
export function wappenStarTotal(count: number, affection: number): number {
  return starWithAffection(WAPPEN_STAR_BASE, affection) * Math.max(0, count);
}

/**
 * このファイルのレッスン★・選抜★は「親愛度37（スター性ボーナス+50%）で観測した値」。
 * 素の値に戻すためにこれで割ってから、実際の親愛度のボーナスを掛ける
 * （オーナー確認 2026-09-16: 従来の 150→225・5→7・110→165・30→45 はすべて+50%込みの値だった）。
 */
export const STAR_OBSERVED_MULT = 1.5;

/** 観測値（親愛度37の値）→ 指定した親愛度でのスター性（切り捨て） */
export function starFromObserved(observed: number, affection: number): number {
  return starWithAffection(observed / STAR_OBSERVED_MULT, affection);
}

export const LESSON_KIND_LABELS: Record<LessonKind, string> = {
  star: "スター性重視",
  normal: "通常",
};

/** 公開レッスン8回分。値は [非SP, SP]。★は2026-07修正（従来値の1.5倍が正） */
export const LESSONS = [
  { label: "選抜2日目", kind: "star", main: [50, 60], sub: [10, 20], star: [30, 45], p: 30 },
  { label: "選抜4日目", kind: "normal", main: [60, 80], sub: [20, 50], star: [7.5, 15], p: 30 },
  { label: "選抜9日目", kind: "star", main: [70, 80], sub: [10, 20], star: [30, 45], p: 30 },
  { label: "選抜11日目", kind: "normal", main: [80, 100], sub: [30, 60], star: [7.5, 15], p: 30 },
  { label: "選抜15日目", kind: "star", main: [90, 100], sub: [10, 20], star: [30, 45], p: 30 },
  { label: "選抜18日目", kind: "normal", main: [100, 120], sub: [40, 70], star: [7.5, 15], p: 30 },
  { label: "本戦2日目", kind: "star", main: [110, 120], sub: [10, 20], star: [30, 45], p: 50 },
  { label: "本戦5日目", kind: "normal", main: [120, 140], sub: [50, 80], star: [7.5, 15], p: 50 },
] as const satisfies readonly {
  label: string;
  kind: LessonKind;
  main: readonly [number, number];
  sub: readonly [number, number];
  star: readonly [number, number];
  p: number;
}[];

/** 授業6回分（gain = 選んだタイプに入る上昇値） */
export const CLASSES = [
  { label: "選抜3日目", gain: 120 },
  { label: "選抜6日目", gain: 120 },
  { label: "選抜10日目", gain: 150 },
  { label: "選抜17日目", gain: 150 },
  { label: "本戦1日目", gain: 180 },
  { label: "本戦4日目", gain: 180 },
] as const;

// ============================================================
// ★ H.I.F.の選抜の式を直すときはここ（このファイルの3か所）
//   1. EXAMS ………………… 選抜1〜3の上昇基準値（base）・固定上昇（fixed）・配分上昇（dist）・スター性上限（starCap）
//   2. examStar …………… 合計スコア→スター性の近似式
//   3. distributeExam …… タイプ別スコア→ステ上昇の分配式
//   （本戦は FINAL_ROUNDS の starBands＝スター性・brackets＝点数評価値。親愛度は src/data/affection.ts）
//   直したら PlanEditDrawer.tsx の HifNumbers（「選抜のステータス分配」「スター性の近似式」の説明文）も合わせる。
// ============================================================
/**
 * 選抜試験。スコアに応じてステータスとスター性が決まる。
 * - base: 上昇基準値（上限到達時）
 * - fixed: 固定上昇値（3タイプに均等 = fixed/3 ずつ）
 * - dist: 配分上昇値（タイプごとのスコア比で分配）
 * - starCap: スター性の上限
 */
export const EXAMS = [
  { name: "選抜1", base: 140, fixed: 60, dist: 80, starCap: 40 },
  { name: "選抜2", base: 440, fixed: 240, dist: 200, starCap: 110 },
  { name: "選抜3", base: 520, fixed: 300, dist: 220, starCap: 110 },
] as const;

/** スター性のスケール補正（2026-07修正: 本戦以外は従来値の1.5倍が正） */
const STAR_SCALE = 1.5;

/**
 * 選抜試験のスター性（親愛度37の値。オーナー提供の表 2026-09）。
 * スコアの区間ごとに、両端のスター性を直線でつなぐ（傾きは両端から求める）。小数は切り捨て。
 *   選抜1: 0〜2,850: 0→28 ／ 2,851〜6,666: 30→46 ／ 6,667〜14,000: 48→58 ／ 14,001〜: 60
 *   選抜2: 0〜29,454: 0→81 ／ 29,455〜68,788: 82→130 ／ 68,789〜146,364: 132→163 ／ 146,365〜: 165
 *   選抜3: 0〜98,181: 0→81 ／ 98,182〜196,969: 82→130 ／ 196,970〜390,909: 132→163 ／ 390,910〜: 165
 * （親愛度27なら 0→19／20→31／32→39／40 など。計算機は親愛度37で固定）
 */
export type ExamStarSegment = { from: number; to: number; star: readonly [number, number] };
export const EXAM_STAR_SEGMENTS: readonly (readonly ExamStarSegment[])[] = [
  [
    { from: 0, to: 2850, star: [0, 28] },
    { from: 2851, to: 6666, star: [30, 46] },
    { from: 6667, to: 14000, star: [48, 58] },
    { from: 14001, to: Infinity, star: [60, 60] },
  ],
  [
    { from: 0, to: 29454, star: [0, 81] },
    { from: 29455, to: 68788, star: [82, 130] },
    { from: 68789, to: 146364, star: [132, 163] },
    { from: 146365, to: Infinity, star: [165, 165] },
  ],
  [
    { from: 0, to: 98181, star: [0, 81] },
    { from: 98182, to: 196969, star: [82, 130] },
    { from: 196970, to: 390909, star: [132, 163] },
    { from: 390910, to: Infinity, star: [165, 165] },
  ],
];

export function examStar(
  examIndex: number,
  score: number,
  affection: number = AFFECTION_DEFAULT,
): number {
  const segs = EXAM_STAR_SEGMENTS[examIndex];
  if (!segs || score <= 0) return 0;
  const s = Math.floor(score);
  for (const seg of segs) {
    if (s > seg.to) continue;
    const [y0, y1] = seg.star;
    // 表の値は親愛度37のもの。素の値に直してから親愛度のボーナスを掛ける（切り捨て）
    if (seg.to === Infinity) return starFromObserved(y0, affection);
    const y = y0 + ((s - seg.from) * (y1 - y0)) / (seg.to - seg.from);
    return Math.max(0, starFromObserved(y, affection));
  }
  return starFromObserved(segs[segs.length - 1].star[0], affection);
}

/** スター性が上限に達する合計スコア（これ以上入れても増えない。入力の上限に使う） */
export function examStarCapScore(examIndex: number): number {
  const segs = EXAM_STAR_SEGMENTS[examIndex];
  return segs ? segs[segs.length - 1].from : Infinity;
}

/**
 * 本戦ラウンド。スター性もスコア評価値も区分線形（シートの実式）。
 * - starBands: [その区間の上限スコア, 倍率]。区間に入った分だけ倍率が掛かり、累計が starMax で頭打ち
 *   （素の値。オーナー提供 2026-09-16。親愛度37なら ×1.5 で従来の 180／225 になる）
 * - brackets: [スコア上限, 差し引き基準, 係数, 加算ベース] を昇順で評価
 */
export const FINAL_ROUNDS = [
  {
    name: "ラウンド1",
    starBands: [
      [200000, 0.0003],
      [300000, 0.00036],
      [500000, 0.00012],
    ],
    starMax: 120,
    maxScore: 1400000,
    brackets: [
      [700000, 300000, 0.01, 0],
      [1000000, 700000, 0.003, 4000],
      [1200000, 1000000, 0.002, 4900],
      [1400000, 1200000, 0.001, 5300],
    ],
  },
  {
    name: "ラウンド2",
    starBands: [
      [400000, 0.0001875],
      [600000, 0.000225],
      [1000000, 0.000075],
    ],
    starMax: 150,
    maxScore: 2400000,
    brackets: [
      [900000, 600000, 0.004, 0],
      [1500000, 900000, 0.008, 1200],
      [2000000, 1500000, 0.002, 6000],
      [2400000, 2000000, 0.001, 7000],
    ],
  },
] as const;

/** 本戦スコア→スコア評価値（レッスン・試験・授業!G39/G41 の式の移植） */
/** 本戦ラウンドのスター性（素の値。区間ごとの倍率を累積し、starMax で頭打ち） */
export function finalRoundStarBase(roundIndex: number, score: number): number {
  const round = FINAL_ROUNDS[roundIndex];
  if (!round || score <= 0) return 0;
  let star = 0;
  let from = 0;
  for (const [to, rate] of round.starBands) {
    if (score <= from) break;
    star += (Math.min(score, to) - from) * rate;
    from = to;
  }
  return Math.min(round.starMax, star);
}

/** 本戦ラウンドのスター性（親愛度のボーナス込み・切り捨て） */
export function finalRoundStar(
  roundIndex: number,
  score: number,
  affection: number = AFFECTION_DEFAULT,
): number {
  return starWithAffection(finalRoundStarBase(roundIndex, score), affection);
}

/** スター性が上限に達するスコア（本戦。これ以上入れてもスター性は増えない） */
export function finalRoundStarCapScore(roundIndex: number): number {
  const round = FINAL_ROUNDS[roundIndex];
  if (!round) return Infinity;
  return round.starBands[round.starBands.length - 1][0];
}

export function finalRoundValue(roundIndex: number, score: number): number {
  const round = FINAL_ROUNDS[roundIndex];
  if (!round || score <= 0) return 0;
  // 上限超過分はシートではエラーになるため、上限にクランプする
  const x = Math.min(score, round.maxScore);
  for (const [cap, base, rate, add] of round.brackets) {
    if (x <= cap) return add + Math.floor(Math.max(0, x - base) * rate);
  }
  return 0;
}

/**
 * 選抜試験のステータス分配（上昇基準値が上限に達している場合の式）。
 * タイプごとのスコアを小さい順に 下位/中位/上位 として:
 * 1. 下位 = floor(配分×下位スコア÷合計) + 固定÷3（小数部は繰り越し）
 * 2. 中位 = floor(繰り越し + 配分×中位スコア÷合計) + 固定÷3
 * 3. 上位 = 上昇基準値 − 下位 − 中位
 */
export function distributeExam<T extends string>(
  examIndex: number,
  scores: Record<T, number>,
  typeKeys: readonly T[],
): Record<T, number> {
  const exam = EXAMS[examIndex];
  const total = typeKeys.reduce((sum, t) => sum + scores[t], 0);
  const result = Object.fromEntries(typeKeys.map((t) => [t, 0])) as Record<
    T,
    number
  >;
  if (total <= 0) return result;

  const fixedThird = exam.fixed / 3;
  // スコア昇順（同点は typeKeys の順で安定）
  const order = [...typeKeys].sort((a, b) => scores[a] - scores[b]);
  const [low, mid, high] = order;

  const rawLow = (exam.dist * scores[low]) / total;
  result[low] = Math.floor(rawLow) + fixedThird;
  const carry = rawLow - Math.floor(rawLow);

  const rawMid = carry + (exam.dist * scores[mid]) / total;
  result[mid] = Math.floor(rawMid) + fixedThird;

  result[high] = exam.base - result[low] - result[mid];
  return result;
}

/**
 * 選抜の上昇ステ（パラボ抜き）にパラメータボーナス%を乗せた値＝ゲームのログに出る上昇幅。
 * パラボ分はログの1回分の表示に合わせて「その回の上昇×%を切り捨て」（計算機全体のパラボ変換は合計に掛けて切り捨て）。
 * @param pctPercent 合算したパラボ%（例 52.5）
 */
export function examRiseWithParabo(base: number, pctPercent: number): number {
  return base + Math.floor(base * (Math.max(0, pctPercent) / 100));
}

/**
 * ゲームのログの上昇幅（パラボ込み）から、パラボを含まない元のステを逆算する。
 * f(g) = g + floor(g × %) は単調増加なので、f(g) <= rise を満たす最大の g を返す
 * （%が実際と違って rise をぴったり作れないときは、超えない側に寄せる）。
 */
export function examBaseFromRise(rise: number, pctPercent: number): number {
  if (rise <= 0) return 0;
  const rate = Math.max(0, pctPercent) / 100;
  let g = Math.floor(rise / (1 + rate));
  while (examRiseWithParabo(g + 1, pctPercent) <= rise) g++;
  while (g > 0 && examRiseWithParabo(g, pctPercent) > rise) g--;
  return g;
}
