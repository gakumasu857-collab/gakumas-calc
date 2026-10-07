/**
 * サポカ所持状況ページ用の統合カタログ。
 *
 * スプシ由来のサポカDB（レアリティ/タイプ/アビリティを持つ）を正とし、
 * 画像は R2 バケット（gakumas-image）のフラットな「<カード名>.webp」で解決する。
 * → 最新カードはスプシに行を足し、同名の webp を R2 に上げれば表示される。
 */
import { ABILITY_NAMES, type AbilityName, type Rarity } from "./constants";
import { SUPPORT_CARD_DB } from "./supportCardsDb";

export type CatalogCard = {
  id: string;
  name: string;
  rarity: Rarity;
  /** スプシの id（登場順）と登場日（YYYY-MM-DD）。一覧の「新しい順」用 */
  sheetId: number;
  releaseDate: string;
  /** R2キー または フルURL（imageUrl()がどちらも解決する） */
  image: string;
  /** Vocal / Dance / Visual / アシスト */
  cardType: string;
  /** 使用制限（プラン）: 共通 / センス / ロジック / アノマリー */
  plan: string;
  /** 絞り込み用のアビリティキー一覧（位置・重複は問わない） */
  abilityKeys: AbilityName[];
};

export const SUPPORT_CATALOG: CatalogCard[] = SUPPORT_CARD_DB.map((card) => ({
  id: card.id,
  name: card.name,
  rarity: card.rarity,
  sheetId: card.sheetId,
  releaseDate: card.releaseDate,
  image: `${card.name}.webp`,
  cardType: card.cardType,
  plan: card.plan,
  abilityKeys: card.abilities
    .filter((slot): slot is { key: AbilityName } => slot !== null && "key" in slot)
    .map((slot) => slot.key),
}));

/** タイプフィルターの選択肢 */
export const CARD_TYPES = ["Vocal", "Dance", "Visual", "アシスト"] as const;

/** プランフィルターの選択肢（CSVの使用制限列の値） */
export const CARD_PLANS = ["共通", "センス", "ロジック", "アノマリー"] as const;

/** カタログに実際に登場するアビリティ（絞り込みセレクト用、定義順） */
export const USED_ABILITY_KEYS: AbilityName[] = (
  Object.keys(ABILITY_NAMES) as AbilityName[]
).filter((key) => SUPPORT_CATALOG.some((c) => c.abilityKeys.includes(key)));
