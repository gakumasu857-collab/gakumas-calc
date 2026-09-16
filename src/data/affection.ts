/**
 * 親愛度（Pアイドルとの親愛度Lv）。表はオーナー提供（2026-09-16）。計算に効くのは次の3つだけ:
 * - スター性ボーナス（H.I.F.）: Lv28 +5%／29 +10%／30 +15%／31 +20%／32 +25%／33 +30%／34 +35%／35 +40%／36〜37 +50%
 *   スター性の各項（ワッペン1回・レッスン1回・選抜1回・本戦1ラウンド）は「素の値 × (1＋ボーナス)」を切り捨て。
 *   計算機が以前使っていたスター性（選抜165・本戦150→225・レッスン5→7・ワッペン10→15 など）は全部 Lv37（+50%）の値だった。
 * - 初期Pポイント（STEP3のPポイント）: Lv21〜23 +10／24〜25 +20／26〜 +30（H.I.F.では選抜の開始時Pポイントにだけ足す。本戦にはかからない）
 * - 最大体力上昇: Lv22〜24 +1／25〜 +2（Pアイドルの体力に足す。スプシのPアイドルstatusからは外した）
 * 20以下は3つとも0で同じなので「20以下」を1つの選択肢にする（21〜37は1つずつ）。既定は37（一番星）。
 */
export const AFFECTION_MIN = 20; // 「20以下」
export const AFFECTION_MAX = 37;
export const AFFECTION_DEFAULT = AFFECTION_MAX;

/** 選択肢（20＝「20以下」、21〜37） */
export const AFFECTION_CHOICES: number[] = Array.from(
  { length: AFFECTION_MAX - AFFECTION_MIN + 1 },
  (_, i) => AFFECTION_MIN + i,
);

/** 保存値の正規化（無ければ既定の37。範囲外は丸める） */
export function normalizeAffection(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return AFFECTION_DEFAULT;
  return Math.min(AFFECTION_MAX, Math.max(AFFECTION_MIN, Math.round(raw)));
}

const STAR_BONUS: Record<number, number> = {
  28: 0.05,
  29: 0.1,
  30: 0.15,
  31: 0.2,
  32: 0.25,
  33: 0.3,
  34: 0.35,
  35: 0.4,
  36: 0.5,
  37: 0.5,
};

/** スター性ボーナス（割合。Lv27以下は0） */
export function affectionStarBonus(level: number): number {
  return STAR_BONUS[normalizeAffection(level)] ?? 0;
}

/** 初期Pポイント（STEP3のPポイント。Lv20以下は0） */
export function affectionStepP(level: number): number {
  const lv = normalizeAffection(level);
  if (lv >= 26) return 30;
  if (lv >= 24) return 20;
  if (lv >= 21) return 10;
  return 0;
}

/** 最大体力上昇（Lv21以下は0） */
export function affectionHpBonus(level: number): number {
  const lv = normalizeAffection(level);
  if (lv >= 25) return 2;
  if (lv >= 22) return 1;
  return 0;
}

/**
 * スター性の1項に親愛度ボーナスを掛ける（切り捨て）。
 * base は素の値（親愛度27以下の値）。浮動小数の誤差で 7.5→7.4999 にならないよう、ごくわずかに足してから切り捨てる。
 */
export function starWithAffection(base: number, level: number): number {
  return Math.floor(base * (1 + affectionStarBonus(level)) + 1e-9);
}

/** 表示用のラベル（「20以下」か「Lv37」） */
export function affectionLabel(level: number): string {
  const lv = normalizeAffection(level);
  return lv <= AFFECTION_MIN ? "20以下" : `Lv${lv}`;
}

/** 設定欄の要約（例「スター性+50%・初期P+30・最大体力+2」） */
export function affectionSummary(level: number): string {
  const star = Math.round(affectionStarBonus(level) * 100);
  const p = affectionStepP(level);
  const hp = affectionHpBonus(level);
  if (star === 0 && p === 0 && hp === 0) return "ボーナスなし";
  return [
    star > 0 ? `スター性+${star}%` : "スター性なし",
    p > 0 ? `初期P+${p}` : "初期Pなし",
    hp > 0 ? `最大体力+${hp}` : "最大体力なし",
  ].join("・");
}
