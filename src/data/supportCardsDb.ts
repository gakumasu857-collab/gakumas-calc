/**
 * サポカDB（CSV由来）へのアクセス層。
 *
 * generated/supportCards.json（gen:cardsで生成される「ヘッダー名→値」の生データ）を
 * 型の付いた SupportCardData に変換する。CSVの解釈はすべてこのファイルに集約し、
 * 列やアビリティ名が増えたときの修正箇所を1箇所にする。
 *
 * 変換の方針:
 * - 知らないアビリティラベル → キー変換せず { raw: "..." } で保持（データを落とさない）
 * - 知らない列 → extras にそのまま残す（後から使える）
 */
import rawRows from "./generated/supportCards.json";
import {
  abilityKeyFromLabel,
  RARITY_ALIASES,
  type AbilityName,
  type CardType,
  type Rarity,
} from "./constants";

/** アビリティ枠。キー化できなかったラベルは raw のまま保持する */
export type AbilitySlot =
  | { key: AbilityName }
  | { raw: string };

export type SupportCardData = {
  /** CSVのid列。空なら名前から生成（名前が変わらない限り安定） */
  id: string;
  name: string;
  rarity: Rarity;
  /** Vocal / Dance / Visual / アシスト */
  cardType: CardType | string;
  /**
   * アビリティ1〜6を位置そのままで保持（「何もなし」「空欄」は null）。
   * 枠の位置は凸解放段階に対応する可能性があるため詰めない。
   */
  abilities: (AbilitySlot | null)[];
  /** 元CSVの画像URL（将来はR2のキーに置き換える想定） */
  imageUrl: string;
  /** 使用制限（プラン）: 共通 / センス / ロジック / アノマリー */
  plan: string;
  /** 前イベ（アイテム/スキル）・後イベ（強化/チェンジ/体力回復等） */
  preEventType: string;
  postEventType: string;
  /** 上記以外の列すべて（列名→値）。新列は自動的にここへ入る */
  extras: Record<string, string>;
};

/** 変換時に見つかった未知のアビリティラベル（データ整備の手掛かり用） */
export const UNKNOWN_ABILITY_LABELS = new Set<string>();

// CSVの主要列名（スプレッドシート側の列名を変えたらここだけ直す）
const COL = {
  id: "id",
  name: "サポカ名称",
  imageUrl: "サポカ画像URL",
  rarity: "レアリティ",
  cardType: "タイプ",
  abilityPrefix: "アビリティ", // アビリティ1〜6
  plan: "使用制限",
  preEvent: "前イベ",
  postEvent: "後イベ",
} as const;

/** 「何もなし」系の空欄扱いにするラベル */
const EMPTY_LABELS = new Set(["", "何もなし", "なし", "-"]);

function toAbilitySlot(label: string): AbilitySlot | null {
  if (EMPTY_LABELS.has(label.trim())) return null;
  const key = abilityKeyFromLabel(label);
  if (key) return { key };
  UNKNOWN_ABILITY_LABELS.add(label);
  return { raw: label };
}

function convert(row: Record<string, string>): SupportCardData | null {
  const name = row[COL.name]?.trim() ?? "";
  // 名前のない行やシート用のダミー行（固定用）はスキップ
  if (!name || name === "固定用") return null;

  // 6枠を位置そのままで保持（何もなし/空欄は null）
  const abilities: (AbilitySlot | null)[] = Array.from({ length: 6 }, (_, i) =>
    toAbilitySlot(row[`${COL.abilityPrefix}${i + 1}`] ?? ""),
  );

  const knownCols = new Set<string>([
    COL.id,
    COL.name,
    COL.imageUrl,
    COL.rarity,
    COL.cardType,
    COL.plan,
    COL.preEvent,
    COL.postEvent,
    ...Array.from({ length: 6 }, (_, i) => `${COL.abilityPrefix}${i + 1}`),
  ]);
  const extras: Record<string, string> = {};
  for (const [col, value] of Object.entries(row)) {
    if (!knownCols.has(col) && value !== "") extras[col] = value;
  }

  return {
    id: row[COL.id]?.trim() || `card:${name}`,
    name,
    rarity: RARITY_ALIASES[row[COL.rarity]?.trim() ?? ""] ?? "SSR",
    cardType: (row[COL.cardType]?.trim() as CardType | string) || "",
    abilities,
    imageUrl: row[COL.imageUrl]?.trim() ?? "",
    plan: row[COL.plan]?.trim() ?? "",
    preEventType: row[COL.preEvent]?.trim() ?? "",
    postEventType: row[COL.postEvent]?.trim() ?? "",
    extras,
  };
}

/** CSV由来のサポカ全件（gen:cards 未実行のうちは空配列） */
export const SUPPORT_CARD_DB: SupportCardData[] = (
  rawRows as Record<string, string>[]
)
  .map(convert)
  .filter((c): c is SupportCardData => c !== null);

if (UNKNOWN_ABILITY_LABELS.size > 0 && process.env.NODE_ENV !== "production") {
  console.warn(
    "[supportCardsDb] 未知のアビリティ名があります（constants.tsのABILITY_NAMESかALIASESに追加してください）:",
    [...UNKNOWN_ABILITY_LABELS],
  );
}
