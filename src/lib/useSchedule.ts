import { useCallback, useEffect, useState } from "react";
import { useSaveNotifier } from "./storeSync";
import {
  CLASSES,
  distributeExam,
  EXAMS,
  examStar,
  LESSONS,
} from "@/data/schedule";
import { TYPE_KEYS, type TypeKey } from "./useCalcSettings";

/**
 * レッスン・オーディション・授業ページの入力状態。
 *
 * 踏み方・授業・選抜スコアはすべてタイプ（Vo/Da/Vi）に直接紐づけて保存する
 * （ロール（メイン1/メイン2/サブ）の概念は廃止。アイドルを切り替えたときは
 * 審査基準ランクの対応でタイプ間の入れ替え（remapTypes）を行う）。
 *
 * - lessons: 各公開レッスンの メイン/サブ タイプとSP有無
 * - classTypes: 各授業で上げるタイプ
 * - examScores: 選抜ごとのタイプ別スコア
 */
const STORAGE_KEY = "gakumas:schedule:v1";

/** main=null は「このレッスンを踏まない」（獲得・スター性・Pポイントなし） */
export type LessonPick = { main: TypeKey | null; sub: TypeKey; sp: boolean };
export type ExamScores = Record<TypeKey, number>;

/**
 * 2ndタイプ（サブ枠）に指定したタイプが出現する確率。
 * 踏むタイプ以外の2タイプのうち、審査基準が高い方が75%・低い方が25%で抽選される
 * （例: 咲季[Vi>Da>Vo]のDaレッスン → サブVi=75% / サブVo=25%）。
 * 実現確率（SPレッスン確率）の計算に使う。ステ計算は選択したサブに全額入る想定のまま。
 */
export function subAppearProb(
  main: TypeKey,
  sub: TypeKey,
  ranks: Record<TypeKey, number>,
): number {
  const other = TYPE_KEYS.find((t) => t !== main && t !== sub)!;
  return ranks[sub] <= ranks[other] ? 0.75 : 0.25;
}

export type ScheduleState = {
  lessons: LessonPick[];
  classTypes: TypeKey[];
  examScores: ExamScores[];
  /**
   * 選抜ごとの上昇ステの直接入力（パラメータボーナス%は含まない値）。
   * null はスコアから分配式で出す（既定）。入力した選抜は自動探索で動かさない。
   * スター性はどちらのときもスコアの合計から計算する。
   */
  examStats: (ExamScores | null)[];
};

const EMPTY_EXAM: ExamScores = { vocal: 0, dance: 0, visual: 0 };

// 初回デフォルトの選抜スコア（スター性が上限に達する高さ・3タイプ均等）。
// ステ上昇は score が正なら base で一定なので、magnitude はスター性のためだけ。
const DEFAULT_EXAM_EACH = [5000, 50000, 140000];

const DEFAULT_STATE: ScheduleState = {
  lessons: LESSONS.map(() => ({ main: "vocal", sub: "dance", sp: true })),
  classTypes: CLASSES.map(() => "visual"),
  examScores: EXAMS.map((_, i) => {
    const each = DEFAULT_EXAM_EACH[i] ?? 0;
    return { vocal: each, dance: each, visual: each };
  }),
  examStats: EXAMS.map(() => null),
};

function otherType(type: TypeKey): TypeKey {
  return TYPE_KEYS.find((t) => t !== type)!;
}

const isTypeKey = (v: unknown): v is TypeKey =>
  TYPE_KEYS.includes(v as TypeKey);

/**
 * 旧ロール形式（メイン1/メイン2/サブ紐づけ）→ タイプ紐づけへの移行。
 * 当時のロール⇔タイプ対応は計算ページの保存値（lessons[type].role）から復元する。
 */
export function roleToTypeFromCalcStorage(): Record<string, TypeKey> {
  const fallback: Record<string, TypeKey> = {
    メイン1: "visual",
    メイン2: "dance",
    サブ: "vocal",
  };
  try {
    const raw = localStorage.getItem("gakumas:calcSettings:v1");
    if (!raw) return fallback;
    const stored = JSON.parse(raw) as {
      lessons?: Partial<Record<TypeKey, { role?: string }>>;
    };
    const map: Record<string, TypeKey> = {};
    const used = new Set<TypeKey>();
    for (const type of TYPE_KEYS) {
      const role = stored.lessons?.[type]?.role;
      if (role && !(role in map)) {
        map[role] = type;
        used.add(type);
      }
    }
    // 欠け・重複は余りタイプで補って全単射にする
    for (const role of ["メイン1", "メイン2", "サブ"]) {
      if (!(role in map)) {
        const type = TYPE_KEYS.find((t) => !used.has(t))!;
        map[role] = type;
        used.add(type);
      }
    }
    return map;
  } catch {
    return fallback;
  }
}

/**
 * スケジュール入力からタイプ別上昇量・スター性・Pポイントを集計する（純関数）。
 * パラメータボーナスはここでは掛けない（sheetScore 側でまとめて変換する）。
 */
export function computeScheduleGains(state: {
  lessons: LessonPick[];
  classTypes: TypeKey[];
  examScores: ExamScores[];
  examStats?: (ExamScores | null)[];
}) {
  const gains: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
  const lessonGains: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
  const classGains: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
  const examGains: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
  let lessonStar = 0;
  let examStarTotal = 0;
  let pPoints = 0;

  LESSONS.forEach((lesson, i) => {
    const pick = state.lessons[i];
    if (!pick.main) return; // 踏まないレッスン（獲得・スター性・Pポイントなし）
    const spIndex = pick.sp ? 1 : 0;
    const mainGain = lesson.main[spIndex];
    const subGain = lesson.sub[spIndex];
    gains[pick.main] += mainGain;
    gains[pick.sub] += subGain;
    lessonGains[pick.main] += mainGain;
    lessonGains[pick.sub] += subGain;
    // スター性は非SPでSPの半分（7.5等の小数は切り捨て）
    lessonStar += Math.floor(lesson.star[spIndex]);
    pPoints += lesson.p;
  });

  CLASSES.forEach((cls, i) => {
    const type = state.classTypes[i];
    gains[type] += cls.gain; // 授業には%は乗らない
    classGains[type] += cls.gain;
  });

  const examRows = EXAMS.map((exam, i) => {
    const scores = state.examScores[i];
    const total = TYPE_KEYS.reduce((sum, t) => sum + scores[t], 0);
    // ステ直接入力の選抜はその値をそのまま使う（スター性はスコアの合計から）
    const manual = state.examStats?.[i] ?? null;
    const rawDist = manual ?? distributeExam(i, scores, TYPE_KEYS);
    const dist = Object.fromEntries(
      TYPE_KEYS.map((t) => [t, Math.max(0, Math.floor(rawDist[t]))]),
    ) as Record<TypeKey, number>;
    const starGain = total > 0 ? examStar(i, total) : 0;
    for (const type of TYPE_KEYS) {
      gains[type] += dist[type];
      examGains[type] += dist[type];
    }
    examStarTotal += starGain;
    return { name: exam.name, total, dist, star: starGain };
  });

  return {
    gains,
    star: lessonStar + examStarTotal,
    pPoints,
    examRows,
    // 計算シート用の内訳
    breakdown: {
      lessons: lessonGains,
      classes: classGains,
      exams: examGains,
      lessonStar,
      examStar: examStarTotal,
    },
  };
}

/** localStorageから同期読み込み（旧ロール形式・旧タイプ形式の移行込み） */
export function loadScheduleState(): ScheduleState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Record<string, unknown>;
      const lessonsRaw = (stored.lessons ?? []) as Record<string, unknown>[];
      // ロール形式（main: "メイン1" 等）か判定して変換表を用意
      const isRoleFormat = lessonsRaw.some(
        (l) => typeof l?.main === "string" && !isTypeKey(l.main),
      );
      const roleToType = isRoleFormat ? roleToTypeFromCalcStorage() : null;
      const toType = (v: unknown, fb: TypeKey): TypeKey => {
        if (isTypeKey(v)) return v;
        if (typeof v === "string" && roleToType?.[v]) return roleToType[v];
        return fb;
      };

      const lessons: LessonPick[] = LESSONS.map((_, i) => {
        const l = lessonsRaw[i] ?? {};
        // main=null（踏まない）は保存値をそのまま復元。さらに古い形式（l.type）にも対応
        const main =
          l.main === null ? null : toType(l.main ?? l.type, "vocal");
        let sub = toType(l.sub ?? l.subType, "dance");
        if (main !== null && sub === main) sub = otherType(main);
        return { main, sub, sp: (l.sp as boolean | undefined) ?? true };
      });

      // 授業: 新形式 classTypes（タイプ）／ロール形式 classRoles を吸収
      const classTypesRaw = (stored.classTypes ??
        stored.classRoles ??
        []) as unknown[];
      const classTypes: TypeKey[] = CLASSES.map((_, i) =>
        toType(classTypesRaw[i], "visual"),
      );

      // 選抜スコア: タイプキー or ロールキーを吸収
      const examScoresRaw = (stored.examScores ?? []) as Record<
        string,
        number
      >[];
      const examRoleToType = roleToType ?? roleToTypeFromCalcStorage();
      const examScores: ExamScores[] = EXAMS.map((_, i) => {
        const rawScores = examScoresRaw[i] ?? {};
        const converted = { ...EMPTY_EXAM };
        for (const [key, value] of Object.entries(rawScores)) {
          if (isTypeKey(key)) converted[key] += value ?? 0;
          else if (examRoleToType[key]) converted[examRoleToType[key]] += value ?? 0;
        }
        return converted;
      });

      // 選抜のステ直接入力（無い旧データはスコア入力）
      const examStatsRaw = (stored.examStats ?? []) as (Record<string, number> | null)[];
      const examStats: (ExamScores | null)[] = EXAMS.map((_, i) => {
        const raw = examStatsRaw[i];
        if (!raw || typeof raw !== "object") return null;
        const converted = { ...EMPTY_EXAM };
        for (const t of TYPE_KEYS) converted[t] = Math.max(0, Number(raw[t]) || 0);
        return converted;
      });

      return { lessons, classTypes, examScores, examStats };
    }
  } catch {
    // 破損データは無視
  }
  return DEFAULT_STATE;
}

export function useSchedule() {
  const [state, setState] = useState<ScheduleState>(loadScheduleState);
  const notifySave = useSaveNotifier();

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      notifySave();
    } catch {
      // 容量超過などは無視
    }
  }, [state, notifySave]);

  /** メインのタイプを変更（サブと衝突したら入れ替え） */
  const setLessonMain = useCallback((index: number, main: TypeKey) => {
    setState((prev) => ({
      ...prev,
      lessons: prev.lessons.map((l, i) => {
        if (i !== index) return l;
        return {
          ...l,
          main,
          sub: l.sub === main ? (l.main ?? otherType(main)) : l.sub,
        };
      }),
    }));
  }, []);

  /** レッスンを「踏まない」に戻す（選択中のメインをもう一度押したとき用） */
  const clearLessonMain = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      lessons: prev.lessons.map((l, i) =>
        i === index ? { ...l, main: null } : l,
      ),
    }));
  }, []);

  /** 全レッスンを「踏まない」に戻す（さらの状態） */
  const clearAllLessons = useCallback(() => {
    setState((prev) => ({
      ...prev,
      lessons: prev.lessons.map((l) => ({ ...l, main: null })),
    }));
  }, []);

  /** サブのタイプを変更（メインと衝突したら入れ替え） */
  const setLessonSub = useCallback((index: number, sub: TypeKey) => {
    setState((prev) => ({
      ...prev,
      lessons: prev.lessons.map((l, i) => {
        if (i !== index) return l;
        return { ...l, sub, main: l.main === sub ? l.sub : l.main };
      }),
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

  /** 全レッスンのメインを一括変更（サブが被ったら入れ替え・SPは維持） */
  const applyAllMain = useCallback((main: TypeKey) => {
    setState((prev) => ({
      ...prev,
      lessons: prev.lessons.map((l) => ({
        ...l,
        main,
        sub: l.sub === main ? (l.main ?? otherType(main)) : l.sub,
      })),
    }));
  }, []);

  /** 全レッスンのサブを一括変更（メインが被ったら入れ替え・SPは維持） */
  const applyAllSubs = useCallback((sub: TypeKey) => {
    setState((prev) => ({
      ...prev,
      lessons: prev.lessons.map((l) => ({
        ...l,
        sub,
        main: l.main === sub ? l.sub : l.main,
      })),
    }));
  }, []);

  const setClassType = useCallback((index: number, type: TypeKey) => {
    setState((prev) => ({
      ...prev,
      classTypes: prev.classTypes.map((v, i) => (i === index ? type : v)),
    }));
  }, []);

  /** 全授業のタイプを一括変更 */
  const applyAllClasses = useCallback((type: TypeKey) => {
    setState((prev) => ({
      ...prev,
      classTypes: prev.classTypes.map(() => type),
    }));
  }, []);

  /** 踏み方の一括適用（最適化ボタン用） */
  const setPlan = useCallback(
    (
      lessons: LessonPick[],
      classTypes: TypeKey[],
      examScores?: ExamScores[],
    ) => {
      setState((prev) => ({
        ...prev,
        lessons,
        classTypes,
        // ステ直接入力の選抜はスコアを動かさない（スター性がずれないように）
        ...(examScores
          ? {
              examScores: examScores.map((e, i) =>
                prev.examStats[i] ? prev.examScores[i] : e,
              ),
            }
          : {}),
      }));
    },
    [],
  );

  const setExamScore = useCallback(
    (examIndex: number, type: TypeKey, value: number) => {
      setState((prev) => ({
        ...prev,
        examScores: prev.examScores.map((scores, i) =>
          i === examIndex ? { ...scores, [type]: Math.max(0, value) } : scores,
        ),
      }));
    },
    [],
  );

  /** 選抜スコアの3タイプ一括設定（極振りボタン用） */
  const setExamScores = useCallback(
    (examIndex: number, scores: ExamScores) => {
      setState((prev) => ({
        ...prev,
        examScores: prev.examScores.map((s, i) =>
          i === examIndex
            ? {
                vocal: Math.max(0, Math.round(scores.vocal)),
                dance: Math.max(0, Math.round(scores.dance)),
                visual: Math.max(0, Math.round(scores.visual)),
              }
            : s,
        ),
      }));
    },
    [],
  );

  /** 選抜ごとの入力の切り替え。ステ入力にするときは今の分配結果を初期値にする */
  const setExamMode = useCallback((examIndex: number, mode: "score" | "stat") => {
    setState((prev) => ({
      ...prev,
      examStats: prev.examStats.map((s, i) => {
        if (i !== examIndex) return s;
        if (mode === "score") return null;
        if (s) return s;
        const dist = distributeExam(examIndex, prev.examScores[examIndex], TYPE_KEYS);
        return {
          vocal: Math.floor(dist.vocal),
          dance: Math.floor(dist.dance),
          visual: Math.floor(dist.visual),
        };
      }),
    }));
  }, []);

  /** ステ直接入力の値を変える（パラメータボーナス%は含まない） */
  const setExamStat = useCallback(
    (examIndex: number, type: TypeKey, value: number) => {
      setState((prev) => ({
        ...prev,
        examStats: prev.examStats.map((s, i) =>
          i === examIndex && s ? { ...s, [type]: Math.max(0, Math.round(value)) } : s,
        ),
      }));
    },
    [],
  );

  /**
   * タイプ間の入れ替え（アイドル切替時の審査基準合わせ用）。
   * map[t] = 旧タイプtの踏み方・スコアの移動先タイプ。
   */
  const remapTypes = useCallback((map: Record<TypeKey, TypeKey>) => {
    setState((prev) => ({
      ...prev,
      lessons: prev.lessons.map((l) => ({
        ...l,
        main: l.main ? map[l.main] : null,
        sub: map[l.sub],
      })),
      classTypes: prev.classTypes.map((t) => map[t]),
      examScores: prev.examScores.map((s) => {
        const next = { ...EMPTY_EXAM };
        for (const t of TYPE_KEYS) next[map[t]] = s[t];
        return next;
      }),
      examStats: prev.examStats.map((s) => {
        if (!s) return null;
        const next = { ...EMPTY_EXAM };
        for (const t of TYPE_KEYS) next[map[t]] = s[t];
        return next;
      }),
    }));
  }, []);

  /**
   * 入力状態をまるごと置き換える（セーブデータの読み込み用）。
   * マスタ（LESSONS/CLASSES/EXAMS）の件数が保存時と違っても壊れないよう、
   * 現行の件数に合わせて詰め直す。
   */
  const replaceAll = useCallback(
    (snapshot: Omit<ScheduleState, "examStats"> & { examStats?: (ExamScores | null)[] }) => {
    setState({
      lessons: LESSONS.map(
        (_, i) => snapshot.lessons[i] ?? DEFAULT_STATE.lessons[i],
      ),
      classTypes: CLASSES.map(
        (_, i) => snapshot.classTypes[i] ?? DEFAULT_STATE.classTypes[i],
      ),
      examScores: EXAMS.map(
        (_, i) => snapshot.examScores[i] ?? DEFAULT_STATE.examScores[i],
      ),
      // 旧セーブ（examStats 無し）はスコア入力
      examStats: EXAMS.map((_, i) => snapshot.examStats?.[i] ?? null),
    });
    },
    [],
  );

  return {
    ...state,
    replaceAll,
    setLessonMain,
    clearLessonMain,
    clearAllLessons,
    setLessonSub,
    toggleLessonSp,
    applyAllMain,
    applyAllSubs,
    setClassType,
    applyAllClasses,
    setPlan,
    setExamScore,
    setExamScores,
    setExamMode,
    setExamStat,
    remapTypes,
    loaded: true,
  };
}
