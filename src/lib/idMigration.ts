/**
 * 保存キーの移行（2026-10-08、オーナー「id管理にしてほしい」）。
 *
 * - サポカの保存キーは `card:<スプシのid>`（以前は `card:<名前>`。名前を変えると所持状況・編成・BAN・セーブが切れていた）
 * - Pアイドルの保存キーは `pidol:<スプシのid>`（以前は「名前カード名」）
 *
 * 利用者の localStorage・セーブデータには旧キーが残っているので、各ストアは読むときにここで今のキーへ写す。
 * 名前が今のマスタに無い旧キー（消えたカード・未知の名前）はそのまま残す（捨てない）。
 * 旧キーと新キーの両方があるときは新キーの値を優先する。
 */
import { SUPPORT_CARD_DB } from "@/data/supportCardsDb";
import { P_IDOL_MASTERS } from "@/lib/pIdol";

/** 旧キー（card:名前）→ 今のキー（card:id）。同じなら登録しない */
const CARD_ID_BY_LEGACY = new Map<string, string>();
for (const c of SUPPORT_CARD_DB) {
  const legacy = `card:${c.name}`;
  if (legacy !== c.id) CARD_ID_BY_LEGACY.set(legacy, c.id);
}

/** 旧キー（名前カード名）→ 今のキー（pidol:id） */
const PIDOL_KEY_BY_LEGACY = new Map<string, string>();
for (const m of P_IDOL_MASTERS) {
  if (m.legacyKey && m.legacyKey !== m.key) PIDOL_KEY_BY_LEGACY.set(m.legacyKey, m.key);
}

/** サポカのキーを今の形にする（今の形・未知のものはそのまま） */
export function migrateCardId(id: string): string {
  return CARD_ID_BY_LEGACY.get(id) ?? id;
}

/** Pアイドルのキーを今の形にする（今の形・未知のものはそのまま） */
export function migratePIdolKey(key: string): string {
  return PIDOL_KEY_BY_LEGACY.get(key) ?? key;
}

function migrateKeys<T>(
  map: Record<string, T> | null | undefined,
  migrate: (key: string) => string,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(map ?? {})) {
    const next = migrate(key);
    // 旧キーの値は、新キーの値がまだ無いときだけ使う（両方あれば新キーを優先）
    if (next === key || !(next in out)) out[next] = value;
  }
  return out;
}

/** カードID→値 の表（所持凸・BAN/固定・前イベ後イベの設定など）のキーを今の形にする */
export function migrateCardIdKeys<T>(map: Record<string, T> | null | undefined): Record<string, T> {
  return migrateKeys(map, migrateCardId);
}

/** Pアイドルkey→値 の表（特訓・開花）のキーを今の形にする */
export function migratePIdolKeys<T>(map: Record<string, T> | null | undefined): Record<string, T> {
  return migrateKeys(map, migratePIdolKey);
}

/** 選択サポカの枠（{ id, rental }）のIDを今の形にする */
export function migrateSlotIds<T extends { id: string }>(
  slots: readonly (T | null | undefined)[],
): (T | null)[] {
  return slots.map((s) => (s ? { ...s, id: migrateCardId(s.id) } : null));
}
