/**
 * sheetScore用の計算コンテキストを、各ページのフック状態から組み立てる純関数群。
 *
 * ロール（メイン1/メイン2/サブ）はスプシ由来の内部表現としてだけ残っていて、
 * タイプとの対応は固定（Vo=メイン1、Da=メイン2、Vi=サブ）。
 * アビ性能表はロール間で完全対称なので、この固定対応で
 * 「サポカのレッスン系アビリティは自タイプの踏み回数を参照する」という
 * 実際の仕様と数値的に等価になる。
 */
import { abilityKeyFromLabel, type AbilityName } from "@/data/constants";
import { LESSONS } from "@/data/schedule";
import type { ParaboAssign } from "./memoryTotals";
import {
  buildCountResolver,
  SHEET_ROLE_LABELS,
  type SheetRole,
  type SheetScoreContext,
} from "./sheetScore";
import {
  computeScheduleGains,
  type ExamScores,
  type LessonPick,
} from "./useSchedule";
import { TYPE_KEYS, type TypeKey } from "./useCalcSettings";

/** タイプ→シート内部ロールの固定対応（Vo=メイン1 / Da=メイン2 / Vi=サブ） */
export const TYPE_SHEET_ROLE: Record<TypeKey, SheetRole> = {
  vocal: "main1",
  dance: "main2",
  visual: "sub",
};

/** タイプの回数キーのラベル（例: vocal → "メイン1"。スプシの内部名） */
export function typeCountLabel(type: TypeKey): string {
  return SHEET_ROLE_LABELS[TYPE_SHEET_ROLE[type]];
}

/**
 * タイプ別のレッスン回数キー（合計/SP/通常）を集める。
 * サブ枠で踏んだレッスンはレッスン系アビリティの発動に数えない
 * （ステ上昇・パラボ母数には含まれる。数えるのはメイン踏みのみ）。
 */
export function typeLessonCounts(
  lessons: { main: TypeKey | null; sp: boolean }[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const type of TYPE_KEYS) {
    const label = typeCountLabel(type);
    let total = 0;
    let sp = 0;
    for (const pick of lessons) {
      if (pick.main !== type) continue;
      total++;
      if (pick.sp) sp++;
    }
    counts[`${label}レッスン`] = total;
    counts[`${label}SPレッスン`] = sp;
    counts[`${label}通常レッスン`] = total - sp;
  }
  return counts;
}

/**
 * パラボ母数（%が掛かるレッスン・試験の獲得量）が大きい順にタイプを並べ、
 * ロール追従パラボメモリーの割当（上位2タイプ=%、残り=固定値）を決める。
 */
export function paraboAssignFromGains(
  gains: SheetScoreContext["gains"],
): ParaboAssign {
  const ranked = TYPE_KEYS.map((type) => {
    const g = gains[TYPE_SHEET_ROLE[type]];
    const sum =
      g.lessons.reduce((a, b) => a + b, 0) + g.exams.reduce((a, b) => a + b, 0);
    return { type, sum };
  }).sort((a, b) => b.sum - a.sum); // 同点はTYPE_KEYS順（安定ソート）
  return { mains: [ranked[0].type, ranked[1].type], sub: ranked[2].type };
}

export type ScheduleStateLike = {
  lessons: LessonPick[];
  classTypes: TypeKey[];
  examScores: ExamScores[];
};

/**
 * スプシ準拠の計算コンテキストを組み立てる（H.I.F.用）。
 * - タイプ別レッスン回数: レッスンページの選択から集計（メイン踏みのみ）
 * - 手動アビリティ回数: 発動回数ページの参照セット（manualCount経由）
 * - パラボ母数: タイプごとのレッスン獲得＋試験獲得
 * - eventCounts: カードごとの前イベ・後イベ発動回数の手動指定（サポカ設定ページ）
 */
export function buildSheetScoreContext(
  schedule: ScheduleStateLike,
  manualCount: (label: string) => number | undefined,
  eventCounts?: SheetScoreContext["eventCounts"],
): SheetScoreContext {
  const lessonCounts = typeLessonCounts(schedule.lessons);

  const { examRows } = computeScheduleGains(schedule);
  const gains = {} as SheetScoreContext["gains"];
  for (const type of TYPE_KEYS) {
    const lessons = schedule.lessons.map((pick, i) => {
      if (!pick.main) return 0; // 踏まないレッスン
      const spIndex = pick.sp ? 1 : 0;
      if (pick.main === type) return LESSONS[i].main[spIndex];
      if (pick.sub === type) return LESSONS[i].sub[spIndex];
      return 0;
    });
    const exams = examRows.map((row) => row.dist[type]);
    gains[TYPE_SHEET_ROLE[type]] = { lessons, exams };
  }

  return {
    counts: buildCountResolver(
      manualCount,
      (label) => lessonCounts[label],
      "hif",
    ),
    gains,
    eventCounts,
  };
}

/** 発動回数セットのgetCountを、シートの日本語ラベルで引ける形に包む */
export function manualCountFromSet(
  getCount: ((key: AbilityName) => number) | null,
): (label: string) => number | undefined {
  return (label) => {
    if (!getCount) return undefined;
    const key = abilityKeyFromLabel(label);
    if (!key) return undefined;
    return getCount(key);
  };
}

