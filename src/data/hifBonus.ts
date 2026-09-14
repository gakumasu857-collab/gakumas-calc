import type { TypeKey } from "@/lib/useCalcSettings";

/**
 * H.I.F.ボーナス（H.I.F.専用の仕様）。枠ごとにレベルがあり、計算に効くのは次の5つ:
 * - ボーカル／ダンス／ビジュアル上昇（Lv1〜5）: 固定 +20/+40/+60/+80/+100 と パラボ +2/4/6/8/10%
 * - SPレッスン発生率増加（Lv1〜5）: 全タイプ +1〜+5%（ゲーム内の「SPレッスン率上昇」表示に含まれる分）
 * - 【本戦】パラメータ上限増加（Lv1〜6）: +50/+80/+110/+140/+170/+200（上限 3000 に足す）
 * 計算に効かない枠（試験前の体力回復量・選抜／本戦の初期Pポイント・相談の割引）は持たない。
 * 既定はすべて最大（＝従来の固定 +100・パラボ +10%・SP率 +5%・上限 3200）。
 */
export type HifBonusLevels = {
  vocal: number;
  dance: number;
  visual: number;
  spRate: number;
  finalCap: number;
};

/** レベル→値（添字＝レベル。0＝無し） */
export const HIF_BONUS_STAT_FIXED = [0, 20, 40, 60, 80, 100] as const;
export const HIF_BONUS_STAT_PCT = [0, 2, 4, 6, 8, 10] as const;
export const HIF_BONUS_SP = [0, 1, 2, 3, 4, 5] as const;
export const HIF_BONUS_CAP = [0, 50, 80, 110, 140, 170, 200] as const;
/** 本戦のステ上限の素の値（ボーナス無し） */
export const HIF_BASE_CAP = 3000;

export const HIF_BONUS_MAX: HifBonusLevels = {
  vocal: 5,
  dance: 5,
  visual: 5,
  spRate: 5,
  finalCap: 6,
};

const clampLevel = (v: unknown, max: number, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.min(max, Math.max(0, Math.round(v)))
    : fallback;

/** 保存値を整える（欠け・範囲外は最大に寄せる） */
export function normalizeHifBonus(raw: Partial<HifBonusLevels> | undefined): HifBonusLevels {
  return {
    vocal: clampLevel(raw?.vocal, 5, HIF_BONUS_MAX.vocal),
    dance: clampLevel(raw?.dance, 5, HIF_BONUS_MAX.dance),
    visual: clampLevel(raw?.visual, 5, HIF_BONUS_MAX.visual),
    spRate: clampLevel(raw?.spRate, 5, HIF_BONUS_MAX.spRate),
    finalCap: clampLevel(raw?.finalCap, 6, HIF_BONUS_MAX.finalCap),
  };
}

/** レベルから計算に使う値へ */
export function hifBonusValues(raw: Partial<HifBonusLevels> | undefined) {
  const lv = normalizeHifBonus(raw);
  const fixed: Record<TypeKey, number> = {
    vocal: HIF_BONUS_STAT_FIXED[lv.vocal],
    dance: HIF_BONUS_STAT_FIXED[lv.dance],
    visual: HIF_BONUS_STAT_FIXED[lv.visual],
  };
  const pct: Record<TypeKey, number> = {
    vocal: HIF_BONUS_STAT_PCT[lv.vocal],
    dance: HIF_BONUS_STAT_PCT[lv.dance],
    visual: HIF_BONUS_STAT_PCT[lv.visual],
  };
  return {
    levels: lv,
    fixed,
    pct,
    /** SPレッスン率の上乗せ（小数。既定 0.05） */
    spRate: HIF_BONUS_SP[lv.spRate] / 100,
    /** 本戦のステ上限（既定 3200） */
    statCap: HIF_BASE_CAP + HIF_BONUS_CAP[lv.finalCap],
  };
}

/** すべて最大か */
export function isHifBonusMax(raw: Partial<HifBonusLevels> | undefined): boolean {
  const lv = normalizeHifBonus(raw);
  return (Object.keys(HIF_BONUS_MAX) as (keyof HifBonusLevels)[]).every(
    (k) => lv[k] === HIF_BONUS_MAX[k],
  );
}
