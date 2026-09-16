/**
 * 各シナリオの育成スケジュール（何日目/何週目に何があるか）。
 * 出典: ユーザー提供のゲーム内スケジュール（2026-08）。
 *
 * 用途:
 * - スケジュール表の表示（数値表・発動回数モーダル・プロデュース設定ページ）
 * - お出かけ・相談・差し入れ等の「シナリオ別の最大回数」の導出（calendarEventCounts）
 * - 週（日）ごとに1つ選ぶ「スケジュールの選択」（scheduleChoiceRows ほか。プロデュースの回数と差し入れのPポイントになる）
 *
 * 既存マスタとの整合（レッスン・授業の日付）は schedule.ts / scenarios.ts と一致済み。
 */
import type { AbilityName } from "./constants";
import type { ScenarioKey } from "./scenarios";

/** スケジュール上の行動の種類 */
export type CalendarEvent =
  | "lesson" // レッスン（Vo/Da/Viの3択が出る日）
  | "starLesson" // スター性重視の公開レッスン（H.I.Fの☆）
  | "class" // 授業
  | "sale" // 営業（N.I.A）
  | "date" // おでかけ
  | "meeting" // 相談
  | "supply" // 活動支給・差し入れ
  | "lecture"; // 特別指導

export type CalendarRow = {
  /** 週/日番号（"当日"などの文字も可） */
  label: string;
  /** その日にある行動（試験の日は空配列） */
  events: CalendarEvent[];
  /** 試験・オーディション名（あれば。行動と排他） */
  exam?: string;
};

export type ScenarioCalendar = {
  /** 行番号の単位（H.I.F=日 / N.I.A・初=週） */
  unit: "週" | "日";
  /** セクション（H.I.Fは選抜/本戦の2部構成。他は1つ） */
  sections: { title: string | null; rows: CalendarRow[] }[];
};

const row = (
  label: string | number,
  events: CalendarEvent[],
  exam?: string,
): CalendarRow => ({ label: String(label), events, ...(exam ? { exam } : {}) });

export const SCENARIO_CALENDARS: Record<ScenarioKey, ScenarioCalendar> = {
  hif: {
    unit: "日",
    sections: [
      {
        title: "選抜",
        rows: [
          row(1, ["meeting", "supply", "lecture"]),
          row(2, ["starLesson"]),
          row(3, ["class"]),
          row(4, ["lesson"]),
          row(5, ["date", "meeting"]),
          row(6, ["class"]),
          row(7, [], "選抜試験1"),
          row(8, ["date", "supply"]),
          row(9, ["starLesson"]),
          row(10, ["class"]),
          row(11, ["lesson"]),
          row(12, ["meeting", "lecture"]),
          row(13, [], "選抜試験2"),
          row(14, ["date", "supply"]),
          row(15, ["starLesson"]),
          row(16, ["date", "meeting", "supply"]),
          row(17, ["class"]),
          row(18, ["lesson"]),
          row(19, ["meeting", "lecture"]),
          row(20, [], "選抜試験3"),
        ],
      },
      {
        title: "本戦",
        rows: [
          row(1, ["class"]),
          row(2, ["starLesson"]),
          row(3, ["date", "supply"]),
          row(4, ["class"]),
          row(5, ["lesson"]),
          row(6, ["meeting"]),
          row("当日", [], "ラウンド1 → インターバル → ラウンド2"),
        ],
      },
    ],
  },
  niaMaster: {
    unit: "週",
    sections: [
      {
        title: null,
        rows: [
          row(1, ["lesson"]),
          row(2, ["sale"]),
          row(3, ["date", "supply"]),
          row(4, ["lesson"]),
          row(5, ["sale"]),
          row(6, ["date", "meeting"]),
          row(7, ["sale"]),
          row(8, ["lecture"]),
          row(9, [], "1次オーディション"),
          row(10, ["date", "supply"]),
          row(11, ["lesson"]),
          row(12, ["sale"]),
          row(13, ["date", "meeting", "supply"]),
          row(14, ["lesson"]),
          row(15, ["sale"]),
          row(16, ["lecture"]),
          row(17, [], "2次オーディション"),
          row(18, ["date", "supply"]),
          row(19, ["lesson"]),
          row(20, ["sale"]),
          row(21, ["meeting", "supply", "lecture"]),
          row(22, ["lesson"]),
          row(23, ["sale"]),
          row(24, ["lesson"]),
          row(25, ["date", "meeting", "lecture"]),
          row(26, [], "最終オーディション"),
        ],
      },
    ],
  },
  hatsuLegend: {
    unit: "週",
    sections: [
      {
        title: null,
        rows: [
          row(1, ["class"]),
          row(2, ["class"]),
          row(3, ["date", "supply"]),
          row(4, ["lesson"]),
          row(5, ["date", "meeting", "supply"]),
          row(6, ["class"]),
          row(7, ["lesson"]),
          row(8, ["meeting"]),
          row(9, ["lecture"]),
          row(10, [], "中間試験"),
          row(11, ["date", "supply"]),
          row(12, ["lesson"]),
          row(13, ["date", "meeting", "supply"]),
          row(14, ["lesson"]),
          row(15, ["class"]),
          row(16, ["lesson"]),
          row(17, ["meeting", "lecture"]),
          row(18, [], "最終試験"),
        ],
      },
    ],
  },
};

/** 行動の表示ラベル */
export const CALENDAR_EVENT_LABELS: Record<CalendarEvent, string> = {
  lesson: "レッスン",
  starLesson: "☆レッスン",
  class: "授業",
  sale: "営業",
  date: "おでかけ",
  meeting: "相談",
  supply: "活動支給・差し入れ",
  lecture: "特別指導",
};

/** シナリオ内の行動別回数（試験は exam の行数）。スケジュール表から機械的に数える */
export function calendarEventCounts(
  scenario: ScenarioKey,
): Record<CalendarEvent | "exam", number> {
  const counts: Record<CalendarEvent | "exam", number> = {
    lesson: 0,
    starLesson: 0,
    class: 0,
    sale: 0,
    date: 0,
    meeting: 0,
    supply: 0,
    lecture: 0,
    exam: 0,
  };
  for (const section of SCENARIO_CALENDARS[scenario].sections) {
    for (const r of section.rows) {
      if (r.exam) counts.exam++;
      for (const e of r.events) counts[e]++;
    }
  }
  return counts;
}

// ============================================================
// スケジュールの選択（週・日ごとに1つだけ選ぶ行動）
// ============================================================

/** 週（日）ごとに1つだけ選ぶ行動（レッスン・☆レッスン・授業・営業・試験は選択に含めない） */
export type ChoiceEvent = "date" | "meeting" | "supply" | "lecture";
export const CHOICE_EVENTS: readonly ChoiceEvent[] = ["date", "meeting", "supply", "lecture"];

export type ChoiceRow = {
  /** 行の識別子（H.I.Fは選抜と本戦で日番号が重なるのでセクション番号を付ける） */
  id: string;
  sectionIndex: number;
  sectionTitle: string | null;
  label: string;
  /** 選べる行動（1〜3つ） */
  options: ChoiceEvent[];
  /** この週（日）に差し入れを選んだときのPポイント */
  supplyP: number;
};

/** 行id → 選んだ行動（null＝何も選ばない） */
export type ScheduleChoices = Record<string, ChoiceEvent | null>;

/** 画面での呼び名（H.I.F・N.I.Aは「差し入れ」、初レジェンドは「活動支給」。オーナー指定 2026-09-16） */
export function supplyLabel(scenario: ScenarioKey): string {
  return scenario === "hatsuLegend" ? "活動支給" : "差し入れ";
}

/**
 * 差し入れ（活動支給）1回のPポイント（オーナー提供 2026-09-16）。
 * H.I.F 80 ／ 初レジェンド 180 ／ N.I.A は18週目から90・それより前は80に、ボーナス+30を足した値（110／120）。
 */
export function supplyPOf(scenario: ScenarioKey, label: string): number {
  if (scenario === "hatsuLegend") return 180;
  if (scenario === "niaMaster") return (Number(label) >= 18 ? 90 : 80) + 30;
  return 80;
}

const choiceRowsCache = new Map<ScenarioKey, ChoiceRow[]>();

/** 選択のある週（日）の一覧（選べる行動が1つもない週は含めない） */
export function scheduleChoiceRows(scenario: ScenarioKey): ChoiceRow[] {
  const hit = choiceRowsCache.get(scenario);
  if (hit) return hit;
  const out: ChoiceRow[] = [];
  SCENARIO_CALENDARS[scenario].sections.forEach((section, si) => {
    for (const r of section.rows) {
      const options = r.events.filter((e): e is ChoiceEvent =>
        (CHOICE_EVENTS as readonly string[]).includes(e),
      );
      if (options.length === 0) continue;
      out.push({
        id: `${si}-${r.label}`,
        sectionIndex: si,
        sectionTitle: section.title,
        label: r.label,
        options,
        supplyP: supplyPOf(scenario, r.label),
      });
    }
  });
  choiceRowsCache.set(scenario, out);
  return out;
}

/** 選択から行動ごとの回数 */
export function countsFromChoices(
  scenario: ScenarioKey,
  choices: ScheduleChoices,
): Record<ChoiceEvent, number> {
  const counts: Record<ChoiceEvent, number> = { date: 0, meeting: 0, supply: 0, lecture: 0 };
  for (const row of scheduleChoiceRows(scenario)) {
    const ev = choices[row.id];
    if (ev && row.options.includes(ev)) counts[ev]++;
  }
  return counts;
}

/** 選んだ差し入れ（活動支給）のPポイント（合計とセクション別。H.I.Fは選抜・本戦） */
export function supplyPFromChoices(
  scenario: ScenarioKey,
  choices: ScheduleChoices,
): { total: number; bySection: number[] } {
  const bySection = SCENARIO_CALENDARS[scenario].sections.map(() => 0);
  for (const row of scheduleChoiceRows(scenario)) {
    if (choices[row.id] === "supply" && row.options.includes("supply")) {
      bySection[row.sectionIndex] += row.supplyP;
    }
  }
  return { total: bySection.reduce((a, b) => a + b, 0), bySection };
}

/** 選択で決まるアビリティ（プロデュースの回数に書き戻す7つ） */
export const CHOICE_ABILITY_KEYS = [
  "date",
  "meeting",
  "supply",
  "extra_lecture_ut3",
  "date_ut2",
  "meeting_ut2",
  "supply_ut2",
] as const satisfies readonly AbilityName[];
export type ChoiceAbilityKey = (typeof CHOICE_ABILITY_KEYS)[number];

export function isChoiceAbilityKey(key: string): key is ChoiceAbilityKey {
  return (CHOICE_ABILITY_KEYS as readonly string[]).includes(key);
}

/** 選択 → アビリティの回数（「〜(N回まで)」は上限で頭打ち） */
export function abilityCountsFromChoices(
  scenario: ScenarioKey,
  choices: ScheduleChoices,
): Record<ChoiceAbilityKey, number> {
  const c = countsFromChoices(scenario, choices);
  return {
    date: c.date,
    meeting: c.meeting,
    supply: c.supply,
    extra_lecture_ut3: Math.min(c.lecture, 3),
    date_ut2: Math.min(c.date, 2),
    meeting_ut2: Math.min(c.meeting, 2),
    supply_ut2: Math.min(c.supply, 2),
  };
}

/** アビリティの回数 → 選択で合わせたい行動ごとの回数 */
export function choiceTargets(
  getCount: (key: ChoiceAbilityKey) => number,
): Record<ChoiceEvent, number> {
  return {
    date: getCount("date"),
    meeting: getCount("meeting"),
    supply: getCount("supply"),
    lecture: getCount("extra_lecture_ut3"),
  };
}

/** 推測で先に埋める行動の順（差し入れはPポイントに効くので最優先） */
const INFER_PRIORITY: ChoiceEvent[] = ["supply", "meeting", "date", "lecture"];
const inferCache = new Map<string, ScheduleChoices>();

/**
 * 回数から選択を推測する（保存された選択が無い・回数と合わないとき）。
 * できるだけ多くの回数を満たす組み合わせを探す（週は多くても9つなので総当たりで十分速い）。
 * 同じだけ満たせるなら、前の週から差し入れ→相談→おでかけ→特別指導の順に埋めたものを採る
 * （N.I.Aの差し入れは早い週＝110P から埋まる）。
 */
export function inferChoices(
  scenario: ScenarioKey,
  targets: Record<ChoiceEvent, number>,
): ScheduleChoices {
  const key = `${scenario}|${targets.date},${targets.meeting},${targets.supply},${targets.lecture}`;
  const hit = inferCache.get(key);
  if (hit) return hit;
  const rows = scheduleChoiceRows(scenario);
  const used: Record<ChoiceEvent, number> = { date: 0, meeting: 0, supply: 0, lecture: 0 };
  const pick: (ChoiceEvent | null)[] = rows.map(() => null);
  let best: (ChoiceEvent | null)[] = [...pick];
  let bestScore = -1;
  const goal = Math.min(
    rows.length,
    Math.max(0, targets.date) + Math.max(0, targets.meeting) + Math.max(0, targets.supply) + Math.max(0, targets.lecture),
  );
  const walk = (i: number, score: number) => {
    if (bestScore >= goal) return;
    if (score + (rows.length - i) <= bestScore) return;
    if (i === rows.length) {
      if (score > bestScore) {
        bestScore = score;
        best = [...pick];
      }
      return;
    }
    for (const e of INFER_PRIORITY) {
      if (!rows[i].options.includes(e) || used[e] >= targets[e]) continue;
      used[e]++;
      pick[i] = e;
      walk(i + 1, score + 1);
      used[e]--;
      pick[i] = null;
      if (bestScore >= goal) return;
    }
    walk(i + 1, score);
  };
  walk(0, 0);
  const out: ScheduleChoices = {};
  rows.forEach((r, i) => {
    out[r.id] = best[i] ?? null;
  });
  inferCache.set(key, out);
  return out;
}

/**
 * 画面と計算に使う選択。
 * 保存された選択があればそれが正（回数はこの選択から決まるので、回数との突き合わせはしない）。
 * まだ一度も選んでいないセットだけ、昔の回数から推測して埋める。
 */
export function resolveChoices(
  scenario: ScenarioKey,
  stored: ScheduleChoices | undefined,
  targets: Record<ChoiceEvent, number>,
): ScheduleChoices {
  if (!stored) return inferChoices(scenario, targets);
  const out: ScheduleChoices = {};
  for (const r of scheduleChoiceRows(scenario)) {
    const ev = stored[r.id];
    out[r.id] = ev && r.options.includes(ev) ? ev : null;
  }
  return out;
}

/**
 * 推測した選択が昔の回数に届かなかった分（週数が足りない・同じ週に重なる等で
 * そのシナリオでは実現できない回数だった場合）。画面で知らせるために使う。
 */
export function choiceShortfall(
  scenario: ScenarioKey,
  choices: ScheduleChoices,
  targets: Record<ChoiceEvent, number>,
): { event: ChoiceEvent; from: number; to: number }[] {
  const c = countsFromChoices(scenario, choices);
  const got: Record<ChoiceEvent, number> = { ...c, lecture: Math.min(c.lecture, 3) };
  const out: { event: ChoiceEvent; from: number; to: number }[] = [];
  for (const ev of CHOICE_EVENTS) {
    if (got[ev] < targets[ev]) out.push({ event: ev, from: targets[ev], to: got[ev] });
  }
  return out;
}
