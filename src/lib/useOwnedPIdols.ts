import { useCallback, useEffect, useState } from "react";
import { P_IDOL_MASTERS } from "./pIdol";
import { useSaveNotifier } from "./storeSync";
import { autoSaveToActiveSlot, ensureEditableSlot } from "./useOwnedSaves";

/**
 * Pアイドルの所持状況（特訓段階・才能開花）を localStorage に保存するストア。
 * マップに存在しないカードは未所持扱い。
 */
const STORAGE_KEY = "gakumas:pIdols:v1";

export type PIdolOwnership = { kunren: number; kaika: number };
type OwnershipMap = Record<string, PIdolOwnership>;

export function useOwnedPIdols() {
  // SPAなのでlocalStorageを初期値で同期読み込みする（読み込みちらつき防止）
  const [map, setMap] = useState<OwnershipMap>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as OwnershipMap;
    } catch {
      // 破損データは無視
    }
    // 初回アクセス（保存なし）: 全Pアイドルを特訓6・才能開花4で初期化する
    const seeded: OwnershipMap = {};
    for (const m of P_IDOL_MASTERS) seeded[m.key] = { kunren: 6, kaika: 4 };
    return seeded;
  });

  const notifySave = useSaveNotifier();
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
      // 使っている所持状況（既定以外）へも随時保存
      autoSaveToActiveSlot({ pIdols: map });
      notifySave();
    } catch {
      // 容量超過などは無視
    }
  }, [map, notifySave]);

  /** 未所持なら null */
  const getOwnership = useCallback(
    (key: string): PIdolOwnership | null => map[key] ?? null,
    [map],
  );

  // 変更系は、既定（全サポカ完凸）を使っているなら先に「自分の所持状況」を作って保存先にする
  const setOwnership = useCallback(
    (key: string, patch: Partial<PIdolOwnership>) => {
      ensureEditableSlot();
      setMap((prev) => {
        const current = prev[key] ?? { kunren: 0, kaika: 0 };
        return { ...prev, [key]: { ...current, ...patch } };
      });
    },
    [],
  );

  const setUnowned = useCallback((key: string) => {
    ensureEditableSlot();
    setMap((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  /** 複数カードへ一括設定（未所持のカードは所持化してから適用） */
  const setManyOwnership = useCallback(
    (keys: string[], patch: Partial<PIdolOwnership>) => {
      ensureEditableSlot();
      setMap((prev) => {
        const next = { ...prev };
        for (const key of keys) {
          const current = next[key] ?? { kunren: 0, kaika: 0 };
          next[key] = { ...current, ...patch };
        }
        return next;
      });
    },
    [],
  );

  /** 複数カードを一括で未所持に */
  const setManyUnowned = useCallback((keys: string[]) => {
    ensureEditableSlot();
    setMap((prev) => {
      const next = { ...prev };
      for (const key of keys) delete next[key];
      return next;
    });
  }, []);

  /** カードごとに異なる値を一括反映（CSVインポート用）。kunren<0 は未所持=エントリ削除 */
  const applyOwnership = useCallback(
    (entries: { key: string; kunren: number; kaika: number }[]) => {
      ensureEditableSlot();
      setMap((prev) => {
        const next = { ...prev };
        for (const e of entries) {
          if (e.kunren < 0) delete next[e.key];
          else
            next[e.key] = {
              kunren: Math.min(7, e.kunren),
              kaika: Math.max(0, Math.min(4, e.kaika)),
            };
        }
        return next;
      });
    },
    [],
  );

  /** 所持状況をまるごと置き換える（セーブデータの読み込み用） */
  const replaceAll = useCallback((snapshot: OwnershipMap) => {
    setMap({ ...snapshot });
  }, []);

  return {
    map,
    getOwnership,
    setOwnership,
    setUnowned,
    setManyOwnership,
    setManyUnowned,
    applyOwnership,
    replaceAll,
    loaded: true,
  };
}
