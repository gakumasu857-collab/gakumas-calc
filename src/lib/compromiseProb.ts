/**
 * 妥協込みのレッスン実現確率（H.I.F.用）。
 *
 * モデル:
 * - 各レッスン日、3属性のレッスンが提示される。属性ごとに SPかどうか（その属性のSP率）と
 *   サブ属性（残り2属性から50%）が独立に決まる。
 * - プレイヤーはその日に出た3つ（＋踏まない）から一番マシなものを選ぶ。
 *   SPで出たレッスンはSPとして踏む（SPの方が獲得もスター性も上）。
 * - 候補 (メイン, サブ, SP) の「評価値低下」は、その日だけ差し替えた評価値を
 *   実際に計算して求める（他の日は今の踏み方のまま）。
 * - 合計低下の分布を日ごとの畳み込みで求め、「許容低下X以内に収まる確率」を出す。
 *
 * 計算は評価関数を約100回呼ぶ（数百ms）ため、ボタンを押したときだけ実行する。
 */
import { LESSONS } from "@/data/schedule";
import { OptimizeEngine } from "./autoOptimize";
import { buildAutoOptimizeInput } from "./buildOptimizeInput";
import type { CardFlagSets, SelectedSlot } from "./formation";
import type { useCalcResult } from "./useCalcResult";
import { TYPE_KEYS, type CalcSettings, type TypeKey } from "./useCalcSettings";
import type { LessonPick } from "./useSchedule";

type CalcResult = ReturnType<typeof useCalcResult>;

export type CompromiseOption = {
  main: TypeKey;
  sub: TypeKey;
  sp: boolean;
  /** 理想の踏み方に対する評価値低下（0=理想と同等以上） */
  delta: number;
};

export type CompromiseDay = {
  /** LESSONS のインデックス */
  index: number;
  label: string;
  ideal: LessonPick;
  /** 12候補を低下の小さい順に並べたもの */
  options: CompromiseOption[];
  /** 「踏まない」を選んだ場合の低下 */
  skipDelta: number;
};

export type CompromiseResult = {
  days: CompromiseDay[];
  /** 合計低下の累積分布（delta昇順・probは「この低下以内に収まる確率」） */
  cdf: { delta: number; prob: number }[];
  baseRating: number;
};

/** 分布の丸め幅と、これを超える低下は「失敗」とまとめる上限 */
const BUCKET = 5;
const MAX_DELTA = 2000;

/** 累積分布から「許容低下x以内」の確率を引く */
export function probUpTo(
  cdf: { delta: number; prob: number }[],
  x: number,
): number {
  let p = 0;
  for (const row of cdf) {
    if (row.delta <= x) p = row.prob;
    else break;
  }
  return p;
}

/**
 * 妥協込み実現確率の本体。HIF以外・サポカ未編成では null。
 * @param rates 属性別のSPレッスン率（useCalcResult の spLesson.rates）
 */
export function computeCompromise(
  r: CalcResult,
  flags: CardFlagSets,
  settings: CalcSettings,
  rates: Record<TypeKey, number>,
): CompromiseResult | null {
  if (r.scenario !== "hif") return null;
  const slots = r.selected.slots.filter((s): s is SelectedSlot => s !== null);
  if (slots.length === 0) return null;

  const input = buildAutoOptimizeInput(r, flags, settings);
  const engine = new OptimizeEngine(input);
  const base = engine.initialStepping();
  if (base.kind !== "hif") return null;

  const evalWith = (lessons: LessonPick[]): number => {
    const s = { ...base, lessons };
    const ectx = engine.buildEctx(s);
    const { cappedSum, members } = engine.preciseObjective(slots, ectx, true);
    return engine.fullRating(s, cappedSum, members);
  };
  const baseRating = evalWith(base.lessons);

  const days: CompromiseDay[] = [];
  base.lessons.forEach((ideal, i) => {
    if (!ideal.main) return; // 「踏まない」日は運が絡まない
    const options: CompromiseOption[] = [];
    for (const main of TYPE_KEYS) {
      for (const sub of TYPE_KEYS.filter((t) => t !== main)) {
        for (const sp of [true, false]) {
          const lessons = base.lessons.map((l, j) =>
            j === i ? { main, sub, sp } : l,
          );
          options.push({
            main,
            sub,
            sp,
            delta: Math.max(0, Math.round(baseRating - evalWith(lessons))),
          });
        }
      }
    }
    options.sort((a, b) => a.delta - b.delta);
    const skipLessons = base.lessons.map((l, j) =>
      j === i ? { ...l, main: null } : l,
    );
    days.push({
      index: i,
      label: LESSONS[i]?.label ?? `レッスン${i + 1}`,
      ideal,
      options,
      skipDelta: Math.max(0, Math.round(baseRating - evalWith(skipLessons))),
    });
  });

  // 日ごとの「その日に取れる最良の低下」の分布
  const dayDists = days.map((day) => {
    const deltaOf = (m: TypeKey, sub: TypeKey, sp: boolean) =>
      day.options.find((o) => o.main === m && o.sub === sub && o.sp === sp)
        ?.delta ?? Infinity;
    // 属性ごとの出目（サブ2択 × SP有無）
    const perAttr = TYPE_KEYS.map((m) => {
      const subs = TYPE_KEYS.filter((t) => t !== m);
      const rate = Math.min(1, Math.max(0, rates[m] ?? 0));
      return subs.flatMap((sub) => [
        { delta: deltaOf(m, sub, true), p: 0.5 * rate },
        { delta: deltaOf(m, sub, false), p: 0.5 * (1 - rate) },
      ]);
    });
    const dist = new Map<number, number>();
    for (const a of perAttr[0]) {
      for (const b of perAttr[1]) {
        for (const c of perAttr[2]) {
          const p = a.p * b.p * c.p;
          if (p <= 0) continue;
          const d = Math.min(a.delta, b.delta, c.delta, day.skipDelta);
          dist.set(d, (dist.get(d) ?? 0) + p);
        }
      }
    }
    return dist;
  });

  // 畳み込み（BUCKET単位に丸め、MAX_DELTA超は「失敗」にまとめる）
  const clampKey = (d: number) =>
    d > MAX_DELTA ? MAX_DELTA + BUCKET : Math.round(d / BUCKET) * BUCKET;
  let acc = new Map<number, number>([[0, 1]]);
  for (const dist of dayDists) {
    const next = new Map<number, number>();
    for (const [d1, p1] of acc) {
      for (const [d2, p2] of dist) {
        const key = clampKey(d1 + d2);
        next.set(key, (next.get(key) ?? 0) + p1 * p2);
      }
    }
    acc = next;
  }
  const sorted = [...acc.entries()].sort((a, b) => a[0] - b[0]);
  const cdf: { delta: number; prob: number }[] = [];
  let cum = 0;
  for (const [delta, p] of sorted) {
    cum += p;
    cdf.push({ delta, prob: cum });
  }

  return { days, cdf, baseRating };
}
