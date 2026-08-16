import { useCallback, useEffect, useState } from "react";
import { useSaveNotifier } from "./storeSync";
import type { AbilityName } from "@/data/constants";
import {
  ABILITY_CATEGORIES,
  abilityMax,
  DEFAULT_SETS,
  NIA_DEFAULT_SETS,
  planFromSetName,
  type AbilityCountSet,
} from "@/data/abilityCounts";

/**
 * 発動回数のストア。
 *
 * localStorage には「デフォルト(abilityCounts.tsのdefaults)と違う値」だけを
 * 差分として保存する。これにより:
 * - コード側で新アビリティを追加 → 保存データに無いので自動でデフォルトが出る
 * - コード側でデフォルト値を修正 → ユーザーが触っていない項目は自動で新しい値になる
 * - ユーザーがデフォルトと同じ値に戻した → 差分が消えるので以後デフォルト追従に戻る
 */
const STORAGE_KEY = "gakumas:abilityCountOverrides:v1";
const USER_SETS_KEY = "gakumas:abilityUserSets:v1";
const SELECTED_SET_KEY = "gakumas:abilitySelectedSet:v1";

/** setId -> (アビリティキー -> 上書き回数) */
type Overrides = Record<string, Partial<Record<AbilityName, number>>>;

/** ユーザーがUIで追加したセット（回数はすべてoverridesに入る）。planなしは名前から推定 */
type UserSet = { id: string; name: string; plan?: string };

function clamp(value: number, max: number): number {
  return Math.min(max, Math.max(0, value));
}

/** localStorageから同期読み込み（SPAなので初期値で直接読む） */
function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // 破損データは無視
  }
  return fallback;
}

export function useAbilityCounts() {
  const [overrides, setOverrides] = useState<Overrides>(() =>
    loadJson<Overrides>(STORAGE_KEY, {}),
  );
  const [userSets, setUserSets] = useState<UserSet[]>(() =>
    loadJson<UserSet[]>(USER_SETS_KEY, []),
  );
  const [selectedSetId, setSelectedSetId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SELECTED_SET_KEY);
    } catch {
      return null;
    }
  });

  const notifySave = useSaveNotifier();
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
      localStorage.setItem(USER_SETS_KEY, JSON.stringify(userSets));
      if (selectedSetId) localStorage.setItem(SELECTED_SET_KEY, selectedSetId);
      else localStorage.removeItem(SELECTED_SET_KEY);
      notifySave();
    } catch {
      // 容量超過などは無視
    }
  }, [overrides, userSets, selectedSetId, notifySave]);

  const defaultFor = (set: AbilityCountSet, key: AbilityName): number =>
    set.defaults[key] ?? 0;

  /** 現在の回数（上書きがあればそれ、なければデフォルト） */
  const getCount = useCallback(
    (set: AbilityCountSet, key: AbilityName): number => {
      const value = overrides[set.id]?.[key] ?? defaultFor(set, key);
      return clamp(value, abilityMax(key));
    },
    [overrides],
  );

  /** ユーザーが値を変更しているか（デフォルトと異なるか） */
  const isOverridden = useCallback(
    (set: AbilityCountSet, key: AbilityName): boolean =>
      overrides[set.id]?.[key] !== undefined,
    [overrides],
  );

  /** 回数を設定（0〜maxにクランプ。デフォルトと同値なら差分を削除） */
  const setCount = useCallback(
    (set: AbilityCountSet, key: AbilityName, value: number) => {
      const next = clamp(value, abilityMax(key));
      setOverrides((prev) => {
        const forSet = { ...(prev[set.id] ?? {}) };
        if (next === defaultFor(set, key)) {
          delete forSet[key]; // デフォルトに一致→差分を持たない
        } else {
          forSet[key] = next;
        }
        const result = { ...prev, [set.id]: forSet };
        if (Object.keys(forSet).length === 0) delete result[set.id];
        return result;
      });
    },
    [],
  );

  /**
   * 全テンプレセットを初期値に戻す（間違えて全部消した人向けの救済ボタン）。
   * ユーザー追加セットの回数は overrides が実体なので消さない。
   */
  const resetAllDefaults = useCallback(() => {
    setOverrides((prev) => {
      const next: Overrides = {};
      for (const [setId, counts] of Object.entries(prev)) {
        if (setId.startsWith("uset-")) next[setId] = counts;
      }
      return next;
    });
  }, []);

  /** ユーザーセットを追加（回数は全て0から）。プラン未指定は名前から推定 */
  const addSet = useCallback((name: string, plan?: string) => {
    const id = `uset-${crypto.randomUUID()}`;
    setUserSets((prev) => [
      ...prev,
      {
        id,
        name: name || `セット${prev.length + 1}`,
        plan: plan ?? planFromSetName(name),
      },
    ]);
  }, []);

  /** ユーザーセットを削除（デフォルトセットは不可）。回数データも消す */
  const deleteSet = useCallback((setId: string) => {
    if (!setId.startsWith("uset-")) return;
    setUserSets((prev) => prev.filter((s) => s.id !== setId));
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[setId];
      return next;
    });
    setSelectedSetId((prev) => (prev === setId ? null : prev));
  }, []);

  /** セットを複製してユーザーセットとして追加（現在の実効値とプランをコピー） */
  const duplicateSet = useCallback((source: AbilityCountSet) => {
    const id = `uset-${crypto.randomUUID()}`;
    setUserSets((prev) => [
      ...prev,
      { id, name: `${source.name}のコピー`, plan: source.plan },
    ]);
    setOverrides((prev) => {
      // 複製先は defaults を持たないので、実効値(override ?? default)を全て差分として書き込む
      const counts: Partial<Record<AbilityName, number>> = {};
      for (const category of ABILITY_CATEGORIES) {
        for (const ability of category.abilities) {
          const value =
            prev[source.id]?.[ability] ?? source.defaults[ability] ?? 0;
          if (value !== 0) counts[ability] = clamp(value, abilityMax(ability));
        }
      }
      return { ...prev, [id]: counts };
    });
  }, []);

  /** 参照用に選択するセット（チェックボックス）。同じIDを渡すと解除 */
  const selectSet = useCallback((setId: string) => {
    setSelectedSetId((prev) => (prev === setId ? null : setId));
  }, []);

  /** ユーザーセットの名前を変更（デフォルトセットは不可） */
  const renameSet = useCallback((setId: string, name: string) => {
    if (!setId.startsWith("uset-")) return;
    setUserSets((prev) =>
      prev.map((s) => (s.id === setId ? { ...s, name } : s)),
    );
  }, []);

  /** ユーザーセットのプランを変更（デフォルトセットは名前から自動決定なので不可） */
  const setPlan = useCallback((setId: string, plan: string) => {
    if (!setId.startsWith("uset-")) return;
    setUserSets((prev) =>
      prev.map((s) => (s.id === setId ? { ...s, plan } : s)),
    );
  }, []);

  /** コード定義のデフォルトセット（HIF用＋NIA用）＋ユーザー追加セット */
  const sets: AbilityCountSet[] = [
    ...DEFAULT_SETS,
    ...NIA_DEFAULT_SETS,
    // 旧データ（plan未保存）は名前から推定
    ...userSets.map((s) => ({
      ...s,
      plan: s.plan ?? planFromSetName(s.name),
      defaults: {},
    })),
  ];

  /** ユーザーがUIで追加したセットか（削除可能か） */
  const isUserSet = (setId: string) => setId.startsWith("uset-");

  return {
    sets,
    getCount,
    setCount,
    isOverridden,
    resetAllDefaults,
    addSet,
    deleteSet,
    duplicateSet,
    renameSet,
    setPlan,
    isUserSet,
    selectedSetId,
    selectSet,
    loaded: true,
  };
}
