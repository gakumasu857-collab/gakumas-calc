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
    // 初回（保存なし）はメインパラボ60点×4をデフォルトにする
    // （未設定のまま計算すると評価値が実態より高く出てしまうため）
    load<string[]>(SEL_KEY, [
      "tpl-role60",
      "tpl-role60",
      "tpl-role60",
      "tpl-role60",
    ]),
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
  };
}
