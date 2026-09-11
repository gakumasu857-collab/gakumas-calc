import { useCallback, useEffect, useState } from "react";
import { SUPPORT_CARD_DB } from "@/data/supportCardsDb";
import { useSaveNotifier } from "./storeSync";
import type { PIdolOwnership } from "./useOwnedPIdols";

/**
 * 所持状況（サポカの凸＋Pアイドルの特訓/開花）の名前つきスナップショット＝「スロット」。
 *
 * - 所持状況ページでスロットを選ぶとその内容を読み込み、以後の変更は**そのスロットへ随時保存**される
 *   （保存先 = ACTIVE_KEY。いちいち「上書き保存」しなくてよい）
 * - 計算ページのセーブデータからも作られる（saveId 付き＝「セーブデータ用」）。
 *   セーブデータ用は所持状況ページでは別グループに分けて出す
 *
 * localStorage は複数のフック実体（所持状況ページ・計算ページのセーブ欄・所持ストアの自動保存）から
 * 触られるので、更新は常に「読み直してから書く」（load() を起点にする）。
 */
const STORAGE_KEY = "gakumas:ownedSaves:v1";
/** 今の所持状況の保存先（スロット）のID。無ければ変更はどこにも保存されない */
const ACTIVE_KEY = "gakumas:ownedSaves:active:v1";

export type OwnedSave = {
  id: string;
  name: string;
  savedAt: string;
  /** カードID→凸レベル（-1=未所持） */
  levels: Record<string, number>;
  /** Pアイドルkey→特訓/開花（旧データには無い） */
  pIdols?: Record<string, PIdolOwnership>;
  /** 計算ページのセーブデータに紐づくものはそのセーブID */
  saveId?: string;
  /**
   * 保存時のサポカDBの枚数（実装順）。読み込み時、levels に無いカードを
   * 「保存時に存在した＝未所持」「保存後に実装＝完凸」に振り分けるのに使う。
   * 無い旧データは全て未所持扱い。
   */
  cardCount?: number;
};

function load(): OwnedSave[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as OwnedSave[];
  } catch {
    // 破損データは無視
  }
  return [];
}

function store(saves: OwnedSave[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
  } catch {
    // 容量超過などは無視
  }
}

const today = () => new Date().toLocaleDateString("ja-JP");

export function readActiveSlotId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function writeActiveSlotId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // 保存できない環境では保存先なしとして動く
  }
}

/**
 * 所持ストア（サポカ凸／Pアイドル）の保存effectから呼ぶ。保存先スロットがあれば、
 * その中身を今の状態で更新する（中身が同じなら何もしない）。
 */
export function autoSaveToActiveSlot(patch: {
  levels?: Record<string, number>;
  pIdols?: Record<string, PIdolOwnership>;
}): void {
  const id = readActiveSlotId();
  if (!id) return;
  const saves = load();
  const index = saves.findIndex((s) => s.id === id);
  if (index < 0) {
    writeActiveSlotId(null); // 消えたスロットを指していた
    return;
  }
  const current = saves[index];
  const next: OwnedSave = { ...current };
  let changed = false;
  if (
    patch.levels &&
    JSON.stringify(patch.levels) !== JSON.stringify(current.levels)
  ) {
    next.levels = patch.levels;
    next.cardCount = SUPPORT_CARD_DB.length;
    changed = true;
  }
  if (
    patch.pIdols &&
    JSON.stringify(patch.pIdols) !== JSON.stringify(current.pIdols ?? {})
  ) {
    next.pIdols = patch.pIdols;
    changed = true;
  }
  if (!changed) return;
  next.savedAt = today();
  saves[index] = next;
  store(saves);
}

export function useOwnedSaves() {
  const [saves, setSaves] = useState<OwnedSave[]>(load);
  const [activeId, setActiveId] = useState<string | null>(readActiveSlotId);
  const notifySave = useSaveNotifier();

  useEffect(() => {
    store(saves);
    notifySave();
  }, [saves, notifySave]);

  /** 保存先スロットを切り替える（null=保存先なし） */
  const setActiveSlot = useCallback((id: string | null) => {
    writeActiveSlotId(id);
    setActiveId(id);
  }, []);

  /**
   * 保存（saveId 付きで既存があれば上書き）。付けた/使ったIDを返す。
   * 計算ページのセーブデータからは saveId を渡して1セーブ1件に保つ。
   */
  const upsert = useCallback(
    (entry: {
      name: string;
      levels: Record<string, number>;
      pIdols?: Record<string, PIdolOwnership>;
      saveId?: string;
    }): string => {
      // IDは更新関数の外で確定させる（更新関数は遅延実行されるので、その中で
      // 決めると呼び出し側へ返すIDがズレる）
      const existing = entry.saveId
        ? load().find((s) => s.saveId === entry.saveId)
        : undefined;
      const id = existing?.id ?? `own-${crypto.randomUUID()}`;
      const savedAt = today();
      const cardCount = SUPPORT_CARD_DB.length;
      setSaves(() => {
        const list = load();
        return list.some((s) => s.id === id)
          ? list.map((s) =>
              s.id === id ? { ...s, ...entry, savedAt, cardCount } : s,
            )
          : [...list, { id, savedAt, ...entry, cardCount }];
      });
      return id;
    },
    [],
  );

  /** 既存の保存を今の所持状況で上書きする（名前はそのまま） */
  const overwrite = useCallback(
    (
      id: string,
      entry: {
        levels: Record<string, number>;
        pIdols?: Record<string, PIdolOwnership>;
      },
    ) => {
      const savedAt = today();
      const cardCount = SUPPORT_CARD_DB.length;
      setSaves(() =>
        load().map((s) =>
          s.id === id ? { ...s, ...entry, savedAt, cardCount } : s,
        ),
      );
    },
    [],
  );

  const remove = useCallback(
    (id: string) => {
      setSaves(() => load().filter((s) => s.id !== id));
      if (readActiveSlotId() === id) setActiveSlot(null);
    },
    [setActiveSlot],
  );

  /** セーブデータ（計算ページ）に紐づく所持スナップショットを消す */
  const removeBySaveId = useCallback(
    (saveId: string) => {
      const doomed = load().filter((s) => s.saveId === saveId);
      setSaves(() => load().filter((s) => s.saveId !== saveId));
      if (doomed.some((s) => s.id === readActiveSlotId())) setActiveSlot(null);
    },
    [setActiveSlot],
  );

  const rename = useCallback((id: string, name: string) => {
    setSaves(() => load().map((s) => (s.id === id ? { ...s, name } : s)));
  }, []);

  return {
    saves,
    activeId,
    setActiveSlot,
    upsert,
    overwrite,
    remove,
    removeBySaveId,
    rename,
    loaded: true,
  };
}
