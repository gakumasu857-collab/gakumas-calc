import { ScheduleCard } from "@/components/scheduleCards";
import { SCENARIO_LABELS, type ScenarioKey } from "@/data/scenarios";
import { SCENARIO_CALENDARS, supplyPOf } from "@/data/scheduleCalendar";

/**
 * シナリオの育成スケジュール（何日/週に何があるか）を正方形のカードで並べる表示。
 * 数値表・発動回数モーダル・プロデュース設定ページから開ける共通ビュー（押せない）。
 * 週ごとに選ぶ画面は ability-counts/ScheduleChoiceGrid.tsx。
 */
export default function ScheduleCalendarView({
  scenario,
}: {
  scenario: ScenarioKey;
}) {
  const cal = SCENARIO_CALENDARS[scenario];
  const unitLabel = cal.unit === "週" ? "週目" : "日目";
  return (
    <div className="text-sm">
      <p className="mb-3 text-xs text-slate-500">
        {SCENARIO_LABELS[scenario]} のスケジュール。「レッスン」はVo/Da/Viの3択が出る{cal.unit}
        {scenario === "hif" && "、☆はスター性重視の公開レッスン"}です。カードが複数並んでいる
        {cal.unit}はその中から1つを選びます。
      </p>
      <div className="flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:items-start sm:gap-8">
        {cal.sections.map((section, si) => (
          <div key={si} className="flex min-w-0 flex-col gap-1.5">
            {section.title && (
              <p className="text-xs font-bold text-slate-700">{section.title}</p>
            )}
            {section.rows.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-2 border-b border-slate-100 pb-1.5 last:border-b-0"
              >
                <span className="text-center text-xs font-bold tabular-nums text-slate-600">
                  {row.label}
                  {row.label !== "当日" && (
                    <span className="block text-[9px] font-normal text-slate-400">{unitLabel}</span>
                  )}
                </span>
                {row.exam ? (
                  <span className="flex min-w-0 items-center gap-2">
                    <ScheduleCard kind="exam" size="sm" />
                    <span className="min-w-0 text-xs font-bold text-red-700">{row.exam}</span>
                  </span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {row.events.map((e) => (
                      <ScheduleCard
                        key={e}
                        kind={e}
                        size="sm"
                        sub={
                          e === "supply" ? (
                            <span className="text-[9px] font-bold tabular-nums text-cyan-700">
                              +{supplyPOf(scenario, row.label)}P
                            </span>
                          ) : undefined
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
