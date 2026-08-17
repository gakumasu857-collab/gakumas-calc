/**
 * 育成シナリオのマスターデータ。
 * 既存の H.I.F.（schedule.ts）に加え、N.I.A.（マスター）と 定期公演『初』（レジェンド）を持つ。
 * 数値の出典: 学マス攻略wiki（seesaawiki.jp/gakumasu）
 *   - N.I.A/マスター、定期公演『初』/レジェンド、最終プロデュース評価 の各ページ
 */

export type ScenarioKey = "hif" | "niaMaster" | "hatsuLegend";

export const SCENARIO_KEYS: ScenarioKey[] = ["hif", "niaMaster", "hatsuLegend"];

export const SCENARIO_LABELS: Record<ScenarioKey, string> = {
  hif: "H.I.F.（マスター）",
  niaMaster: "N.I.A.（マスター）",
  hatsuLegend: "初（レジェンド）",
};

/** タイプごとのステータス上限 */
export const SCENARIO_CAPS: Record<ScenarioKey, number> = {
  hif: 3200,
  niaMaster: 2600,
  hatsuLegend: 3000,
};

/** ホームの切替UIに出す説明 */
export const SCENARIO_NOTES: Record<ScenarioKey, string> = {
  hif: "上限3200 / 評価値 = Σステ×2 + スター性×7.5 + 本戦評価値 − 2000",
  niaMaster: "上限2600 / 評価値 = Σステ×2.3 + ファン投票数換算",
  hatsuLegend: "上限3000 / 評価値 = Σステ×2.1 + 最終順位分 + 試験スコア換算",
};

// ============================================================
// N.I.A.（マスター）
// ============================================================

/** 自主レッスン7回。value は [通常, SP]。選んだ1タイプのみ上昇（パラボ有効） */
export const NIA_LESSONS = [
  { label: "1週目", value: [80, 100], p: 20 },
  { label: "4週目", value: [80, 100], p: 20 },
  { label: "11週目", value: [100, 120], p: 25 },
  { label: "14週目", value: [100, 120], p: 25 },
  { label: "19週目", value: [120, 150], p: 30 },
  { label: "22週目", value: [120, 150], p: 30 },
  { label: "24週目", value: [120, 150], p: 30 },
] as const satisfies readonly {
  label: string;
  value: readonly [number, number];
  p: number;
}[];

/**
 * 営業7回。授業と同じく選んだ1タイプだけ上昇（パラメータボーナス無効）。
 * ファン投票数は営業先（リゾート/それ以外）と成功/大成功で決まる（親愛度Lv20込みの値）。
 */
export const NIA_SALES = [
  { label: "2週目", value: 80, votes: { resort: [3300, 4215], other: [3600, 4680] } },
  { label: "5週目", value: 80, votes: { resort: [3300, 4215], other: [3600, 4680] } },
  { label: "7週目", value: 80, votes: { resort: [3300, 4215], other: [3600, 4680] } },
  { label: "12週目", value: 110, votes: { resort: [4350, 5625], other: [4800, 6240] } },
  { label: "15週目", value: 110, votes: { resort: [4350, 5625], other: [4800, 6240] } },
  { label: "20週目", value: 130, votes: { resort: [5550, 7185], other: [6000, 7800] } },
  { label: "23週目", value: 130, votes: { resort: [5550, 7185], other: [6000, 7800] } },
] as const satisfies readonly {
  label: string;
  value: number;
  votes: { resort: readonly [number, number]; other: readonly [number, number] };
}[];

/** アイドルの審査タイプ（IDOL_RANKSのtag「バランス」→flat、「特化」→skew） */
export type NiaTag = "flat" | "skew";

/**
 * オーディション（1次・2次・最終）のタイプ別ステ上限。
 * [オーディション][流行順位-1] で引く。流行順位は審査基準ランク（1=メイン1）。
 */
export const NIA_AUDITION_CAPS: Record<NiaTag, readonly (readonly number[])[]> = {
  flat: [
    [92, 76, 62],
    [119, 98, 80],
    [172, 142, 116],
  ],
  skew: [
    [116, 69, 46],
    [149, 89, 59],
    [215, 129, 86],
  ],
};

/** 1次・2次オーディション（素点とファン投票数を手入力）。最終はスコアから導出 */
export const NIA_AUDITIONS = [{ name: "1次" }, { name: "2次" }] as const;

/** 1次・2次オーディションのファン投票数の上限目安（初期値に使用） */
export const NIA_AUDITION_VOTE_MAX = [12000, 17000] as const;

/** 最終オーディションのスコア初期値（ステ素点・投票数とも上限に到達する値） */
export const NIA_FINAL_SCORE_DEFAULT = 500000;

type Piece = { threshold: number; multiplier: number; constant: number };
const evalPieces = (pieces: readonly Piece[], score: number): number => {
  if (score <= 0) return 0;
  for (const p of pieces) {
    if (score >= p.threshold) {
      return Math.floor(score * p.multiplier + p.constant);
    }
  }
  return 0;
};

/** 最終オーディション: スコア→流行順位別のステ素点（マスター・FINALE想定） */
const NIA_FINALE_STAT: Record<NiaTag, Record<number, readonly Piece[]>> = {
  flat: {
    1: [
      { threshold: 134210, multiplier: 0, constant: 172 },
      { threshold: 66600, multiplier: 0.000756, constant: 70 },
      { threshold: 0, multiplier: 0.0018, constant: 0.5 },
    ],
    2: [
      { threshold: 63750, multiplier: 0, constant: 142 },
      { threshold: 31350, multiplier: 0.001276, constant: 61 },
      { threshold: 0, multiplier: 0.00325, constant: 0 },
    ],
    3: [
      { threshold: 36500, multiplier: 0, constant: 116 },
      { threshold: 17600, multiplier: 0.00182, constant: 50 },
      { threshold: 0, multiplier: 0.00465, constant: 0 },
    ],
  },
  skew: {
    1: [
      { threshold: 136070, multiplier: 0, constant: 215 },
      { threshold: 65350, multiplier: 0.000915, constant: 90.5 },
      { threshold: 0, multiplier: 0.0023, constant: 0 },
    ],
    2: [
      { threshold: 63250, multiplier: 0, constant: 129 },
      { threshold: 30900, multiplier: 0.00117, constant: 55 },
      { threshold: 0, multiplier: 0.00295, constant: 0 },
    ],
    3: [
      { threshold: 36100, multiplier: 0, constant: 86 },
      { threshold: 17800, multiplier: 0.00136, constant: 37 },
      { threshold: 0, multiplier: 0.003465, constant: 0 },
    ],
  },
};

/** 最終オーディションのスコア→流行順位（1〜3）のステ素点 */
export function niaFinaleStat(tag: NiaTag, rank: number, score: number): number {
  const pieces = NIA_FINALE_STAT[tag][rank];
  return pieces ? evalPieces(pieces, score) : 0;
}

/** 最終オーディションのスコア→ファン投票数 */
const NIA_FINALE_VOTES: readonly Piece[] = [
  { threshold: 1200582, multiplier: 0, constant: 32668 },
  { threshold: 640882, multiplier: 0.004126232489, constant: 27714.07 },
  { threshold: 260417, multiplier: 0.01821637749, constant: 18683.95 },
  { threshold: 0, multiplier: 0.07592333987, constant: 3656.17 },
];
export function niaFinaleVotes(score: number): number {
  return evalPieces(NIA_FINALE_VOTES, score);
}

/** 札（スキルカード）2枚獲得ごとのファン投票数（奇数の最後の1枚は無効） */
export const NIA_FUDA_PAIR_VOTES = 3000;
export function niaFudaVotes(fuda: number): number {
  return Math.floor(Math.max(0, fuda) / 2) * NIA_FUDA_PAIR_VOTES;
}

/** ファン投票数→評価値換算（マスター）。[投票数上限, 倍率, 固定値] を昇順で評価 */
const NIA_FAN_BRACKETS: readonly (readonly [number, number, number])[] = [
  [20000, 0.1, 0],
  [40000, 0.085, 300],
  [60000, 0.07, 900],
  [80000, 0.065, 1200],
  [100000, 0.06, 1600],
  [120000, 0.05, 2600],
  [140000, 0.04, 3800],
  [Infinity, 0.03, 5200],
];

/** ファン投票数→評価値（切り捨て） */
export function niaFanValue(votes: number): number {
  if (votes <= 0) return 0;
  for (const [cap, rate, fixed] of NIA_FAN_BRACKETS) {
    if (votes <= cap) return Math.floor(votes * rate + fixed);
  }
  return 0;
}

/** N.I.A.のパラメータ分の係数（評価値 = floor(Σステ × 2.3) + ファン投票数換算） */
export const NIA_PARAM_RATE = 2.3;

// ============================================================
// 定期公演『初』（レジェンド）
// ============================================================

/**
 * レジェンドレッスン5回。値は [通常, SP]。
 * - clear: クリアライン到達分（選んだタイプのみ上昇）
 * - perfectMain / perfectSub: パーフェクト時のメイン/残り2タイプそれぞれの上昇
 * ※ パーフェクト値はチャレンジPアイテムでレッスン上限を最大（+90）にした時の数値
 */
export const HATSU_LESSONS = [
  { label: "4週目", clear: [60, 85], perfectMain: [110, 140], perfectSub: [50, 55], p: 80 },
  { label: "7週目", clear: [90, 120], perfectMain: [144, 180], perfectSub: [53, 60], p: 80 },
  { label: "12週目", clear: [155, 190], perfectMain: [214, 260], perfectSub: [58, 70], p: 80 },
  { label: "14週目", clear: [245, 280], perfectMain: [320, 370], perfectSub: [75, 90], p: 80 },
  { label: "16週目", clear: [395, 455], perfectMain: [504, 570], perfectSub: [108, 115], p: 80 },
] as const satisfies readonly {
  label: string;
  clear: readonly [number, number];
  perfectMain: readonly [number, number];
  perfectSub: readonly [number, number];
  p: number;
}[];

/** 授業4回（選んだ1タイプに固定値） */
export const HATSU_CLASSES = [
  { label: "1週目", gain: 100 },
  { label: "2週目", gain: 100 },
  { label: "6週目", gain: 150 },
  { label: "15週目", gain: 200 },
] as const;

/**
 * 試験2回。順位に応じて全タイプ一律で上昇（スコア分配ではない）。
 * 中間は4位以下=不合格のため選択肢は1〜3位のみ。
 */
export const HATSU_EXAMS = [
  { name: "中間試験", rankGains: [80, 40, 20] as const, ranks: [1, 2, 3] as const },
  { name: "最終試験", rankGains: [160, 80, 40, 0] as const, ranks: [1, 2, 3, 4] as const },
] as const;

/** 最終試験の順位→評価値（1位/2位/3位/4位以下） */
export const HATSU_RANK_VALUES = [1700, 900, 500, 0] as const;

/** 中間試験スコア→評価値換算（有志検証の推定値）。[スコア上限, 倍率, 固定値] */
const HATSU_MID_BRACKETS: readonly (readonly [number, number, number])[] = [
  [10000, 0.11, 0],
  [20000, 0.08, 300],
  [30000, 0.05, 900],
  [40000, 0.008, 2160],
  [50000, 0.003, 2360],
  [60000, 0.002, 2410],
  [200000, 0.001, 2470],
  [Infinity, 0, 2670],
];

/** 最終試験スコア→評価値換算 */
const HATSU_FINAL_BRACKETS: readonly (readonly [number, number, number])[] = [
  [300000, 0.015, 0],
  [500000, 0.01, 1500],
  [600000, 0.008, 2500],
  [2000000, 0.001, 6700],
  [Infinity, 0, 8700],
];

/** 試験スコア→評価値（examIndex: 0=中間, 1=最終。切り捨て） */
export function hatsuExamValue(examIndex: 0 | 1, score: number): number {
  if (score <= 0) return 0;
  const brackets = examIndex === 0 ? HATSU_MID_BRACKETS : HATSU_FINAL_BRACKETS;
  for (const [cap, rate, fixed] of brackets) {
    if (score <= cap) return Math.floor(score * rate + fixed);
  }
  return 0;
}

/** 『初』レジェンドのパラメータ分の係数（評価値 = floor(Σステ × 2.1) + 順位分 + 試験換算） */
export const HATSU_PARAM_RATE = 2.1;
