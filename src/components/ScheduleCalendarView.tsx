import { SCENARIO_LABELS, type ScenarioKey } from "@/data/scenarios";
import {
  CALENDAR_EVENT_LABELS,
  SCENARIO_CALENDARS,
  type CalendarEvent,
} from "@/data/scheduleCalendar";

/** 行動チップの色分け */
const EVENT_CHIP: Record<CalendarEvent, string> = {
  lesson: "bg-sky-100 text-sky-700",
  starLesson: "bg-amber-100 text-amber-700",
  class: "bg-slate-200 text-slate-600",
  sale: "bg-slate-200 text-slate-600",
  date: "bg-emerald-100 text-emerald-700",
  meeting: "bg-violet-100 text-violet-700",
  supply: "bg-pink-100 text-pink-700",
  lecture: "bg-orange-100 text-orange-700",
};

/**
 * シナリオの育成スケジュール表（何日/週に何があるか）。
 * 数値表・発動回数モーダル・プロデュースページから開ける共通ビュー。
 */
export default function ScheduleCalendarView({
  scenario,
}: {
  scenario: ScenarioKey;
}) {
  const cal = SCENARIO_CALENDARS[scenario];
  return (
    <div className="text-sm">
      <p className="mb-2 text-xs text-slate-500">
        {SCENARIO_LABELS[scenario]} のスケジュール。
        「レッスン」はVo/Da/Viの3択が出る{cal.unit}
        {scenario === "hif" && "、☆はスター性重視の公開レッスン"}です。
      </p>
      <div className="flex flex-wrap items-start gap-6">
        {cal.sections.map((section, si) => (
          <table
            key={si}
            className="border-collapse text-xs tabular-nums"
          >
            <thead>
              <tr>
                <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-slate-700">
                  {section.title ? `${section.title}（${cal.unit}）` : cal.unit}
                </th>
                <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-left text-slate-700">
                  スケジュール
                </th>
              </tr>
            </thead>
            <tbody>
              {section.rows.map((row) => (
                <tr key={row.label}>
                  <td className="border border-slate-200 px-2 py-1 text-center text-slate-500">
                    {row.label}
                  </td>
                  <td className="border border-slate-200 px-2 py-1">
                    {row.exam ? (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 font-bold text-red-700">
                        {row.exam}
                      </span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {row.events.map((e) => (
                          <span
                            key={e}
                            className={`rounded px-1.5 py-0.5 font-semibold ${EVENT_CHIP[e]}`}
                          >
                            {e === "starLesson"
                              ? "☆レッスン"
                              : CALENDAR_EVENT_LABELS[e]}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </div>
  );
}
