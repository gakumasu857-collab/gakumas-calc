/**
 * 「踏み方」（レッスン・授業・選抜スコア・営業）の探索用ドメイン。
 *
 * 踏み方は「軸（＝1箇所）」の集まりとして表す。レッスン1回・選抜1つ・授業1つが
 * それぞれ1軸で、軸ごとに「今と違う値にした候補」を列挙できる（steppingAxes）。
 * 山登りは全軸の候補を総当たりする（乱数は使わない）。
 * どちらも同じ列挙を使うので、両者が必ず同じ近傍を見ることが保証される。
 */
import { EXAMS, examStarCapScore } from "../../data/schedule";
import type { TypeKey } from "../useCalcSettings";
import { TYPE_KEYS } from "../useCalcSettings";
import type { HatsuLessonPick } from "../useHatsuSchedule";
import type { NiaLessonPick, NiaSalePick } from "../useNiaSchedule";
import type { ExamScores, LessonPick } from "../useSchedule";

/** シナリオ別の踏み方の探索状態 */
export type Stepping =
  | {
      kind: "hif";
      lessons: LessonPick[];
      classTypes: TypeKey[];
      /** 選抜試験のタイプ別スコア（分配も最適化対象）。 */
      examScores: ExamScores[];
      /**
       * この候補での選抜ごとの上昇ステの直接入力（null／省略＝スコアから分配）。
       * ステ入力の選抜も探索で動かしてよい。examScores[i] を置き換えた候補は
       * 必ず examStats[i] を null に戻す（withExamScores / withAllExamScores を使う）
       */
      examStats?: (ExamScores | null)[];
    }
  | { kind: "nia"; lessons: NiaLessonPick[]; sales: NiaSalePick[] }
  | { kind: "hatsu"; lessons: HatsuLessonPick[]; classTypes: TypeKey[] };

type HifStepping = Extract<Stepping, { kind: "hif" }>;
type NiaStepping = Extract<Stepping, { kind: "nia" }>;
type HatsuStepping = Extract<Stepping, { kind: "hatsu" }>;

// ---- 選抜スコアの分配 ----

/**
 * 各選抜試験でスター性がちょうど上限に達する合計スコア（1次から順）。
 * ステ上昇はスコアの比率だけで決まり、スター性は合計だけで決まるので、
 * この合計を整数比で分配すればスター性は常に最大のまま比率だけ動かせる。
 * 値は schedule.ts のスター性の表（examStarCapScore: 14,001／146,365／390,910）から取る
 * （以前はここに古い定数 14000／145455／405000 を持っていて、探索がその値を置いていた）。
 */
const EXAM_STAR_TOTALS = EXAMS.map((_, i) => examStarCapScore(i));

/**
 * 選抜スコアの分配候補（整数比）。単タイプ全振り・2タイプの各比率・均等まで
 * 網羅し、各選抜でこの中から評価値が最大になる分配を選ぶ。
 */
export const EXAM_RATIOS: [number, number, number][] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 1, 0],
  [1, 0, 1],
  [0, 1, 1],
  [2, 1, 0],
  [1, 2, 0],
  [2, 0, 1],
  [1, 0, 2],
  [0, 2, 1],
  [0, 1, 2],
  [3, 1, 0],
  [1, 3, 0],
  [3, 0, 1],
  [1, 0, 3],
  [0, 3, 1],
  [0, 1, 3],
  [1, 1, 1],
];

/**
 * 整数比 → 選抜試験iのタイプ別スコア。
 * スター上限ちょうどの合計スコアを比率どおりに分配する（最大剰余法で合計を厳密に一致）。
 */
export function examScoresFromRatio(
  i: number,
  ratio: [number, number, number],
): ExamScores {
  const total = EXAM_STAR_TOTALS[i] ?? 100000;
  const sum = ratio[0] + ratio[1] + ratio[2];
  const raw = ratio.map((w) => (w * total) / sum);
  const parts = raw.map(Math.floor);
  let rem = total - parts[0] - parts[1] - parts[2];
  const order = raw
    .map((x, j) => ({ j, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; rem > 0; k++, rem--) parts[order[k % 3].j]++;
  return { vocal: parts[0], dance: parts[1], visual: parts[2] };
}

export const sameExamScores = (a: ExamScores, b: ExamScores) =>
  a.vocal === b.vocal && a.dance === b.dance && a.visual === b.visual;

/** 極振り（1タイプに全部）の比率。選抜を極振りだけで探索するときの候補 */
export const EXAM_RATIOS_SINGLE: [number, number, number][] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** タイプ → そのタイプへの極振りの比率 */
export const singleRatioOf = (type: TypeKey): [number, number, number] => [
  type === "vocal" ? 1 : 0,
  type === "dance" ? 1 : 0,
  type === "visual" ? 1 : 0,
];

/** 選抜の配分が極振り（点が入っているのが1タイプだけ）か */
export function isSingleTypeExam(scores: ExamScores): boolean {
  return TYPE_KEYS.filter((t) => scores[t] > 0).length === 1;
}

/** 選抜が全部「スコア入力の極振り」か（「極振りで探索する」設定を今の踏み方が満たしているか） */
export function examsAllSingle(
  examScores: readonly ExamScores[],
  examStats?: readonly (ExamScores | null)[],
): boolean {
  return examScores.every((e, i) => examStats?.[i] == null && isSingleTypeExam(e));
}

/**
 * 仕上げ用の細かい分配候補（整数比 a+b+c ≤ 7 の全組・既約のみ）。
 * 広域探索では EXAM_RATIOS（粗い格子）で足り、上限3200ちょうどへ寄せる
 * 「あと数十点」の詰めはこちらで行う（refineExams）。約60通り。
 */
export const EXAM_RATIOS_FINE: [number, number, number][] = (() => {
  const gcd2 = (a: number, b: number): number => (b === 0 ? a : gcd2(b, a % b));
  const seen = new Set<string>();
  const out: [number, number, number][] = [];
  for (let a = 0; a <= 7; a++) {
    for (let b = 0; b <= 7 - a; b++) {
      for (let c = 0; c <= 7 - a - b; c++) {
        if (a + b + c === 0) continue;
        const g = gcd2(a, gcd2(b, c));
        const key = `${a / g},${b / g},${c / g}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push([a / g, b / g, c / g]);
      }
    }
  }
  return out;
})();

/** 選抜スコアを3タイプ均等に配る（探索の初期値。合計はスター上限ちょうど） */
export function examScoresUniform(i: number): ExamScores {
  return examScoresFromRatio(i, [1, 1, 1]);
}

// ---- 小道具 ----

const nextType = (type: TypeKey): TypeKey =>
  TYPE_KEYS[(TYPE_KEYS.indexOf(type) + 1) % TYPE_KEYS.length];

/** 配列の i 番目だけ差し替えた新しい配列 */
const replaceAt = <T>(arr: readonly T[], i: number, v: T): T[] =>
  arr.map((x, j) => (j === i ? v : x));

/**
 * 選抜i のスコアだけ置き換えた踏み方。置き換えた選抜はスコア入力に戻す
 * （ステ直接入力のままだとスコアを変えてもステが変わらず、比べる意味がないため）
 */
export function withExamScores(
  c: HifStepping,
  i: number,
  scores: ExamScores,
): HifStepping {
  return {
    ...c,
    examScores: replaceAt(c.examScores, i, scores),
    examStats: c.examStats && replaceAt(c.examStats, i, null),
  };
}

/** 全選抜のスコアを置き換えた踏み方（全部スコア入力に戻す） */
export function withAllExamScores(
  c: HifStepping,
  examScores: ExamScores[],
): HifStepping {
  return { ...c, examScores, examStats: undefined };
}

const otherTypes = (t: TypeKey | null | undefined): TypeKey[] =>
  TYPE_KEYS.filter((x) => x !== t);

/** レッスンの (メイン, サブ) の全組（メイン≠サブ） */
const MAIN_SUB_PAIRS: [TypeKey, TypeKey][] = TYPE_KEYS.flatMap((main) =>
  otherTypes(main).map((sub): [TypeKey, TypeKey] => [main, sub]),
);

/** n個を3タイプへ割り振る全分割 [nVo, nDa, nVi] */
function partitions3(n: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let a = 0; a <= n; a++) {
    for (let b = 0; b <= n - a; b++) {
      out.push([a, b, n - a - b]);
    }
  }
  return out;
}

/** 分割 [nVo,nDa,nVi] → 各レッスンのメインタイプ列（先頭からVo→Da→Viの順に詰める） */
function typesFromPartition(part: [number, number, number]): TypeKey[] {
  const out: TypeKey[] = [];
  TYPE_KEYS.forEach((type, i) => {
    for (let k = 0; k < part[i]; k++) out.push(type);
  });
  return out;
}

// ---- 軸（＝踏み方の1箇所） ----

/**
 * 踏み方の1箇所を表す軸。
 * alternatives は「その箇所だけを今と違う値にした踏み方」を列挙する（今の値は含まない）。
 */
export type SteppingAxis = {
  alternatives: (cur: Stepping) => Stepping[];
};

/** 同じ種類の軸を index ごとに作る小道具 */
function axesOver(
  count: number,
  alternatives: (cur: Stepping, i: number) => Stepping[],
): SteppingAxis[] {
  return Array.from({ length: count }, (_, i) => ({
    alternatives: (cur: Stepping) => alternatives(cur, i),
  }));
}

/**
 * 踏み方の全軸。山登りの近傍はこれから作る。
 * @param examRatios 選抜の軸で試す比率（既定は EXAM_RATIOS。空なら選抜は動かさない＝点数配分を固定した探索。
 *   極振りだけの探索なら EXAM_RATIOS_SINGLE）。軸の並び（レッスン → 選抜 → 授業）は変わらない
 */
export function steppingAxes(
  s: Stepping,
  examRatios: readonly [number, number, number][] = EXAM_RATIOS,
): SteppingAxis[] {
  if (s.kind === "hif") {
    return [
      // レッスン: メイン×サブの組を入れ替える
      ...axesOver(s.lessons.length, (cur, i) => {
        const c = cur as HifStepping;
        const l = c.lessons[i];
        return MAIN_SUB_PAIRS.filter(
          ([main, sub]) => main !== l.main || sub !== l.sub,
        ).map(([main, sub]) => ({
          ...c,
          lessons: replaceAt(c.lessons, i, { ...l, main, sub }),
        }));
      }),
      // 選抜: スコアの分配比を入れ替える（ステ入力の選抜も動かし、スコア入力に戻す。
      // ステ入力中は同じスコアでもステが変わるので、同値の比率も候補に残す）
      ...axesOver(s.examScores.length, (cur, i) => {
        const c = cur as HifStepping;
        const manual = c.examStats?.[i] != null;
        return examRatios
          .map((r) => examScoresFromRatio(i, r))
          .filter((e) => manual || !sameExamScores(c.examScores[i], e))
          .map((e) => withExamScores(c, i, e));
      }),
      // 授業: タイプを入れ替える
      ...axesOver(s.classTypes.length, (cur, i) => {
        const c = cur as HifStepping;
        return otherTypes(c.classTypes[i]).map((t) => ({
          ...c,
          classTypes: replaceAt(c.classTypes, i, t),
        }));
      }),
    ];
  }
  if (s.kind === "nia") {
    return [
      ...axesOver(s.lessons.length, (cur, i) => {
        const c = cur as NiaStepping;
        return otherTypes(c.lessons[i].main ?? undefined).map((main) => ({
          ...c,
          lessons: replaceAt(c.lessons, i, { ...c.lessons[i], main }),
        }));
      }),
      ...axesOver(s.sales.length, (cur, i) => {
        const c = cur as NiaStepping;
        return otherTypes(c.sales[i].type).map((type) => ({
          ...c,
          sales: replaceAt(c.sales, i, { ...c.sales[i], type }),
        }));
      }),
    ];
  }
  return [
    ...axesOver(s.lessons.length, (cur, i) => {
      const c = cur as HatsuStepping;
      return otherTypes(c.lessons[i].main ?? undefined).map((main) => ({
        ...c,
        lessons: replaceAt(c.lessons, i, { ...c.lessons[i], main }),
      }));
    }),
    ...axesOver(s.classTypes.length, (cur, i) => {
      const c = cur as HatsuStepping;
      return otherTypes(c.classTypes[i]).map((t) => ({
        ...c,
        classTypes: replaceAt(c.classTypes, i, t),
      }));
    }),
  ];
}

// ---- 起点・シード ----

/**
 * レッスンのメインを lessonType、授業/営業を secondType に寄せた一様な踏み方。
 * （sp/パーフェクト等の他の要素は base のまま）
 */
export function uniformStepping(
  base: Stepping,
  lessonType: TypeKey,
  secondType: TypeKey,
): Stepping {
  if (base.kind === "hif") {
    return {
      // 選抜スコアは初期状態に依存しない一様配分から始める（ステ入力の選抜もスコア入力に戻す）
      ...withAllExamScores(
        base,
        base.examScores.map((_, i) => examScoresUniform(i)),
      ),
      lessons: base.lessons.map((l) => ({
        ...l,
        main: lessonType,
        sub: nextType(lessonType),
      })),
      classTypes: base.classTypes.map(() => secondType),
    };
  }
  if (base.kind === "nia") {
    return {
      ...base,
      lessons: base.lessons.map((l) => ({ ...l, main: lessonType })),
      sales: base.sales.map((s) => ({ ...s, type: secondType })),
    };
  }
  return {
    ...base,
    lessons: base.lessons.map((l) => ({ ...l, main: lessonType })),
    classTypes: base.classTypes.map(() => secondType),
  };
}

/**
 * 踏み方のシード一覧。
 * 現在の踏み方＋一様踏み全パターン＋レッスンのタイプ別枚数の全分割。
 * 分割まで入れることで「どのタイプに何回振るか」を初期値に依らず一通り見る。
 */
export function buildSeeds(current: Stepping): Stepping[] {
  const seeds: Stepping[] = [current];
  const lessonPartitionSeeds = (toSeed: (mains: TypeKey[]) => Stepping) =>
    partitions3(current.lessons.length).forEach((part) =>
      seeds.push(toSeed(typesFromPartition(part))),
    );

  if (current.kind === "hif") {
    // 一様: メイン×サブの全6パターン
    for (const [main, sub] of MAIN_SUB_PAIRS) {
      seeds.push({
        ...current,
        lessons: current.lessons.map((l) => ({ ...l, main, sub })),
      });
    }
    // タイプ別メイン枚数の全分割（45通り）。サブは隣のタイプで仮置き（山登りで直す）
    lessonPartitionSeeds((mains) => ({
      ...current,
      lessons: current.lessons.map((l, i) => ({
        ...l,
        main: mains[i],
        sub: nextType(mains[i]),
      })),
    }));
    return seeds;
  }

  if (current.kind === "nia") {
    // 一様: レッスン×営業の全9パターン
    for (const lessonType of TYPE_KEYS) {
      for (const saleType of TYPE_KEYS) {
        seeds.push(uniformStepping(current, lessonType, saleType));
      }
    }
    // レッスンのタイプ別枚数の全分割（営業は現状のまま）
    lessonPartitionSeeds((mains) => ({
      ...current,
      lessons: current.lessons.map((l, i) => ({ ...l, main: mains[i] })),
    }));
    return seeds;
  }

  // 初: レッスン×授業の全9パターン
  for (const lessonType of TYPE_KEYS) {
    for (const classType of TYPE_KEYS) {
      seeds.push(uniformStepping(current, lessonType, classType));
    }
  }
  lessonPartitionSeeds((mains) => ({
    ...current,
    lessons: current.lessons.map((l, i) => ({ ...l, main: mains[i] })),
  }));
  return seeds;
}
