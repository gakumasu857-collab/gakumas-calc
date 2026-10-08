import { useCallback, useEffect, useState } from "react";
import { migratePIdolKeys } from "./idMigration";
import { P_IDOL_MASTERS } from "./pIdol";
import { useSaveNotifier } from "./storeSync";
import { autoSaveToActiveSlot, ensureEditableSlot } from "./useOwnedSaves";

/**
 * Pアイドルの所持状況（特訓段階・才能開花）を localStorage に保存するストア。
 * マップに存在しないカードは未所持扱い。ただし、保存したあとにマスタへ追加された新しいPアイドル
 * （保存時のPアイドル数 knownCount 以降）は特訓6・才能開花4で持っている扱いにする
 * （サポカの「新カードは完凸」と同じ考え方。保存時の数が分からない古いデータは、無いものを全部6・4にする）。
 */
const STORAGE_KEY = "gakumas:pIdols:v1";
/** 前回保存したときのPアイドル数（これ以降に追加されたPアイドルを「新カード」とみなす） */
const COUNT_KEY = "gakumas:pIdols:count:v1";

export type PIdolOwnership = { kunren: number; kaika: number };
type OwnershipMap = Record<string, PIdolOwnership>;

/** 新しいPアイドルの既定（特訓6・才能開花4） */
export const NEW_PIDOL_DEFAULT: PIdolOwnership = { kunren: 6, kaika: 4 };

/**
 * マップに無いPアイドルを埋める。knownCount 以降（＝保存後に追加された新カード）は 6・4、
 * それより前は未所持のまま。knownCount が無ければ無いものを全部 6・4 にする。
 */
export function fillNewPIdols(map: OwnershipMap, knownCount?: number): OwnershipMap {
  const next: OwnershipMap = { ...map };
  P_IDOL_MASTERS.forEach((m, i) => {
    if (m.key in next) return;
    if (knownCount === undefined || i >= knownCount) next[m.key] = { ...NEW_PIDOL_DEFAULT };
  });
  return next;
}

function readCount(): number | undefined {
  try {
    const raw = localStorage.getItem(COUNT_KEY);
    if (raw === null) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  } catch {
    return undefined;
  }
}

export function useOwnedPIdols() {
  // SPAなのでlocalStorageを初期値で同期読み込みする（読み込みちらつき防止）
  const [map, setMap] = useState<OwnershipMap>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // 旧キー（名前カード名）は今のキー pidol:<スプシのid> へ
      if (raw) return fillNewPIdols(migratePIdolKeys(JSON.parse(raw) as OwnershipMap), readCount());
    } catch {
      // 破損データは無視
    }
    // 初回アクセス（保存なし）: 全Pアイドルを特訓6・才能開花4で初期化する
    return fillNewPIdols({});
  });

  const notifySave = useSaveNotifier();
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
      localStorage.setItem(COUNT_KEY, String(P_IDOL_MASTERS.length));
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

  /**
   * 所持状況をまるごと置き換える（セーブデータ・保存した所持状況の読み込み用）。
   * knownCount（保存時のPアイドル数）以降に追加されたPアイドルは 6・4 で足す。
   * 保存時の数が無い古いデータは、無いものを全部 6・4 にする。
   */
  const replaceAll = useCallback((snapshot: OwnershipMap, knownCount?: number) => {
    setMap(fillNewPIdols(migratePIdolKeys(snapshot), knownCount));
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
