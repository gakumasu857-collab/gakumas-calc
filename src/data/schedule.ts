/**
 * レッスン・オーディション（選抜試験）・授業ページのマスターデータ。
 *
 * レッスンは「スター性重視の公開レッスン」と「通常の公開レッスン」の2種で、
 * 値は [非SP, SP] のペアで持つ。
 *
 * ※ サブパラメータは「選択しなかった残り2タイプの両方に入る」想定で計算している。
 *   （1タイプのみ等、実際の仕様が違う場合は要修正 → ヘルプモーダルにも明記）
 */

export type LessonKind = "star" | "normal";

/** HIFワッペンの最大発動回数（札を何枚取ってもこれ以上は発動しない） */
export const WAPPEN_MAX = 20;

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
 * 選抜試験の獲得スター性（コミュニティの近似式・暫定版を1.5倍スケール）。
 * Y=スター性, X=合計スコア。上限は EXAMS.starCap × 1.5。
 */
export function examStar(examIndex: number, score: number): number {
  if (score <= 0) return 0;
  const formulas: ((x: number) => number)[] = [
    (x) => 26 + 0.001 * x,
    (x) => (x <= 72500 ? 40 + x / 1500 : 70 + 0.000275 * x),
    (x) => (x <= 180000 ? 13 + x / 2500 : 65 + x / 9000),
  ];
  const raw = Math.floor(formulas[examIndex](score) * STAR_SCALE);
  return Math.max(0, Math.min(EXAMS[examIndex].starCap * STAR_SCALE, raw));
}

/**
 * 本戦ラウンド。スター性は固定値、スコア評価値は区分線形（シートの実式）。
 * brackets: [スコア上限, 差し引き基準, 係数, 加算ベース] を昇順で評価。
 */
export const FINAL_ROUNDS = [
  {
    name: "ラウンド1",
    star: 180,
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
    star: 225,
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
