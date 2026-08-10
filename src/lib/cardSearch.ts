import CARD_READINGS from "@/data/cardReadings.json";
import { SUPPORT_CARD_DB } from "@/data/supportCardsDb";

/**
 * 検索用の正規化: 全角半角ゆらぎ(NFKC)・カタカナ→ひらがな・英字小文字化。
 * これで「オシャレ」を「おしゃれ」で、英字も大小どちらでも引ける。
 */
export function normalizeForSearch(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[ァ-ヶ]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0x60),
    )
    .toLowerCase();
}

const READINGS = CARD_READINGS as Record<string, string>;

/** カード名の読み仮名（ひらがな。無ければ undefined） */
export function cardReadingOf(name: string): string | undefined {
  return READINGS[name];
}

/** カード名 → 検索タグ（スプシ Search_word 列。正規化済み） */
const SEARCH_WORDS_BY_NAME = new Map<string, string[]>(
  SUPPORT_CARD_DB.filter((c) => c.searchWords.length > 0).map((c) => [
    c.name,
    c.searchWords.map(normalizeForSearch),
  ]),
);

/**
 * カード名がクエリにマッチするか。
 * 名前そのもの（正規化後）に加えて、読み仮名（漢字→ひらがな）と
 * スプシの検索タグ（別名・アイドル名など）でも一致を見る。
 * 例: 「私たちも成長〜」を「わたし」で、「ふわふわでワクワク」を「倉本千奈」で引ける。
 */
export function matchesCardQuery(name: string, query: string): boolean {
  const q = normalizeForSearch(query.trim());
  if (!q) return true;
  if (normalizeForSearch(name).includes(q)) return true;
  const reading = READINGS[name];
  if (reading && normalizeForSearch(reading).includes(q)) return true;
  const words = SEARCH_WORDS_BY_NAME.get(name);
  if (words && words.some((w) => w.includes(q))) return true;
  return false;
}
