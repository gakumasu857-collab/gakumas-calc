import { useCallback, useEffect, useState } from "react";
import { HATSU_CLASSES, HATSU_LESSONS } from "@/data/scenarios";
import { useSaveNotifier } from "./storeSync";
import { roleToTypeFromCalcStorage } from "./useSchedule";
import { TYPE_KEYS, type TypeKey } from "./useCalcSettings";

/**
 * 定期公演『初』（レジェンド）のスケジュール入力状態。
 * - lessons: レジェンドレッスン5回の踏みタイプ・SP有無・パーフェクト達成か
 *   （パーフェクト時はクリア超過分が残り2タイプにも入る）
 * - classTypes: 授業4回のタイプ
 * - midRank/finalRank: 中間・最終試験の順位（1始まり。最終の4=4位以下）
 * - midScore/finalScore: 試験スコア（評価値換算に使用）
 * すべてタイプ直接紐づけ（ロール概念なし）。アイドル切替時は remapTypes で入れ替える。
 */
const STORAGE_KEY = "gakumas:hatsuSchedule:v1";

export type HatsuLessonPick = {
  /** null = このレッスンを踏まない */
  main: TypeKey | null;
  sp: boolean;
  perfect: boolean;
};

export type HatsuState = {
  lessons: HatsuLessonPick[];
  classTypes: TypeKey[];
  midRank: number;
  finalRank: number;
  midScore: number;
  finalScore: number;
};

const DEFAULT_STATE: HatsuState = {
  lessons: HATSU_LESSONS.map(() => ({
    main: "vocal",
    sp: true,
    perfect: true,
  })),
  classTypes: HATSU_CLASSES.map(() => "visual"),
  // 初回デフォルトは試験を上限寄りに（順位1位・スコアは高め）
  midRank: 1,
  finalRank: 1,
  midScore: 200000,
  finalScore: 2000000,
};

const isTypeKey = (v: unknown): v is TypeKey =>
  TYPE_KEYS.includes(v as TypeKey);

/** localStorageから同期読み込み（旧ロール形式の移行込み） */
export function loadHatsuState(): HatsuState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Record<string, unknown>;
      const lessonsRaw = (stored.lessons ?? []) as Record<string, unknown>[];
      const classesRaw = (stored.classTypes ??
        stored.classRoles ??
        []) as unknown[];
      const isRoleFormat =
        lessonsRaw.some(
          (l) => typeof l?.main === "string" && !isTypeKey(l.main),
        ) || classesRaw.some((c) => typeof c === "string" && !isTypeKey(c));
      const roleToType = isRoleFormat ? roleToTypeFromCalcStorage() : null;
      const toType = (v: unknown, fb: TypeKey): TypeKey => {
        if (isTypeKey(v)) return v;
        if (typeof v === "string" && roleToType?.[v]) return roleToType[v];
        return fb;
      };
      return {
        lessons: HATSU_LESSONS.map((_, i) => ({
          main:
            lessonsRaw[i]?.main === null
              ? null
              : toType(lessonsRaw[i]?.main, "vocal"),
          sp: (lessonsRaw[i]?.sp as boolean | undefined) ?? true,
          perfect: (lessonsRaw[i]?.perfect as boolean | undefined) ?? true,
        })),
        classTypes: HATSU_CLASSES.map((_, i) => toType(classesRaw[i], "visual")),
        midRank: (stored.midRank as number | undefined) ?? 1,
        finalRank: (stored.finalRank as number | undefined) ?? 1,
        midScore: Math.min((stored.midScore as number | undefined) ?? 0, 200000),
        finalScore: (stored.finalScore as number | undefined) ?? 0,
      };
    }
  } catch {
    // 破損データは無視
  }
  return DEFAULT_STATE;
}

export function useHatsuSchedule() {
  const [state, setState] = useState<HatsuState>(loadHatsuState);
  const notifySave = useSaveNotifier();

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      notifySave();
    } catch {
      // 容量超過などは無視
    }
  }, [state, notifySave]);

  const setLessonMain = useCallback((index: number, main: TypeKey | null) => {
    setState((prev) => ({
      ...prev,
      lessons: prev.lessons.map((l, i) => (i === index ? { ...l, main } : l)),
    }));
  }, []);

  const toggleLessonSp = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      lessons: prev.lessons.map((l, i) =>
        i === index ? { ...l, sp: !l.sp } : l,
      ),
    }));
  }, []);

  const toggleLessonPerfect = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      lessons: prev.lessons.map((l, i) =>
        i === index ? { ...l, perfect: !l.perfect } : l,
      ),
    }));
  }, []);

  const applyAllMain = useCallback((main: TypeKey) => {
    setState((prev) => ({
      ...prev,
      lessons: prev.lessons.map((l) => ({ ...l, main })),
    }));
  }, []);

  const setClassType = useCallback((index: number, type: TypeKey) => {
    setState((prev) => ({
      ...prev,
      classTypes: prev.classTypes.map((v, i) => (i === index ? type : v)),
    }));
  }, []);

  const applyAllClasses = useCallback((type: TypeKey) => {
    setState((prev) => ({
      ...prev,
      classTypes: prev.classTypes.map(() => type),
    }));
  }, []);

  /** 踏み方・授業の一括適用（全自動最適化用） */
  const setPlan = useCallback(
    (lessons: HatsuLessonPick[], classTypes: TypeKey[]) => {
      setState((prev) => ({ ...prev, lessons, classTypes }));
    },
    [],
  );

  /** タイプ間の入れ替え（アイドル切替時の審査基準合わせ用） */
  const remapTypes = useCallback((map: Record<TypeKey, TypeKey>) => {
    setState((prev) => ({
      ...prev,
      lessons: prev.lessons.map((l) => ({
        ...l,
        main: l.main ? map[l.main] : null,
      })),
      classTypes: prev.classTypes.map((t) => map[t]),
    }));
  }, []);

  const update = useCallback(
    (
      patch: Partial<
        Pick<HatsuState, "midRank" | "finalRank" | "midScore" | "finalScore">
      >,
    ) => {
      setState((prev) => ({ ...prev, ...patch }));
    },
    [],
  );

  /**
   * 入力状態をまるごと置き換える（セーブデータの読み込み用）。
   * マスタの件数が保存時と違っても壊れないよう、現行の件数に合わせて詰め直す。
   */
  const replaceAll = useCallback((snapshot: HatsuState) => {
    setState({
      ...DEFAULT_STATE,
      ...snapshot,
      lessons: HATSU_LESSONS.map(
        (_, i) => snapshot.lessons[i] ?? DEFAULT_STATE.lessons[i],
      ),
      classTypes: HATSU_CLASSES.map(
        (_, i) => snapshot.classTypes[i] ?? DEFAULT_STATE.classTypes[i],
      ),
    });
  }, []);

  return {
    ...state,
    setLessonMain,
    toggleLessonSp,
    toggleLessonPerfect,
    applyAllMain,
    setClassType,
    applyAllClasses,
    setPlan,
    remapTypes,
    update,
    replaceAll,
    loaded: true,
  };
}
