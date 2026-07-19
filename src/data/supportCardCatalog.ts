/**
 * サポカ所持状況ページ用の統合カタログ。
 *
 * CSV由来のサポカDB（レアリティ/タイプ/アビリティを持つ）を正とし、
 * 画像はR2にあるもの（カード名一致）を優先、無ければCSVの画像URLを使う。
 * → 最新カードはCSVに行を足すだけで表示され、R2に画像を上げれば自動で切り替わる。
 */
import { ABILITY_NAMES, type AbilityName, type Rarity } from "./constants";
import { SUPPORT_CARDS } from "./supportCards";
import { SUPPORT_CARD_DB } from "./supportCardsDb";

export type CatalogCard = {
  id: string;
  name: string;
  rarity: Rarity;
  /** R2キー または フルURL（imageUrl()がどちらも解決する） */
  image: string;
  /** Vocal / Dance / Visual / アシスト */
  cardType: string;
  /** 使用制限（プラン）: 共通 / センス / ロジック / アノマリー */
  plan: string;
  /** 絞り込み用のアビリティキー一覧（位置・重複は問わない） */
  abilityKeys: AbilityName[];
};

/** カード名 → R2画像キー（既存のR2一覧から） */
const R2_IMAGE_BY_NAME = new Map(SUPPORT_CARDS.map((c) => [c.name, c.image]));

export const SUPPORT_CATALOG: CatalogCard[] = SUPPORT_CARD_DB.map((card) => ({
  id: card.id,
  name: card.name,
  rarity: card.rarity,
  image: R2_IMAGE_BY_NAME.get(card.name) ?? card.imageUrl,
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
