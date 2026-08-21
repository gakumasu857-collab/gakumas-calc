import { useCallback, useEffect, useState } from "react";
import { useSaveNotifier } from "./storeSync";
import type { PIdolOwnership } from "./useOwnedPIdols";

/**
 * 所持状況（サポカの凸＋Pアイドルの特訓/開花）の名前つきスナップショット。
 *
 * - 所持状況ページから手動で保存・読み込みできる
 * - 計算ページのセーブデータからも作られる（saveId 付き＝「セーブデータ用」）。
 *   セーブデータ用は所持状況ページでは既定で畳んでおく（増えても邪魔にならないように）
 */
const STORAGE_KEY = "gakumas:ownedSaves:v1";

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

export function useOwnedSaves() {
  const [saves, setSaves] = useState<OwnedSave[]>(load);
  const notifySave = useSaveNotifier();

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
      notifySave();
    } catch {
      // 容量超過などは無視
    }
  }, [saves, notifySave]);

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
        ? saves.find((s) => s.saveId === entry.saveId)
        : undefined;
      const id = existing?.id ?? `own-${crypto.randomUUID()}`;
      const savedAt = new Date().toLocaleDateString("ja-JP");
      setSaves((prev) =>
        prev.some((s) => s.id === id)
          ? prev.map((s) => (s.id === id ? { ...s, ...entry, savedAt } : s))
          : [...prev, { id, savedAt, ...entry }],
      );
      return id;
    },
    [saves],
  );

  const remove = useCallback((id: string) => {
    setSaves((prev) => prev.filter((s) => s.id !== id));
  }, []);

  /** セーブデータ（計算ページ）に紐づく所持スナップショットを消す */
  const removeBySaveId = useCallback((saveId: string) => {
    setSaves((prev) => prev.filter((s) => s.saveId !== saveId));
  }, []);

  const rename = useCallback((id: string, name: string) => {
    setSaves((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
  }, []);

  return { saves, upsert, remove, removeBySaveId, rename, loaded: true };
}
