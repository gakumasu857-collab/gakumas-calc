import type { TypeKey } from "@/lib/useCalcSettings";

/**
 * H.I.F.ボーナス（H.I.F.専用の仕様）。枠ごとにレベルがあり、計算に効くのは次の8つ:
 * - ボーカル／ダンス／ビジュアル上昇の固定値（Lv1〜5）: +20/+40/+60/+80/+100
 * - ボーカル／ダンス／ビジュアル上昇のパラボ（Lv1〜5）: +2/4/6/8/10%（固定値とは別のレベル）
 * - SPレッスン発生率増加（Lv1〜5）: 全タイプ +1〜+5%（ゲーム内の「SPレッスン率上昇」表示に含まれる分）
 * - 【本戦】パラメータ上限増加（Lv1〜6）: +50/+80/+110/+140/+170/+200（上限 3000 に足す）
 * - 【選抜試験】／【本戦】初期Pポイント増加（それぞれ Lv1〜6）: +50/+80/+110/+140/+170/+200（Pポイントの表示にだけ効く）
 * 計算に効かない枠（試験前の体力回復量・相談の割引）は持たない。
 * 既定はすべて最大（＝従来の固定 +100・パラボ +10%・SP率 +5%・上限 3200）。
 */
export type HifBonusLevels = {
  /** タイプ別の固定値のレベル（0〜5） */
  fixed: Record<TypeKey, number>;
  /** タイプ別のパラボのレベル（0〜5） */
  pct: Record<TypeKey, number>;
  spRate: number;
  finalCap: number;
  /** 【選抜試験】初期Pポイント増加のレベル（0〜6） */
  startPSenbatsu: number;
  /** 【本戦】初期Pポイント増加のレベル（0〜6） */
  startPHonsen: number;
};

/** レベル→値（添字＝レベル。0＝無し） */
export const HIF_BONUS_STAT_FIXED = [0, 20, 40, 60, 80, 100] as const;
export const HIF_BONUS_STAT_PCT = [0, 2, 4, 6, 8, 10] as const;
export const HIF_BONUS_SP = [0, 1, 2, 3, 4, 5] as const;
export const HIF_BONUS_CAP = [0, 50, 80, 110, 140, 170, 200] as const;
export const HIF_BONUS_START_P = [0, 50, 80, 110, 140, 170, 200] as const;
/** 本戦のステ上限の素の値（ボーナス無し） */
export const HIF_BASE_CAP = 3000;

/** 全部最大（新しいオブジェクトを返す） */
export function hifBonusMax(): HifBonusLevels {
  return {
    fixed: { vocal: 5, dance: 5, visual: 5 },
    pct: { vocal: 5, dance: 5, visual: 5 },
    spRate: 5,
    finalCap: 6,
    startPSenbatsu: 6,
    startPHonsen: 6,
  };
}
export const HIF_BONUS_MAX: HifBonusLevels = hifBonusMax();

const TYPES: TypeKey[] = ["vocal", "dance", "visual"];

const clampLevel = (v: unknown, max: number, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.min(max, Math.max(0, Math.round(v)))
    : fallback;

/**
 * 保存値を整える（欠け・範囲外は最大に寄せる）。
 * 旧形式（vocal/dance/visual に固定値とパラボ共通のレベル1つ）はそのレベルを両方に使う。
 */
export function normalizeHifBonus(raw: unknown): HifBonusLevels {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const fixedRaw = (r.fixed && typeof r.fixed === "object" ? r.fixed : {}) as Record<string, unknown>;
  const pctRaw = (r.pct && typeof r.pct === "object" ? r.pct : {}) as Record<string, unknown>;
  const pick = (obj: Record<string, unknown>, t: TypeKey) =>
    clampLevel(obj[t] ?? r[t], 5, 5);
  const fixed = { vocal: 0, dance: 0, visual: 0 } as Record<TypeKey, number>;
  const pct = { vocal: 0, dance: 0, visual: 0 } as Record<TypeKey, number>;
  for (const t of TYPES) {
    fixed[t] = pick(fixedRaw, t);
    pct[t] = pick(pctRaw, t);
  }
  return {
    fixed,
    pct,
    spRate: clampLevel(r.spRate, 5, 5),
    finalCap: clampLevel(r.finalCap, 6, 6),
    startPSenbatsu: clampLevel(r.startPSenbatsu, 6, 6),
    startPHonsen: clampLevel(r.startPHonsen, 6, 6),
  };
}

/** レベルから計算に使う値へ */
export function hifBonusValues(raw: unknown) {
  const lv = normalizeHifBonus(raw);
  const fixed = { vocal: 0, dance: 0, visual: 0 } as Record<TypeKey, number>;
  const pct = { vocal: 0, dance: 0, visual: 0 } as Record<TypeKey, number>;
  for (const t of TYPES) {
    fixed[t] = HIF_BONUS_STAT_FIXED[lv.fixed[t]];
    pct[t] = HIF_BONUS_STAT_PCT[lv.pct[t]];
  }
  return {
    levels: lv,
    fixed,
    pct,
    /** SPレッスン率の上乗せ（小数。既定 0.05） */
    spRate: HIF_BONUS_SP[lv.spRate] / 100,
    /** 本戦のステ上限（既定 3200） */
    statCap: HIF_BASE_CAP + HIF_BONUS_CAP[lv.finalCap],
    /** 初期Pポイント（選抜試験開始時・本戦開始時。既定 200 ずつ） */
    startP: {
      senbatsu: HIF_BONUS_START_P[lv.startPSenbatsu],
      honsen: HIF_BONUS_START_P[lv.startPHonsen],
    },
  };
}

/** すべて最大か */
export function isHifBonusMax(raw: unknown): boolean {
  const lv = normalizeHifBonus(raw);
  return (
    TYPES.every((t) => lv.fixed[t] === 5 && lv.pct[t] === 5) &&
    lv.spRate === 5 &&
    lv.finalCap === 6 &&
    lv.startPSenbatsu === 6 &&
    lv.startPHonsen === 6
  );
}
