import { useCallback, useEffect, useState } from "react";
import { useSaveNotifier } from "./storeSync";
import type { AbilityName } from "@/data/constants";
import {
  ABILITY_CATEGORIES,
  abilityMax,
  DEFAULT_SETS,
  HATSU_DEFAULT_SETS,
  NIA_DEFAULT_SETS,
  planFromSetName,
  type AbilityCountSet,
} from "@/data/abilityCounts";
import type { ScenarioKey } from "@/data/scenarios";
import {
  abilityCountsFromChoices,
  CHOICE_ABILITY_KEYS,
  choiceTargets,
  isChoiceAbilityKey,
  resolveChoices,
  type ChoiceEvent,
  type ScheduleChoices,
} from "@/data/scheduleCalendar";

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
/**
 * 計算ページでの「この育成だけ」の回数調整（セットID→アビリティ→回数）。
 * プロデュース設定ページのデフォルト（overrides）は変えず、計算ページではこちらを優先する。
 */
const ADJUST_KEY = "gakumas:calc:countAdjust:v1";
/**
 * スケジュールの選択（セットID → シナリオ → 週の行id → 選んだ行動）。
 * おでかけ・相談・活動支給・特別指導の回数はこの選択から決まり、選ぶたびに回数へ書き戻す
 * （回数を読む側はこれまでどおり回数だけを見ればよい）。ユーザーセットは全シナリオで出るのでシナリオ別に持つ。
 * 保存した選択が回数と合わない（テンプレ・旧データ・セーブの読み込み）ときは回数から推測して表示する。
 */
const CHOICES_KEY = "gakumas:scheduleChoices:v1";
/** 計算ページでの「この育成だけ」の選択（同じ形） */
const RUN_CHOICES_KEY = "gakumas:calc:scheduleChoiceAdjust:v1";

type ChoiceStore = Record<string, Partial<Record<ScenarioKey, ScheduleChoices>>>;

/** setId -> (アビリティキー -> 上書き回数) */
type Overrides = Record<string, Partial<Record<AbilityName, number>>>;

/**
 * ユーザーがUIで追加したセット（回数はすべてoverridesに入る）。planなしは名前から推定。
 * saveId 付きは計算ページのセーブデータから作られたもの（プロデュース設定ページでは既定で隠す）。
 */
type UserSet = { id: string; name: string; plan?: string; saveId?: string };

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
  const [adjust, setAdjust] = useState<Overrides>(() =>
    loadJson<Overrides>(ADJUST_KEY, {}),
  );
  const [choices, setChoices] = useState<ChoiceStore>(() =>
    loadJson<ChoiceStore>(CHOICES_KEY, {}),
  );
  const [runChoices, setRunChoices] = useState<ChoiceStore>(() =>
    loadJson<ChoiceStore>(RUN_CHOICES_KEY, {}),
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
      localStorage.setItem(ADJUST_KEY, JSON.stringify(adjust));
      localStorage.setItem(CHOICES_KEY, JSON.stringify(choices));
      localStorage.setItem(RUN_CHOICES_KEY, JSON.stringify(runChoices));
      if (selectedSetId) localStorage.setItem(SELECTED_SET_KEY, selectedSetId);
      else localStorage.removeItem(SELECTED_SET_KEY);
      notifySave();
    } catch {
      // 容量超過などは無視
    }
  }, [overrides, userSets, adjust, choices, runChoices, selectedSetId, notifySave]);

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
   * 計算ページで使う「この育成での回数」。この育成だけの調整（adjust）があればそれ、
   * なければセットのデフォルト（プロデュース設定ページの値）。
   */
  const getRunCount = useCallback(
    (set: AbilityCountSet, key: AbilityName): number => {
      const value = adjust[set.id]?.[key] ?? getCount(set, key);
      return clamp(value, abilityMax(key));
    },
    [adjust, getCount],
  );

  /** この育成での回数を変える（デフォルトと同じ値なら調整を消す）。プロデュース設定ページの値は変えない */
  const setRunCount = useCallback(
    (set: AbilityCountSet, key: AbilityName, value: number) => {
      const next = clamp(value, abilityMax(key));
      const base = getCount(set, key);
      setAdjust((prev) => {
        const forSet = { ...(prev[set.id] ?? {}) };
        if (next === base) delete forSet[key];
        else forSet[key] = next;
        const result = { ...prev, [set.id]: forSet };
        if (Object.keys(forSet).length === 0) delete result[set.id];
        return result;
      });
    },
    [getCount],
  );

  /** スケジュールの選択（セットのデフォルト）。保存した選択が回数と合わなければ回数から推測する */
  const getChoices = useCallback(
    (set: AbilityCountSet, scenario: ScenarioKey): ScheduleChoices =>
      resolveChoices(
        scenario,
        choices[set.id]?.[scenario],
        choiceTargets((k) => getCount(set, k)),
      ),
    [choices, getCount],
  );

  /** スケジュールの選択を変える（デフォルト）。選択から決まる回数もセットへ書き戻す */
  const setChoice = useCallback(
    (set: AbilityCountSet, scenario: ScenarioKey, rowId: string, event: ChoiceEvent | null) => {
      const next: ScheduleChoices = { ...getChoices(set, scenario), [rowId]: event };
      setChoices((prev) => ({
        ...prev,
        [set.id]: { ...(prev[set.id] ?? {}), [scenario]: next },
      }));
      const counts = abilityCountsFromChoices(scenario, next);
      for (const key of CHOICE_ABILITY_KEYS) setCount(set, key, counts[key]);
    },
    [getChoices, setCount],
  );

  /** この育成でのスケジュールの選択（この育成だけの選択があればそれ、無ければデフォルト） */
  const getRunChoices = useCallback(
    (set: AbilityCountSet, scenario: ScenarioKey): ScheduleChoices =>
      resolveChoices(
        scenario,
        runChoices[set.id]?.[scenario] ?? choices[set.id]?.[scenario],
        choiceTargets((k) => getRunCount(set, k)),
      ),
    [runChoices, choices, getRunCount],
  );

  /** この育成だけのスケジュールの選択を変える（回数はこの育成だけの調整に書く） */
  const setRunChoice = useCallback(
    (set: AbilityCountSet, scenario: ScenarioKey, rowId: string, event: ChoiceEvent | null) => {
      const next: ScheduleChoices = { ...getRunChoices(set, scenario), [rowId]: event };
      setRunChoices((prev) => ({
        ...prev,
        [set.id]: { ...(prev[set.id] ?? {}), [scenario]: next },
      }));
      const counts = abilityCountsFromChoices(scenario, next);
      for (const key of CHOICE_ABILITY_KEYS) setRunCount(set, key, counts[key]);
    },
    [getRunChoices, setRunCount],
  );

  /** この育成だけの選択がデフォルトと違う週か（黄色い枠） */
  const isRunChoiceAdjusted = useCallback(
    (set: AbilityCountSet, scenario: ScenarioKey, rowId: string): boolean =>
      (getRunChoices(set, scenario)[rowId] ?? null) !== (getChoices(set, scenario)[rowId] ?? null),
    [getRunChoices, getChoices],
  );

  /** この育成だけの調整が入っているか */
  const isRunAdjusted = useCallback(
    (set: AbilityCountSet, key: AbilityName): boolean =>
      adjust[set.id]?.[key] !== undefined,
    [adjust],
  );

  /**
   * この育成だけの調整の件数。スケジュールの選択で決まる回数は「変えた週の数」で数える
   * （同じ回数のまま週だけ入れ替えた場合も、上書き保存できるように）。
   */
  const runAdjustCount = useCallback(
    (set: AbilityCountSet): number => {
      const keys = Object.keys(adjust[set.id] ?? {});
      const plain = keys.filter((k) => !isChoiceAbilityKey(k)).length;
      let rows = 0;
      for (const sc of Object.keys(runChoices[set.id] ?? {}) as ScenarioKey[]) {
        const run = getRunChoices(set, sc);
        const def = getChoices(set, sc);
        for (const id of Object.keys(run)) if ((run[id] ?? null) !== (def[id] ?? null)) rows++;
      }
      const choiceKeys = keys.filter((k) => isChoiceAbilityKey(k)).length;
      return plain + (rows > 0 ? rows : choiceKeys);
    },
    [adjust, runChoices, getRunChoices, getChoices],
  );

  /** この育成だけの調整をすべて消してデフォルトに戻す */
  const resetRunAdjust = useCallback((setId: string) => {
    setAdjust((prev) => {
      if (!prev[setId]) return prev;
      const next = { ...prev };
      delete next[setId];
      return next;
    });
    setRunChoices((prev) => {
      if (!prev[setId]) return prev;
      const next = { ...prev };
      delete next[setId];
      return next;
    });
  }, []);

  /**
   * この育成での調整をそのセットのデフォルトにする（計算ページの「上書き保存」）。
   * 前イベ・後イベの上乗せ分は元から含まない（調整は素の回数だけを持つ）。保存後は調整を消す（黄色い枠が消える）。
   */
  const commitRunAdjust = useCallback(
    (set: AbilityCountSet) => {
      const forSet = adjust[set.id] ?? {};
      const runSel = runChoices[set.id];
      if (Object.keys(forSet).length === 0 && !runSel) return;
      // スケジュールの選択もデフォルトへ移す
      if (runSel) {
        setChoices((prev) => ({ ...prev, [set.id]: { ...(prev[set.id] ?? {}), ...runSel } }));
        setRunChoices((prev) => {
          const next = { ...prev };
          delete next[set.id];
          return next;
        });
      }
      setOverrides((prev) => {
        const next = { ...(prev[set.id] ?? {}) };
        for (const [key, value] of Object.entries(forSet)) {
          const k = key as AbilityName;
          if (typeof value !== "number") continue;
          if (value === defaultFor(set, k)) delete next[k];
          else next[k] = value;
        }
        const result = { ...prev, [set.id]: next };
        if (Object.keys(next).length === 0) delete result[set.id];
        return result;
      });
      setAdjust((prev) => {
        const next = { ...prev };
        delete next[set.id];
        return next;
      });
    },
    [adjust, runChoices],
  );

  /** セット選択を解除する（シナリオ変更時など） */
  const clearSelected = useCallback(() => {
    setSelectedSetId(null);
  }, []);

  /** 全て初期状態に戻す（回数の変更・追加セット・選択をすべて破棄） */
  const resetEverything = useCallback(() => {
    setOverrides({});
    setAdjust({});
    setChoices({});
    setRunChoices({});
    setUserSets([]);
    setSelectedSetId(null);
  }, []);

  /**
   * 指定セットを初期値に戻す（差分を全部消す）。
   * テンプレはスプシ由来のデフォルトへ、ユーザー追加セットは全0へ戻る。
   */
  const resetSets = useCallback((setIds: Iterable<string>) => {
    const targets = new Set(setIds);
    setOverrides((prev) => {
      const next: Overrides = {};
      for (const [setId, counts] of Object.entries(prev)) {
        if (!targets.has(setId)) next[setId] = counts;
      }
      return next;
    });
    setChoices((prev) => {
      const next: ChoiceStore = {};
      for (const [setId, sel] of Object.entries(prev)) {
        if (!targets.has(setId)) next[setId] = sel;
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
    setAdjust((prev) => {
      const next = { ...prev };
      delete next[setId];
      return next;
    });
    for (const setter of [setChoices, setRunChoices]) {
      setter((prev) => {
        if (!prev[setId]) return prev;
        const next = { ...prev };
        delete next[setId];
        return next;
      });
    }
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
    // スケジュールの選択もコピー
    setChoices((prev) => (prev[source.id] ? { ...prev, [id]: { ...prev[source.id] } } : prev));
  }, []);

  /** 参照用に選択するセット（チェックボックス）。同じIDを渡すと解除 */
  const selectSet = useCallback((setId: string) => {
    setSelectedSetId((prev) => (prev === setId ? null : setId));
  }, []);

  /** 参照セットを指定IDに設定する（トグルしない。セーブデータの読み込み用） */
  const setSelectedSet = useCallback((setId: string | null) => {
    setSelectedSetId(setId);
  }, []);

  /**
   * 計算ページのセーブデータ用セットを作る/上書きして、そのIDを返す（1セーブにつき1件）。
   * counts は実効回数そのもの（ユーザーセットは defaults が空なので全部を差分として持つ）。
   */
  const upsertSaveSet = useCallback(
    (
      saveId: string,
      name: string,
      plan: string,
      counts: Partial<Record<AbilityName, number>>,
      /** 保存時のスケジュールの選択（あれば） */
      schedule?: { scenario: ScenarioKey; choices: ScheduleChoices },
    ): string => {
      // IDは更新関数の外で確定させる（setStateの更新関数は遅延実行されるので、
      // その中でIDを決めると呼び出し側へ返すIDがズレる）
      const existing = userSets.find((s) => s.saveId === saveId);
      const id = existing?.id ?? `uset-${crypto.randomUUID()}`;
      setUserSets((prev) =>
        prev.some((s) => s.id === id)
          ? prev.map((s) => (s.id === id ? { ...s, name, plan, saveId } : s))
          : [...prev, { id, name, plan, saveId }],
      );
      const clamped: Partial<Record<AbilityName, number>> = {};
      for (const [key, value] of Object.entries(counts)) {
        const k = key as AbilityName;
        if (value) clamped[k] = clamp(value, abilityMax(k));
      }
      setOverrides((prev) => ({ ...prev, [id]: clamped }));
      // 回数はこの育成の調整込みで固めたので、このセットの調整は消す
      setAdjust((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setRunChoices((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (schedule) {
        setChoices((prev) => ({ ...prev, [id]: { [schedule.scenario]: { ...schedule.choices } } }));
      }
      return id;
    },
    [userSets],
  );

  /** セーブデータに紐づくセットの名前を変える（セーブ名の変更に追従） */
  const renameSaveSet = useCallback((saveId: string, name: string) => {
    setUserSets((prev) =>
      prev.map((s) => (s.saveId === saveId ? { ...s, name } : s)),
    );
  }, []);

  /** セーブデータに紐づくセットを消す（回数データも一緒に消す） */
  const deleteSetsBySaveId = useCallback(
    (saveId: string) => {
      const targets = userSets
        .filter((s) => s.saveId === saveId)
        .map((s) => s.id);
      if (targets.length === 0) return;
      setUserSets((prev) => prev.filter((s) => !targets.includes(s.id)));
      setOverrides((prev) => {
        const next = { ...prev };
        for (const id of targets) delete next[id];
        return next;
      });
      setAdjust((prev) => {
        const next = { ...prev };
        for (const id of targets) delete next[id];
        return next;
      });
      for (const setter of [setChoices, setRunChoices]) {
        setter((prev) => {
          const next = { ...prev };
          for (const id of targets) delete next[id];
          return next;
        });
      }
      setSelectedSetId((cur) => (cur && targets.includes(cur) ? null : cur));
    },
    [userSets],
  );

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

  /** コード定義のデフォルトセット（HIF用＋NIA用＋初用）＋ユーザー追加セット */
  const sets: AbilityCountSet[] = [
    ...DEFAULT_SETS,
    ...NIA_DEFAULT_SETS,
    ...HATSU_DEFAULT_SETS,
    // 旧データ（plan未保存）は名前から推定
    ...userSets.map(({ saveId: _saveId, ...s }) => ({
      ...s,
      plan: s.plan ?? planFromSetName(s.name),
      defaults: {},
    })),
  ];

  /** ユーザーがUIで追加したセットか（削除可能か） */
  const isUserSet = (setId: string) => setId.startsWith("uset-");
  /** 計算ページのセーブデータから作られたセットか（プロデュース設定ページでは既定で隠す） */
  const saveIdOf = (setId: string): string | undefined =>
    userSets.find((s) => s.id === setId)?.saveId;

  /** この育成での回数を丸ごと取り出す（セーブデータのスナップショット用。この育成だけの調整込み） */
  const snapshotCounts = useCallback(
    (set: AbilityCountSet): Partial<Record<AbilityName, number>> => {
      const out: Partial<Record<AbilityName, number>> = {};
      for (const category of ABILITY_CATEGORIES) {
        for (const ability of category.abilities) {
          const value = getRunCount(set, ability);
          if (value !== 0) out[ability] = value;
        }
      }
      return out;
    },
    [getRunCount],
  );

  return {
    sets,
    getCount,
    setCount,
    isOverridden,
    getRunCount,
    setRunCount,
    isRunAdjusted,
    runAdjustCount,
    resetRunAdjust,
    commitRunAdjust,
    getChoices,
    setChoice,
    getRunChoices,
    setRunChoice,
    isRunChoiceAdjusted,
    resetSets,
    resetEverything,
    clearSelected,
    addSet,
    deleteSet,
    duplicateSet,
    renameSet,
    setPlan,
    isUserSet,
    saveIdOf,
    snapshotCounts,
    upsertSaveSet,
    renameSaveSet,
    deleteSetsBySaveId,
    selectedSetId,
    selectSet,
    setSelectedSet,
    loaded: true,
  };
}
