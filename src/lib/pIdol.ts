/**
 * Pアイドルのマスターデータとステータス計算（スプシ準拠・検算一致済み）。
 *
 * ステータス = 初期 + 特訓1(段階>=1) + 特訓4(>=4) + 特訓5(>=5)
 *            + 才能開花3(開花>=3) + 才能開花4(>=4) の各ブロック加算。
 * （所持Pアイドルステ!L2 の式の移植。所持95枚で検算一致を確認済み）
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
  /** 名前カード名（一意キー） */
  key: string;
  growthTag: string;
};

type GrowthBlocks = {
  base: number[];
  kunren1: number[];
  kunren4: number[];
  kunren5: number[];
  kaika3: number[];
  kaika4: number[];
};

const typed = data as {
  masters: PIdolMaster[];
  growth: Record<string, GrowthBlocks>;
  idolRanks: Record<
    string,
    { vocal: number; dance: number; visual: number; tag: string }
  >;
};

export const P_IDOL_MASTERS = typed.masters;
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
};

/** 特訓段階・才能開花からステータスを計算する */
export function computePIdolStats(
  growthTag: string,
  kunren: number,
  kaika: number,
): PIdolStats | null {
  const g = P_IDOL_GROWTH[growthTag];
  if (!g) return null;
  const sum = (i: number) =>
    g.base[i] +
    (kunren >= 1 ? g.kunren1[i] : 0) +
    (kunren >= 4 ? g.kunren4[i] : 0) +
    (kunren >= 5 ? g.kunren5[i] : 0) +
    (kaika >= 3 ? g.kaika3[i] : 0) +
    (kaika >= 4 ? g.kaika4[i] : 0);
  return {
    hp: sum(0),
    fixed: { vocal: sum(1), dance: sum(2), visual: sum(3) },
    parabo: { vocal: sum(4), dance: sum(5), visual: sum(6) },
  };
}
