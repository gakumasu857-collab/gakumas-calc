import { useCallback, useEffect, useMemo, useState } from "react";
import { useSaveNotifier } from "./storeSync";
import {
  PLAN_LIST,
  SLOT_SIZE,
  TEMPLATE_MEMORIES,
  type Memory,
  type MemorySet,
} from "./memoryTypes";

/** 旧データ（plan:"スキル"など廃止された値）を現行の4プランへ正規化 */
function normalizeMemory(memory: Memory): Memory {
  return (PLAN_LIST as string[]).includes(memory.plan)
    ? memory
    : { ...memory, plan: "共通" };
}

/**
 * メモリー設定画面の状態を localStorage に永続化するストア。
 *
 * - library: ユーザーが作成したメモリー（テンプレは含めない）
 * - selected: スロットに入っているメモリーIDの配列（最大4、重複可）
 * - sets: 保存済みメモリーセット
 */
const LIB_KEY = "gakumas:memories:v1";
const SEL_KEY = "gakumas:memorySelection:v1";
const SETS_KEY = "gakumas:memorySets:v1";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // 破損データは無視
  }
  return fallback;
}

export function useMemoryStore() {
  // SPAなのでlocalStorageを初期値で同期読み込みする（読み込みちらつき防止）
  const [library, setLibrary] = useState<Memory[]>(() =>
    load<Memory[]>(LIB_KEY, []).map(normalizeMemory),
  );
  const [selected, setSelected] = useState<string[]>(() =>
    // 初回（保存なし）は未選択。計算ページの「育成の前提」で選んでもらう
    // （既定を入れておくと、実態と違うメモリーのまま評価値が出てしまうため）
    load<string[]>(SEL_KEY, []),
  );
  const [sets, setSets] = useState<MemorySet[]>(() =>
    load<MemorySet[]>(SETS_KEY, []),
  );

  const notifySave = useSaveNotifier();
  useEffect(() => {
    try {
      localStorage.setItem(LIB_KEY, JSON.stringify(library));
      localStorage.setItem(SEL_KEY, JSON.stringify(selected));
      localStorage.setItem(SETS_KEY, JSON.stringify(sets));
      notifySave();
    } catch {
      // 容量超過などは無視
    }
  }, [library, selected, sets, notifySave]);

  /** テンプレ＋ユーザー作成をまとめた全メモリー */
  const allMemories = useMemo(
    () => [...TEMPLATE_MEMORIES, ...library],
    [library],
  );

  const findMemory = useCallback(
    (id: string): Memory | undefined => allMemories.find((m) => m.id === id),
    [allMemories],
  );

  /** メモリーを作成してライブラリへ追加 */
  const addMemory = useCallback(
    (memory: Omit<Memory, "id" | "isTemplate">) => {
      const id = `mem-${crypto.randomUUID()}`;
      setLibrary((prev) => [...prev, { ...memory, id }]);
    },
    [],
  );

  /** ライブラリから削除（テンプレは不可）。スロットからも取り除く */
  const deleteMemory = useCallback((id: string) => {
    if (id.startsWith("tpl-")) return;
    setLibrary((prev) => prev.filter((m) => m.id !== id));
    setSelected((prev) => prev.filter((s) => s !== id));
  }, []);

  /** スロットへ追加（最大4、重複可） */
  const selectMemory = useCallback((id: string) => {
    setSelected((prev) => (prev.length >= SLOT_SIZE ? prev : [...prev, id]));
  }, []);

  /** スロットの i 番目を解除 */
  const deselectAt = useCallback((index: number) => {
    setSelected((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /** 指定IDの選択を後ろから1枚だけ解除（ライブラリ側からのトグル用） */
  const deselectOne = useCallback((id: string) => {
    setSelected((prev) => {
      const last = prev.lastIndexOf(id);
      if (last === -1) return prev;
      return prev.filter((_, i) => i !== last);
    });
  }, []);

  /** セットの4枚をスロットへ展開（存在しないIDは除外） */
  const applySet = useCallback(
    (set: MemorySet) => {
      const valid = set.memoryIds
        .filter((id) => allMemories.some((m) => m.id === id))
        .slice(0, SLOT_SIZE);
      setSelected(valid);
    },
    [allMemories],
  );

  const addSet = useCallback((name: string, memoryIds: string[]) => {
    const id = `set-${crypto.randomUUID()}`;
    setSets((prev) => [
      ...prev,
      // 名前未入力なら「セットn」と自動命名
      { id, name: name || `セット${prev.length + 1}`, memoryIds },
    ]);
  }, []);

  const deleteSet = useCallback((id: string) => {
    setSets((prev) => prev.filter((s) => s.id !== id));
  }, []);

  /**
   * 計算ページのセーブデータ用セットを作る/上書きする（1セーブにつき1件）。
   * セーブを読み込むときはここではなくスナップショットから展開するので、
   * このセットは「あとで手動で呼び出せる控え」として置いておく用。
   */
  const upsertSaveSet = useCallback(
    (saveId: string, name: string, memoryIds: string[]) => {
      // IDは更新関数の外で確定させる（更新関数は遅延実行されるため）
      const existing = sets.find((s) => s.saveId === saveId);
      const id = existing?.id ?? `set-${crypto.randomUUID()}`;
      setSets((prev) =>
        prev.some((s) => s.id === id)
          ? prev.map((s) =>
              s.id === id ? { ...s, name, memoryIds, saveId } : s,
            )
          : [...prev, { id, name, memoryIds, saveId }],
      );
      return id;
    },
    [sets],
  );

  const deleteSetsBySaveId = useCallback((saveId: string) => {
    setSets((prev) => prev.filter((s) => s.saveId !== saveId));
  }, []);

  /** スロットの中身を直接置き換える（セーブデータの読み込み用） */
  const setSelection = useCallback((memoryIds: string[]) => {
    setSelected(memoryIds.slice(0, SLOT_SIZE));
  }, []);

  /**
   * ライブラリに無いメモリーを補充する（セーブデータの読み込み用）。
   * セーブ時点のメモリーが後で削除されていても復元できるようにする。
   */
  const ensureMemories = useCallback((memories: Memory[]) => {
    setLibrary((prev) => {
      const known = new Set([
        ...prev.map((m) => m.id),
        ...TEMPLATE_MEMORIES.map((m) => m.id),
      ]);
      const missing = memories
        .filter((m) => !known.has(m.id))
        .map(normalizeMemory);
      return missing.length > 0 ? [...prev, ...missing] : prev;
    });
  }, []);

  return {
    loaded: true,
    allMemories,
    selected,
    sets,
    findMemory,
    addMemory,
    deleteMemory,
    selectMemory,
    deselectAt,
    deselectOne,
    applySet,
    addSet,
    deleteSet,
    upsertSaveSet,
    deleteSetsBySaveId,
    setSelection,
    ensureMemories,
  };
}
