import { useCallback, useEffect, useState } from "react";
import type { SelectedSlot } from "./formation";
import { migrateSlotIds } from "./idMigration";
import { useSaveNotifier } from "./storeSync";

/**
 * 計算ページの「選択サポカ」6枠。現在のステ・評価値はこの6枚を参照する。
 * 理想編成ページの「この編成を設定」で一括上書きできる。
 */
const STORAGE_KEY = "gakumas:selectedSupports:v1";
const SLOT_COUNT = 6;

const EMPTY: (SelectedSlot | null)[] = Array(SLOT_COUNT).fill(null);

export function useSelectedSupports() {
  // SPAなのでlocalStorageを初期値で同期読み込みする（読み込みちらつき防止）
  const [slots, setSlots] = useState<(SelectedSlot | null)[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as (SelectedSlot | null)[];
        // 旧キー card:<名前> を今のキーへ
        return migrateSlotIds(Array.from({ length: SLOT_COUNT }, (_, i) => stored[i] ?? null));
      }
    } catch {
      // 破損データは無視
    }
    return EMPTY;
  });

  const notifySave = useSaveNotifier();
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slots));
      notifySave();
    } catch {
      // 容量超過などは無視
    }
  }, [slots, notifySave]);

  const setSlot = useCallback((index: number, entry: SelectedSlot | null) => {
    setSlots((prev) => prev.map((s, i) => (i === index ? entry : s)));
  }, []);

  /** 理想編成などから6枠を一括設定 */
  const setAll = useCallback((entries: (SelectedSlot | null)[]) => {
    setSlots(migrateSlotIds(Array.from({ length: SLOT_COUNT }, (_, i) => entries[i] ?? null)));
  }, []);

  const clearAll = useCallback(() => setSlots(EMPTY), []);

  return { slots, setSlot, setAll, clearAll, loaded: true };
}
