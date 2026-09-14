/**
 * 各シナリオの育成スケジュール（何日目/何週目に何があるか）。
 * 出典: ユーザー提供のゲーム内スケジュール（2026-08）。
 *
 * 用途:
 * - スケジュール表の表示（数値表・発動回数モーダル・プロデュースページ）
 * - お出かけ・相談・差し入れ等の「シナリオ別の最大回数」の導出（calendarEventCounts）
 *
 * 既存マスタとの整合（レッスン・授業の日付）は schedule.ts / scenarios.ts と一致済み。
 */
import type { ScenarioKey } from "./scenarios";

/** スケジュール上の行動の種類 */
export type CalendarEvent =
  | "lesson" // レッスン（Vo/Da/Viの3択が出る日）
  | "starLesson" // スター性重視の公開レッスン（H.I.F.の☆）
  | "class" // 授業
  | "sale" // 営業（N.I.A.）
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
  /** 行番号の単位（H.I.F.=日 / N.I.A.・初=週） */
  unit: "週" | "日";
  /** セクション（H.I.F.は選抜/本戦の2部構成。他は1つ） */
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
