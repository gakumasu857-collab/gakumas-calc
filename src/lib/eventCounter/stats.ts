/**
 * 記録した育成データから統計を出す（Python版 gakumas_event_counter/stats.py の移植）。
 *
 * 発生率は「1回の育成で1回でも起きる確率」の推定値。
 * 中断した育成は「そのターンまでは見ていた」データとして扱い、
 * Kaplan-Meier 法（打ち切りデータの生存時間解析）で推定する。
 * 完走した育成だけなら、ふつうの「起きた育成数 ÷ 育成数」と同じ値になる。
 */
import {
  KINDS_ORDER,
  POST,
  PRE,
  STATUS,
  type EventKind,
  type ProduceRun,
  type Stage,
} from "./tracker";

export type KindSlot = {
  count: number;
  runsWith: number;
  turns: number[];
  rate: number;
  avgPerRun: number;
  avgTurn: number | null;
};

export type Summary = {
  runs: number;
  completed: number;
  avgTurns: number;
  maxTurns: number;
  perCard: ({ card: number } & Record<EventKind, KindSlot>)[];
  perKind: Record<EventKind, KindSlot>;
};

const blank = (): KindSlot => ({
  count: 0,
  runsWith: 0,
  turns: [],
  rate: 0,
  avgPerRun: 0,
  avgTurn: null,
});

/** 統計に使う育成だけを選ぶ */
export function selectRuns(
  runs: ProduceRun[],
  includeIncomplete = true,
  stage: Stage | null = null,
): ProduceRun[] {
  return runs.filter((run) => {
    if (!includeIncomplete && !run.completed) return false;
    if (stage !== null && run.stage !== stage) return false;
    return true;
  });
}

/** 育成ごとの「初めて起きたターン」（起きていなければ null）のリスト */
function firstTurns(
  runs: ProduceRun[],
  card: number | null,
  kind: EventKind | null,
): (number | null)[] {
  return runs.map((run) => {
    let earliest: number | null = null;
    for (const event of run.events) {
      if (!(KINDS_ORDER as string[]).includes(event.kind)) continue;
      if (kind !== null && event.kind !== kind) continue;
      if (card !== null && event.card !== card) continue;
      const turn = event.turn || 0;
      if (earliest === null || turn < earliest) earliest = turn;
    }
    return earliest;
  });
}

/**
 * 「1回の育成で1回でも起きる確率」の推定値（0〜1）。
 * 途中でやめた育成は、見ていたターンまでの情報だけを使う（打ち切りデータ）。
 */
export function estimateRate(
  runs: ProduceRun[],
  card: number | null = null,
  kind: EventKind | null = null,
): number {
  if (runs.length === 0) return 0;
  const observed = runs.map((run) => run.turns || 0);
  const firsts = firstTurns(runs, card, kind);
  const turnsWithEvents = [
    ...new Set(firsts.filter((t): t is number => t !== null)),
  ].sort((a, b) => a - b);
  let survive = 1.0;
  for (const t of turnsWithEvents) {
    // そのターンを「見ていて、まだ起きていない」育成の数
    let atRisk = 0;
    for (let i = 0; i < firsts.length; i++) {
      const first = firsts[i];
      if ((first === null || first >= t) && Math.max(observed[i], first ?? 0) >= t)
        atRisk++;
    }
    const happened = firsts.filter((f) => f === t).length;
    if (atRisk > 0) survive *= 1.0 - happened / atRisk;
  }
  return 1.0 - survive;
}

/** サポカごと・種類ごとの集計 */
export function summarize(runs: ProduceRun[], cardCount = 6): Summary {
  const totalRuns = runs.length;
  const perCard = Array.from({ length: cardCount }, (_, i) => ({
    card: i,
    [PRE]: blank(),
    [POST]: blank(),
    [STATUS]: blank(),
  })) as Summary["perCard"];
  const perKind = {
    [PRE]: blank(),
    [POST]: blank(),
    [STATUS]: blank(),
  } as Summary["perKind"];

  for (const run of runs) {
    const seenCardKind = new Set<string>();
    const seenKind = new Set<string>();
    for (const event of run.events) {
      const kind = event.kind as EventKind;
      if (!(KINDS_ORDER as string[]).includes(kind)) continue; // 判定中は数えない
      const turn = event.turn || 0;
      perKind[kind].count++;
      perKind[kind].turns.push(turn);
      if (!seenKind.has(kind)) {
        perKind[kind].runsWith++;
        seenKind.add(kind);
      }
      const card = event.card;
      if (card === null || card < 0 || card >= cardCount) continue;
      const slot = perCard[card][kind];
      slot.count++;
      slot.turns.push(turn);
      const key = `${card}:${kind}`;
      if (!seenCardKind.has(key)) {
        slot.runsWith++;
        seenCardKind.add(key);
      }
    }
  }

  const finish = (slot: KindSlot, card: number | null, kind: EventKind) => {
    slot.rate = estimateRate(runs, card, kind);
    slot.avgPerRun = totalRuns ? slot.count / totalRuns : 0;
    const turns = slot.turns.filter((t) => t > 0);
    slot.avgTurn = turns.length
      ? turns.reduce((a, b) => a + b, 0) / turns.length
      : null;
  };
  for (const entry of perCard) {
    for (const kind of KINDS_ORDER) finish(entry[kind], entry.card, kind);
  }
  for (const kind of KINDS_ORDER) finish(perKind[kind], null, kind);

  const turnCounts = runs.map((run) => run.turns || 0);
  return {
    runs: totalRuns,
    completed: runs.filter((run) => run.completed).length,
    avgTurns: turnCounts.length
      ? turnCounts.reduce((a, b) => a + b, 0) / turnCounts.length
      : 0,
    maxTurns: turnCounts.length ? Math.max(...turnCounts) : 0,
    perCard,
    perKind,
  };
}

/** 集計結果を、表計算ソフトで開けるCSV行のリストにする */
export function toCsvRows(
  summary: Summary,
  cardNames?: (string | null)[],
): string[][] {
  const rows: string[][] = [
    ["サポカ", "種類", "回数", "起きた育成数", "発生率", "1育成平均", "平均日目"],
  ];
  const labels: Record<EventKind, string> = {
    [PRE]: "前イベ",
    [POST]: "後イベ",
    [STATUS]: "ステイベ",
  };
  const rowOf = (name: string, kind: EventKind, slot: KindSlot) => [
    name,
    labels[kind],
    String(slot.count),
    String(slot.runsWith),
    slot.rate.toFixed(3),
    slot.avgPerRun.toFixed(3),
    slot.avgTurn === null ? "" : slot.avgTurn.toFixed(2),
  ];
  for (const entry of summary.perCard) {
    const name = cardNames?.[entry.card] || `サポカ${entry.card + 1}`;
    for (const kind of KINDS_ORDER) rows.push(rowOf(name, kind, entry[kind]));
  }
  for (const kind of KINDS_ORDER) {
    rows.push(rowOf("(全体)", kind, summary.perKind[kind]));
  }
  return rows;
}
