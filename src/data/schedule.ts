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
// ★ H.I.Fの選抜の式を直すときはここ（このファイルの3か所）
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

/**
 * 選抜試験のスター性の式（オーナー提供の表 2026-09-21。以前の「両端を直線でつなぐ表」は境界が1ずれていた）。
 *   素の値（親愛度27以下） = 切り上げ( Σ 区間ごとの スコア × 傾き )。上限あり
 *   表示のスター性       = 切り捨て( 素の値 × (1＋親愛度ボーナス) )   … 親愛度37なら ×1.5
 * 傾きは分数（1/150 など）なので、小数の誤差で切り上げが狂わないよう分子・分母を整数で持つ。
 *   選抜1: 〜3,000: 1/150 ／ 〜7,000: 3/1000 ／ 〜15,000: 1/1000 ／ それ以上: 0。素の上限 40（表示60）
 *   選抜2: 〜30,000: 11/6000 ／ 〜70,000: 33/40000 ／ 〜150,000: 11/40000 ／ それ以上: 0。上限 110（165）
 *   選抜3: 〜100,000: 11/20000 ／ 〜200,000: 33/100000 ／ 〜400,000: 11/100000 ／ それ以上: 0。上限 110（165）
 * 例: 選抜1のスコア 14,001 → 20＋12＋7.001＝39.001 → 切り上げ 40 → ×1.5＝60。2,850 → 19 → 28。2,851 → 20 → 30。
 */
export type ExamStarRule = {
  /** 区間の上端と、その区間の傾きの分子（傾き＝num／den）。上端を超えた分は傾き0 */
  segments: readonly { to: number; num: number }[];
  /** 傾きの共通の分母 */
  den: number;
  /** 素のスター性の上限（親愛度27以下の値） */
  cap: number;
};
export const EXAM_STAR_RULES: readonly ExamStarRule[] = [
  { den: 3000, cap: 40, segments: [{ to: 3000, num: 20 }, { to: 7000, num: 9 }, { to: 15000, num: 3 }] },
  { den: 120000, cap: 110, segments: [{ to: 30000, num: 220 }, { to: 70000, num: 99 }, { to: 150000, num: 33 }] },
  { den: 100000, cap: 110, segments: [{ to: 100000, num: 55 }, { to: 200000, num: 33 }, { to: 400000, num: 11 }] },
];

/** 素のスター性（親愛度27以下の値）。スコア×傾きの合計を切り上げ、上限で止める */
export function examStarBase(examIndex: number, score: number): number {
  const rule = EXAM_STAR_RULES[examIndex];
  if (!rule || score <= 0) return 0;
  const s = Math.floor(score);
  let numer = 0; // 分子の合計（÷den が素の値）
  let from = 0;
  for (const seg of rule.segments) {
    if (s <= from) break;
    numer += (Math.min(s, seg.to) - from) * seg.num;
    from = seg.to;
  }
  // 整数どうしなので切り上げに誤差が出ない
  const base = Math.floor((numer + rule.den - 1) / rule.den);
  return Math.min(rule.cap, base);
}

/** 選抜試験のスター性（親愛度のボーナス込み・切り捨て） */
export function examStar(
  examIndex: number,
  score: number,
  affection: number = AFFECTION_DEFAULT,
): number {
  return starWithAffection(examStarBase(examIndex, score), affection);
}

/** スター性が上限に達する合計スコア（これ以上入れても増えない。入力の上限に使う） */
export function examStarCapScore(examIndex: number): number {
  const rule = EXAM_STAR_RULES[examIndex];
  if (!rule) return Infinity;
  // 素の値が上限になる最小のスコア＝分子の合計が (上限−1)×den を初めて超える整数スコア
  const need = (rule.cap - 1) * rule.den;
  let numer = 0;
  let from = 0;
  for (const seg of rule.segments) {
    const total = (seg.to - from) * seg.num;
    if (numer + total > need) return from + Math.floor((need - numer) / seg.num) + 1;
    numer += total;
    from = seg.to;
  }
  return from;
}

/**
 * 数値表に出す「合計スコアの区間 → スター性」。オーナーの表と同じ区切り方
 * （素の値がその区間の累計に届かない範囲で1区間。選抜1: 0〜2,850／2,851〜6,666／6,667〜14,000／14,001〜）。
 */
export function examStarTable(
  examIndex: number,
  affection: number = AFFECTION_DEFAULT,
): { from: number; to: number; star: readonly [number, number] }[] {
  const rule = EXAM_STAR_RULES[examIndex];
  if (!rule) return [];
  const rows: { from: number; to: number; star: readonly [number, number] }[] = [];
  let from = 0; // 区間の最初のスコア
  let numer = 0; // ここまでの区間の分子の合計
  let segFrom = 0;
  for (const seg of rule.segments) {
    const total = (seg.to - segFrom) * seg.num;
    // この区間の終わりでの累計（素の値・整数）に届かない最後のスコア
    const cumulative = Math.round((numer + total) / rule.den);
    const need = Math.min(cumulative, rule.cap) * rule.den - rule.den;
    const to = Math.min(segFrom + Math.floor((need - numer) / seg.num), examStarCapScore(examIndex) - 1);
    if (to >= from) {
      rows.push({ from, to, star: [examStar(examIndex, from, affection), examStar(examIndex, to, affection)] });
      from = to + 1;
    }
    numer += total;
    segFrom = seg.to;
  }
  const capScore = examStarCapScore(examIndex);
  const capStar = examStar(examIndex, capScore, affection);
  rows.push({ from: capScore, to: Infinity, star: [capStar, capStar] });
  return rows;
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
