/**
 * N.I.A.・『初』のスケジュール集計と sheetScore 用コンテキストの組み立て（純関数）。
 * H.I.F. は従来どおり useSchedule / sheetContext を使う。
 * 踏み方はタイプ直接紐づけ。N.I.A.のオーディション式はアイドルの審査基準ランク
 * （IDOL_RANKS。1=最重要タイプ）で決まる。
 */
import {
  HATSU_CLASSES,
  HATSU_EXAMS,
  HATSU_LESSONS,
  NIA_AUDITION_CAPS,
  NIA_LESSONS,
  NIA_SALES,
  niaFinaleStat,
  niaFinaleVotes,
  type NiaTag,
  hatsuLessonGains,
} from "@/data/scenarios";
import { niaChallengeApply } from "@/data/niaChallenge";
import { TYPE_SHEET_ROLE, typeLessonCounts } from "./sheetContext";
import {
  buildCountResolver,
  type SheetScoreContext,
} from "./sheetScore";
import type { NiaLessonPick, NiaSalePick } from "./useNiaSchedule";
import type { HatsuLessonPick } from "./useHatsuSchedule";
import { TYPE_KEYS, type TypeKey } from "./useCalcSettings";

type Gains = Record<TypeKey, number>;
const zeroGains = (): Gains => ({ vocal: 0, dance: 0, visual: 0 });

/**
 * オーディション素点を上限（NIA_AUDITION_CAPS[tag][回][流行順位-1]）でクランプする。
 * 流行順位＝そのタイプの審査基準ランク。UIでも上限入力だが、初回デフォルト等の
 * 上限超過値も正しく評価するためここでも丸める。
 */
function clampAudition(
  audition: Record<TypeKey, number>,
  auditionIndex: number,
  tag: NiaTag,
  ranks: TypeRanks,
): Record<TypeKey, number> {
  const caps = NIA_AUDITION_CAPS[tag]?.[auditionIndex];
  const out = zeroGains();
  for (const type of TYPE_KEYS) {
    const cap = caps?.[ranks[type] - 1] ?? Infinity;
    out[type] = Math.min(audition[type], cap);
  }
  return out;
}

/** タイプ→審査基準ランク（1〜3）。IDOL_RANKSから作る（未定義アイドルは Vo>Da>Vi 扱い） */
export type TypeRanks = Record<TypeKey, number>;
export const DEFAULT_RANKS: TypeRanks = { vocal: 1, dance: 2, visual: 3 };

export type NiaStateLike = {
  lessons: NiaLessonPick[];
  sales: NiaSalePick[];
  auditions: Record<TypeKey, number>[];
  auditionVotes: number[];
  finalScores: Record<TypeKey, number>;
  /** 最終オーディションの素点を直接入力するとき（null／省略＝スコアから導出） */
  finalStats?: Record<TypeKey, number> | null;
};

/**
 * 最終オーディションのタイプ別素点。
 * Vo/Da/Viそれぞれのスコアを、そのタイプの審査基準ランクの式に当てはめる
 * （スコアによって上がるステータスが決まる。式はバランス=flat/特化=skewで別）。
 */
export function niaFinaleStats(
  state: Pick<NiaStateLike, "finalScores">,
  ranks: TypeRanks,
  tag: NiaTag,
): Record<TypeKey, number> {
  const out = zeroGains();
  for (const type of TYPE_KEYS) {
    out[type] = niaFinaleStat(tag, ranks[type], state.finalScores[type]);
  }
  return out;
}

/**
 * 最終オーディションのタイプ別素点（計算に使う値）。
 * ステ入力（finalStats）があればそれを上限でクランプ、無ければスコアから導出。
 */
export function niaFinaleBaseStats(
  state: Pick<NiaStateLike, "finalScores" | "finalStats">,
  ranks: TypeRanks,
  tag: NiaTag,
): Record<TypeKey, number> {
  if (state.finalStats) return clampAudition(state.finalStats, 2, tag, ranks);
  return niaFinaleStats(state, ranks, tag);
}

/** オーディション（1次・2次・最終）のタイプ別素点（上限クランプ済み・獲得ボーナス前）。表示用 */
export function niaAuditionBaseStats(
  state: NiaStateLike,
  tag: NiaTag,
  ranks: TypeRanks,
): Record<TypeKey, number>[] {
  return [
    ...state.auditions.map((a, i) => clampAudition(a, i, tag, ranks)),
    niaFinaleBaseStats(state, ranks, tag),
  ];
}

/** 最終オーディションの合計スコア（ファン投票数の導出元） */
export function niaFinaleTotalScore(
  state: Pick<NiaStateLike, "finalScores">,
): number {
  return TYPE_KEYS.reduce((sum, type) => sum + state.finalScores[type], 0);
}

export type HatsuStateLike = {
  lessons: HatsuLessonPick[];
  classTypes: TypeKey[];
  midRank: number;
  finalRank: number;
};

/**
 * N.I.A.の素の獲得量集計。
 * - lessons: 自主レッスン（選んだタイプのみ・パラボ有効）
 * - classes: 営業（授業と同じく選んだ1タイプのみ・パラボ無効）
 * - exams: 1次・2次オーディション素点（手入力）＋最終（スコアから導出、またはステ入力）に
 *   チャレンジPアイテムの獲得ボーナス（challengePct）を乗せた値。パラボ有効
 * - votes: ファン投票数の内訳（営業＋1次・2次手入力＋最終導出。札は呼び出し側で加算）
 */
export function computeNiaGains(
  state: NiaStateLike,
  tag: NiaTag,
  ranks: TypeRanks,
  challengePct = 0,
) {
  const lessons = zeroGains();
  const classes = zeroGains();
  const exams = zeroGains();
  let pPoints = 0;

  NIA_LESSONS.forEach((lesson, i) => {
    const pick = state.lessons[i];
    if (!pick.main) return; // 踏まないレッスン
    lessons[pick.main] += lesson.value[pick.sp ? 1 : 0];
    pPoints += lesson.p;
  });
  let salesVotes = 0;
  NIA_SALES.forEach((sale, i) => {
    const pick = state.sales[i];
    classes[pick.type] += sale.value;
    salesVotes += sale.votes[pick.resort ? "resort" : "other"][pick.great ? 1 : 0];
  });
  state.auditions.forEach((audition, i) => {
    const clamped = clampAudition(audition, i, tag, ranks);
    for (const type of TYPE_KEYS) exams[type] += niaChallengeApply(clamped[type], challengePct);
  });
  const finale = niaFinaleBaseStats(state, ranks, tag);
  for (const type of TYPE_KEYS) exams[type] += niaChallengeApply(finale[type], challengePct);

  const gains = zeroGains();
  for (const type of TYPE_KEYS) {
    gains[type] = lessons[type] + classes[type] + exams[type];
  }
  const auditionVotes = state.auditionVotes.reduce((sum, v) => sum + v, 0);
  const finaleVotes = niaFinaleVotes(niaFinaleTotalScore(state));
  return {
    gains,
    pPoints,
    breakdown: { lessons, classes, exams },
    finale,
    votes: {
      sales: salesVotes,
      auditions: auditionVotes,
      finale: finaleVotes,
      /** 札を除いた合計 */
      base: salesVotes + auditionVotes + finaleVotes,
    },
  };
}

/**
 * 『初』レジェンドの素の獲得量集計。
 * - lessons: レッスン中の点数がそのまま選んだタイプに、クリアライン超過分は残り2タイプにも（パラボ有効）
 * - classes: 授業（選んだタイプ・パラボ無効扱い）
 * - exams: 試験の順位報酬（全タイプ一律・パラボ非適用と仮定）
 */
export function computeHatsuGains(state: HatsuStateLike) {
  const lessons = zeroGains();
  const classes = zeroGains();
  const exams = zeroGains();
  let pPoints = 0;

  HATSU_LESSONS.forEach((lesson, i) => {
    const pick = state.lessons[i];
    if (!pick.main) return; // 踏まないレッスン
    const g = hatsuLessonGains(i, pick.sp, pick.score);
    for (const type of TYPE_KEYS) {
      lessons[type] += type === pick.main ? g.main : g.other;
    }
    pPoints += lesson.p;
  });
  HATSU_CLASSES.forEach((cls, i) => {
    classes[state.classTypes[i]] += cls.gain;
  });
  const midGain = HATSU_EXAMS[0].rankGains[state.midRank - 1] ?? 0;
  const finalGain = HATSU_EXAMS[1].rankGains[state.finalRank - 1] ?? 0;
  for (const type of TYPE_KEYS) exams[type] += midGain + finalGain;

  const gains = zeroGains();
  for (const type of TYPE_KEYS) {
    gains[type] = lessons[type] + classes[type] + exams[type];
  }
  return { gains, pPoints, breakdown: { lessons, classes, exams } };
}

/**
 * N.I.A.用の sheetScore コンテキスト。
 * パラボ母数 = タイプの自主レッスン獲得＋オーディション素点（最終はスコア導出またはステ入力。獲得ボーナス込み）。
 */
export function buildNiaScoreContext(
  state: NiaStateLike,
  manualCount: (label: string) => number | undefined,
  eventCounts: SheetScoreContext["eventCounts"] | undefined,
  tag: NiaTag,
  ranks: TypeRanks,
  challengePct = 0,
): SheetScoreContext {
  const lessonCounts = typeLessonCounts(state.lessons);
  const finale = niaFinaleBaseStats(state, ranks, tag);

  const clampedAuditions = state.auditions.map((a, i) =>
    clampAudition(a, i, tag, ranks),
  );
  const gains = {} as SheetScoreContext["gains"];
  for (const type of TYPE_KEYS) {
    gains[TYPE_SHEET_ROLE[type]] = {
      lessons: NIA_LESSONS.map((lesson, i) => {
        const pick = state.lessons[i];
        return pick.main === type ? lesson.value[pick.sp ? 1 : 0] : 0;
      }),
      exams: [
        ...clampedAuditions.map((a) => niaChallengeApply(a[type], challengePct)),
        niaChallengeApply(finale[type], challengePct),
      ],
    };
  }

  return {
    counts: buildCountResolver(
      manualCount,
      (label) => lessonCounts[label],
      "normal",
    ),
    gains,
    eventCounts,
  };
}

/**
 * 『初』用の sheetScore コンテキスト。
 * パラボ母数 = レッスン獲得のみ（試験の順位報酬は固定値・パラボ非適用と仮定）。
 */
export function buildHatsuScoreContext(
  state: HatsuStateLike,
  manualCount: (label: string) => number | undefined,
  eventCounts?: SheetScoreContext["eventCounts"],
): SheetScoreContext {
  const lessonCounts = typeLessonCounts(state.lessons);

  const gains = {} as SheetScoreContext["gains"];
  for (const type of TYPE_KEYS) {
    gains[TYPE_SHEET_ROLE[type]] = {
      lessons: HATSU_LESSONS.map((_, i) => {
        const pick = state.lessons[i];
        if (!pick.main) return 0;
        const g = hatsuLessonGains(i, pick.sp, pick.score);
        return pick.main === type ? g.main : g.other;
      }),
      exams: [],
    };
  }

  return {
    counts: buildCountResolver(
      manualCount,
      (label) => lessonCounts[label],
      "hatsu",
    ),
    gains,
    eventCounts,
  };
}
