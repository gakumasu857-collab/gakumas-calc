/**
 * Pアイドルのマスターデータとステータス計算（スプシ準拠）。
 *
 * ステータス = base（初期＋初＋NIA＋HIF＋親愛度22/25。無条件加算ぶんは生成時に合算済み）
 *            + 特訓1/2/4/5/6（特訓段階が達していれば加算）
 *            + 才能開花1/3/4（開花段階が達していれば加算）
 * パラボ・SP率はスプシが小数表記（0.11 = 11%）。パラボは%に変換して返し、
 * SP率は割合（0.15 = 15%）のまま返す。
 */
import data from "@/data/generated/pIdols.json";

export type PIdolMaster = {
  url: string;
  idol: string;
  cardName: string;
  /** アイドル固有スキルの名前（スプシ 固有スキル名 列。旧データは空文字） */
  skillName: string;
  rarity: string;
  plan: string;
  effect: string;
  /** 保存キー `pidol:<スプシのid>`（2026-10-08〜。id が無い旧データだけ名前カード名）。所持状況・セーブデータはこれで持つ */
  key: string;
  /** 旧キー（名前カード名。2026-10-08 より前の保存データを読むときの移行用） */
  legacyKey: string;
  growthTag: string;
  /** スプシ pidleName の id 列（登場順。2026-10-07 追加）。保存キーの元なので、スプシ側で変えない・使い回さない */
  sheetId: number;
};

type GrowthBlocks = {
  base: number[];
  kunren1: number[];
  kunren2: number[];
  kunren4: number[];
  kunren5: number[];
  kunren6: number[];
  kaika1: number[];
  kaika3: number[];
  kaika4: number[];
};

const typed = data as {
  /** 生成データの key は名前カード名（旧キー）。保存キー pidol:<id> はここで付ける */
  masters: Omit<PIdolMaster, "legacyKey">[];
  growth: Record<string, GrowthBlocks>;
  idolRanks: Record<
    string,
    { vocal: number; dance: number; visual: number; tag: string }
  >;
};

export const P_IDOL_MASTERS: PIdolMaster[] = typed.masters.map((m) => ({
  ...m,
  legacyKey: m.key,
  key: m.sheetId > 0 ? `pidol:${m.sheetId}` : m.key,
}));
export const P_IDOL_GROWTH = typed.growth;
/** アイドルごとの審査基準ランク（Vo/Da/Vi）とバランス/特化タグ */
export const IDOL_RANKS = typed.idolRanks;

/**
 * 計算ページの設定（アイドル名＋Pアイドル名）から選択中のPアイドルを引く。
 * Pアイドル未指定ならそのアイドルの先頭カード（計算ページのselectと同じ挙動）。
 */
export function findPIdolMaster(
  idol: string,
  cardName: string,
): PIdolMaster | null {
  const cards = P_IDOL_MASTERS.filter((m) => m.idol === idol);
  return cards.find((m) => m.cardName === cardName) ?? cards[0] ?? null;
}

export type PIdolStats = {
  hp: number;
  fixed: { vocal: number; dance: number; visual: number };
  /** パラボ%（例: 19.5） */
  parabo: { vocal: number; dance: number; visual: number };
  /** SPレッスン率の上昇分（割合。0.15 = +15%） */
  spRate: { vocal: number; dance: number; visual: number };
};

/** 特訓段階・才能開花からステータスを計算する */
export function computePIdolStats(
  growthTag: string,
  kunren: number,
  kaika: number,
): PIdolStats | null {
  const g = P_IDOL_GROWTH[growthTag];
  if (!g) return null;
  // 無条件段階（初・NIA・HIF・親愛度22/25）は base に合算済み
  const sum = (i: number) =>
    g.base[i] +
    (kunren >= 1 ? g.kunren1[i] : 0) +
    (kunren >= 2 ? g.kunren2[i] : 0) +
    (kunren >= 4 ? g.kunren4[i] : 0) +
    (kunren >= 5 ? g.kunren5[i] : 0) +
    (kunren >= 6 ? g.kunren6[i] : 0) +
    (kaika >= 1 ? g.kaika1[i] : 0) +
    (kaika >= 3 ? g.kaika3[i] : 0) +
    (kaika >= 4 ? g.kaika4[i] : 0);
  // パラボ・SP率はスプシが小数表記（0.11 = 11%）。合算の浮動小数ノイズを丸める
  const pct = (i: number) => Math.round(sum(i) * 10000) / 100;
  const frac = (i: number) => Math.round(sum(i) * 10000) / 10000;
  return {
    hp: sum(0),
    fixed: { vocal: sum(1), dance: sum(2), visual: sum(3) },
    parabo: { vocal: pct(4), dance: pct(5), visual: pct(6) },
    spRate: { vocal: frac(7), dance: frac(8), visual: frac(9) },
  };
}
