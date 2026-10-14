import { useCallback, useEffect, useState } from "react";
import { useSaveNotifier } from "./storeSync";
import { useScenario } from "./useScenario";
import type { AbilityName } from "@/data/constants";
import {
  ABILITY_CATEGORIES,
  migrateAbilityCounts,
  abilityAppliesTo,
  abilityMax,
  DEFAULT_SETS,
  DERIVED_CAP_OF,
  DERIVED_SUMS,
  HATSU_DEFAULT_SETS,
  isAutoCountKey,
  LINKED_COUNTS,
  NIA_DEFAULT_SETS,
  planFromSetName,
  TEMPLATE_CHOICES,
  type AbilityCountSet,
} from "@/data/abilityCounts";
import type { ScenarioKey } from "@/data/scenarios";
import {
  abilityCountsFromChoices,
  choiceShortfall,
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
 * お出かけ・相談・活動支給・特別指導・休む（と「(N回まで)」版）の回数は、**この選択から導き出す**
 * （回数として保存し直さない）。ユーザーセットは3シナリオすべてに出るので、選択も回数も
 * シナリオごとに別々になる必要があり、回数側へ書き戻すと別のシナリオの分を壊してしまうため。
 * まだ一度も選んでいないセットだけ、保存されている回数から選択を推測して表示する。
 */
const CHOICES_KEY = "gakumas:scheduleChoices:v1";
/** 計算ページでの「この育成だけ」の選択（同じ形） */
const RUN_CHOICES_KEY = "gakumas:calc:scheduleChoiceAdjust:v1";

type ChoiceStore = Record<string, Partial<Record<ScenarioKey, ScheduleChoices>>>;

/** setId -> (アビリティキー -> 上書き回数) */
type Overrides = Record<string, Partial<Record<AbilityName, number>>>;

/**
 * 保存データに残っている「今は無いアビリティ」の回数を落とす
 * （例: 2026-10-07 にやめた「温存スキル強化」。残したままだと、行が無いのに「変更◯件」と数えられる）。
 */
function dropUnknownKeys(stored: Overrides): Overrides {
  const out: Overrides = {};
  for (const [setId, counts] of Object.entries(stored ?? {})) {
    if (!counts || typeof counts !== "object") continue;
    // 自動の値になった回数（チェンジ(3回まで)など）は元の回数へ移す
    const kept = migrateAbilityCounts(counts);
    // 中身が無くなったセットの入れ物は持たない（読むときは無い＝デフォルトとして扱う）
    if (Object.keys(kept).length > 0) out[setId] = kept;
  }
  return out;
}

/**
 * ユーザーがUIで追加したセット（回数はすべてoverridesに入る）。planなしは名前から推定。
 * saveId 付きは計算ページのセーブデータから作られたもの（プロデュース設定ページでは既定で隠す）。
 */
type UserSet = { id: string; name: string; plan?: string; saveId?: string };

function clamp(value: number, max: number): number {
  return Math.min(max, Math.max(0, value));
}

/**
 * ほかの回数から自動で決まる回数を解く（合計＝スキル強化、上限つきの写し＝「(N回まで)」）。
 * 自動でないキーは undefined を返す。
 */
function autoCountOf(
  key: AbilityName,
  of: (key: AbilityName) => number,
): number | undefined {
  const parts = DERIVED_SUMS[key];
  if (parts) return clamp(parts.reduce((sum, k) => sum + of(k), 0), abilityMax(key));
  const capped = DERIVED_CAP_OF[key];
  if (capped) return Math.min(of(capped.base), capped.cap);
  return undefined;
}

/**
 * 1つの回数を変えたときに、実際に書き込む回数の一覧。
 * - 足し算で決まる回数（スキル強化）は手では変えられないので何も書かない
 * - ドリンク交換を増やすと、その分ドリンク獲得も増える（減らせば減る。獲得側を変えても交換は動かない）
 */
function linkedChanges(
  key: AbilityName,
  value: number,
  current: (key: AbilityName) => number,
): [AbilityName, number][] {
  if (isAutoCountKey(key)) return [];
  const next = clamp(value, abilityMax(key));
  const changes: [AbilityName, number][] = [[key, next]];
  const linked = LINKED_COUNTS[key];
  const delta = next - current(key);
  if (linked && delta !== 0) {
    changes.push([linked, clamp(current(linked) + delta, abilityMax(linked))]);
  }
  return changes;
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

/**
 * @param scenarioArg 表示中のシナリオ。スケジュールの選択で決まる回数はシナリオごとに変わるので、
 *   シナリオを持っている画面（計算ページ・プロデュース設定ページ）は必ず渡す。
 *   省略すると自前のストアから読むが、その実体は別画面での切り替えに追従しない。
 */
export function useAbilityCounts(scenarioArg?: ScenarioKey) {
  const [overrides, setOverrides] = useState<Overrides>(() =>
    dropUnknownKeys(loadJson<Overrides>(STORAGE_KEY, {})),
  );
  const [userSets, setUserSets] = useState<UserSet[]>(() =>
    loadJson<UserSet[]>(USER_SETS_KEY, []),
  );
  const [adjust, setAdjust] = useState<Overrides>(() =>
    dropUnknownKeys(loadJson<Overrides>(ADJUST_KEY, {})),
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

  const { scenario: ownScenario } = useScenario();
  const scenario = scenarioArg ?? ownScenario;

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

  /**
   * テンプレの「週（日）ごとに何を踏むか」（スプシのスケジュールのタブ）。
   * まだ一度も選び直していないテンプレは、これがそのまま既定の踏み方になる。
   * ユーザーが追加したセット・別シナリオのテンプレには無いので undefined
   * （＝昔通り、回数から推測する）。
   */
  const templateChoices = (set: AbilityCountSet): ScheduleChoices | undefined => {
    const template = TEMPLATE_CHOICES[set.id];
    return template?.scenario === scenario ? template.choices : undefined;
  };

  /**
   * 保存されている回数そのもの（スケジュールの選択で決まる分＝お出かけ・相談・活動支給・特別指導・休む
   * ＋「(N回まで)」版については、まだ一度も選んでいないセットの推測の材料としてだけ使う値）。
   */
  const rawCount = useCallback(
    (set: AbilityCountSet, key: AbilityName): number =>
      clamp(overrides[set.id]?.[key] ?? defaultFor(set, key), abilityMax(key)),
    [overrides],
  );

  /**
   * スケジュールの選択（セットのデフォルト）。保存された選択があればそれが正で、
   * まだ一度も選んでいないセットだけ保存されている回数から推測する。
   */
  const getChoices = useCallback(
    (set: AbilityCountSet): ScheduleChoices =>
      resolveChoices(
        scenario,
        choices[set.id]?.[scenario] ?? templateChoices(set),
        choiceTargets((k) => rawCount(set, k)),
      ),
    [choices, scenario, rawCount],
  );

  /**
   * 現在の回数（上書きがあればそれ、なければデフォルト）。
   * お出かけ・相談・活動支給・特別指導・休む（と「(N回まで)」版）は、今のシナリオの
   * スケジュールの選択から導き出す（回数は選択の写しなので、別シナリオの選択に影響されない）。
   */
  const getCount = useCallback(
    (set: AbilityCountSet, key: AbilityName): number => {
      if (isChoiceAbilityKey(key))
        return abilityCountsFromChoices(scenario, getChoices(set))[key];
      // そのシナリオで意味を持たない回数（Pポイント営業は N.I.A だけ）は 0
      if (!abilityAppliesTo(key, scenario)) return 0;
      const raw = (k: AbilityName) =>
        clamp(overrides[set.id]?.[k] ?? defaultFor(set, k), abilityMax(k));
      // 自動で決まる回数（スキル強化＝A＋M、「(N回まで)」＝元の回数の頭打ち）
      return autoCountOf(key, raw) ?? raw(key);
    },
    [overrides, scenario, getChoices],
  );

  /** ユーザーが値を変更しているか（デフォルトと異なるか） */
  const isOverridden = useCallback(
    (set: AbilityCountSet, key: AbilityName): boolean =>
      overrides[set.id]?.[key] !== undefined,
    [overrides],
  );

  /**
   * そのプロデュースの「最初の回数」（スプシの発動回数・スケジュールのタブの値）。
   * 自分で追加したセットは元になる値が無いので null（画面では「元◯」を出さない）。
   */
  const templateCount = useCallback(
    (set: AbilityCountSet, key: AbilityName): number | null => {
      if (set.id.startsWith("uset-")) return null;
      if (isChoiceAbilityKey(key)) {
        return abilityCountsFromChoices(
          scenario,
          resolveChoices(
            scenario,
            templateChoices(set),
            choiceTargets((k) => clamp(defaultFor(set, k), abilityMax(k))),
          ),
        )[key];
      }
      if (!abilityAppliesTo(key, scenario)) return 0;
      const raw = (k: AbilityName) => clamp(defaultFor(set, k), abilityMax(k));
      return autoCountOf(key, raw) ?? raw(key);
    },
    [scenario],
  );

  /**
   * その回数を「最初の回数」に戻す（プロデュース設定ページの「元◯に戻す」）。
   * 差分を消すだけでよい（消せばテンプレの値に戻る）。連動する回数（ドリンク獲得）も一緒に戻す
   * （片方だけ戻すと、戻すボタンしか押していないのに元より減ってしまうため）。
   */
  const resetToTemplate = useCallback((set: AbilityCountSet, key: AbilityName) => {
    const linked = LINKED_COUNTS[key];
    setOverrides((prev) => {
      if (!prev[set.id]) return prev;
      const forSet = { ...prev[set.id] };
      delete forSet[key];
      if (linked) delete forSet[linked];
      const result = { ...prev, [set.id]: forSet };
      if (Object.keys(forSet).length === 0) delete result[set.id];
      return result;
    });
  }, []);

  /** 今の回数が「最初の回数」と違うか（プロデュース設定ページの「変更」の印） */
  const isChangedFromTemplate = useCallback(
    (set: AbilityCountSet, key: AbilityName): boolean => {
      const base = templateCount(set, key);
      return base !== null && base !== getCount(set, key);
    },
    [templateCount, getCount],
  );

  /** 回数を設定（0〜maxにクランプ。デフォルトと同値なら差分を削除）。連動する回数も一緒に書く */
  const setCount = useCallback(
    (set: AbilityCountSet, key: AbilityName, value: number) => {
      const changes = linkedChanges(key, value, (k) => getCount(set, k));
      if (changes.length === 0) return;
      setOverrides((prev) => {
        const forSet = { ...(prev[set.id] ?? {}) };
        for (const [k, v] of changes) {
          if (v === defaultFor(set, k)) {
            delete forSet[k]; // デフォルトに一致→差分を持たない
          } else {
            forSet[k] = v;
          }
        }
        const result = { ...prev, [set.id]: forSet };
        if (Object.keys(forSet).length === 0) delete result[set.id];
        return result;
      });
    },
    [getCount],
  );

  /** この育成だけの調整を含む、保存されている回数（推測の材料） */
  const rawRunCount = useCallback(
    (set: AbilityCountSet, key: AbilityName): number =>
      clamp(adjust[set.id]?.[key] ?? rawCount(set, key), abilityMax(key)),
    [adjust, rawCount],
  );

  /** この育成でのスケジュールの選択（この育成だけの選択があればそれ、無ければデフォルト） */
  const getRunChoices = useCallback(
    (set: AbilityCountSet): ScheduleChoices =>
      resolveChoices(
        scenario,
        runChoices[set.id]?.[scenario] ?? choices[set.id]?.[scenario] ?? templateChoices(set),
        choiceTargets((k) => rawRunCount(set, k)),
      ),
    [runChoices, choices, scenario, rawRunCount],
  );

  /**
   * 計算ページで使う「この育成での回数」。この育成だけの調整（adjust）があればそれ、
   * なければセットのデフォルト（プロデュース設定ページの値）。
   * スケジュールの選択で決まる分は、この育成での選択から導き出す。
   */
  const getRunCount = useCallback(
    (set: AbilityCountSet, key: AbilityName): number => {
      if (isChoiceAbilityKey(key))
        return abilityCountsFromChoices(scenario, getRunChoices(set))[key];
      if (!abilityAppliesTo(key, scenario)) return 0;
      const raw = (k: AbilityName) =>
        clamp(adjust[set.id]?.[k] ?? getCount(set, k), abilityMax(k));
      return autoCountOf(key, raw) ?? raw(key);
    },
    [adjust, getCount, scenario, getRunChoices],
  );

  /** この育成での回数を変える（デフォルトと同じ値なら調整を消す）。プロデュース設定ページの値は変えない */
  const setRunCount = useCallback(
    (set: AbilityCountSet, key: AbilityName, value: number) => {
      const changes = linkedChanges(key, value, (k) => getRunCount(set, k));
      if (changes.length === 0) return;
      setAdjust((prev) => {
        const forSet = { ...(prev[set.id] ?? {}) };
        for (const [k, v] of changes) {
          if (v === getCount(set, k)) delete forSet[k];
          else forSet[k] = v;
        }
        const result = { ...prev, [set.id]: forSet };
        if (Object.keys(forSet).length === 0) delete result[set.id];
        return result;
      });
    },
    [getCount, getRunCount],
  );

  /** スケジュールの選択を変える（デフォルト）。回数はこの選択から導くので書き戻さない */
  const setChoice = useCallback(
    (set: AbilityCountSet, rowId: string, event: ChoiceEvent | null) => {
      const next: ScheduleChoices = { ...getChoices(set), [rowId]: event };
      setChoices((prev) => ({
        ...prev,
        [set.id]: { ...(prev[set.id] ?? {}), [scenario]: next },
      }));
    },
    [getChoices, scenario],
  );

  /** この育成だけのスケジュールの選択を変える（デフォルトは変えない） */
  const setRunChoice = useCallback(
    (set: AbilityCountSet, rowId: string, event: ChoiceEvent | null) => {
      const next: ScheduleChoices = { ...getRunChoices(set), [rowId]: event };
      setRunChoices((prev) => ({
        ...prev,
        [set.id]: { ...(prev[set.id] ?? {}), [scenario]: next },
      }));
    },
    [getRunChoices, scenario],
  );

  /** この育成だけの選択がデフォルトと違う週か（黄色い枠） */
  const isRunChoiceAdjusted = useCallback(
    (set: AbilityCountSet, rowId: string): boolean =>
      (getRunChoices(set)[rowId] ?? null) !== (getChoices(set)[rowId] ?? null),
    [getRunChoices, getChoices],
  );

  /**
   * まだ一度も選んでいないセットで、保存されていた回数が今のシナリオのスケジュールに
   * 入りきらなかった分（「入る分だけにしました」と画面で知らせる）。
   * 一度でも選べば選択そのものが正になるので、以後は出ない。
   */
  const choiceFitNote = useCallback(
    (set: AbilityCountSet, run: boolean): { event: ChoiceEvent; from: number; to: number }[] => {
      const stored = run
        ? (runChoices[set.id]?.[scenario] ?? choices[set.id]?.[scenario] ?? templateChoices(set))
        : (choices[set.id]?.[scenario] ?? templateChoices(set));
      if (stored) return [];
      const raw = run ? rawRunCount : rawCount;
      return choiceShortfall(
        scenario,
        run ? getRunChoices(set) : getChoices(set),
        choiceTargets((k) => raw(set, k)),
      );
    },
    [runChoices, choices, scenario, rawRunCount, rawCount, getRunChoices, getChoices],
  );

  /** この育成だけの調整が入っているか（スケジュールで決まる回数は選択の違いを見る） */
  const isRunAdjusted = useCallback(
    // 調整が残っていても、あとでデフォルトを同じ値にしたら「変更」ではない（値で比べる）
    (set: AbilityCountSet, key: AbilityName): boolean =>
      getRunCount(set, key) !== getCount(set, key),
    [getRunCount, getCount],
  );

  /**
   * この育成だけの調整の件数。デフォルトと値が違うものだけ数える（同じ値になった調整は数えない）。
   * スケジュールの選択は「変えた週の数」で数える（同じ回数のまま週だけ入れ替えた場合も、上書き保存できるように）。
   */
  const runAdjustCount = useCallback(
    (set: AbilityCountSet): number => {
      const plain = Object.keys(adjust[set.id] ?? {}).filter(
        (k) =>
          !isChoiceAbilityKey(k) &&
          // 自動で決まる回数（スキル強化・「(N回まで)」）は手で変えられないので数えない
          // （昔の保存データに残っていることがある）
          !isAutoCountKey(k as AbilityName) &&
          getRunCount(set, k as AbilityName) !== getCount(set, k as AbilityName),
      ).length;
      const run = getRunChoices(set);
      const def = getChoices(set);
      let rows = 0;
      for (const id of Object.keys(run)) {
        if ((run[id] ?? null) !== (def[id] ?? null)) rows++;
      }
      return plain + rows;
    },
    [adjust, getRunCount, getCount, getRunChoices, getChoices],
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
    // スケジュールの選択もコピーする。まだ選び直していないテンプレは保存された選択を持たないので、
    // 今出ている選択（＝スプレッドシートのスケジュールの値）をこのシナリオの分として書き写す
    // （複製先はテンプレではないので、写さないと回数からの推測になって元と違う踏み方になる）
    const copied = getChoices(source);
    setChoices((prev) => ({
      ...prev,
      [id]: { ...(prev[source.id] ?? {}), [scenario]: copied },
    }));
  }, [getChoices, scenario]);

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
      // 昔のセーブデータにだけ残っている、今は無いアビリティ（例: 温存スキル強化）は読み飛ばし、
      // 自動の値になった回数（チェンジ(3回まで)など）は元の回数へ移す
      for (const [key, value] of Object.entries(migrateAbilityCounts(counts))) {
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
    templateCount,
    isChangedFromTemplate,
    resetToTemplate,
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
    choiceFitNote,
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
