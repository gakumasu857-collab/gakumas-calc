import { EVENT_CARD, ScheduleCard } from "@/components/scheduleCards";
import type { ScenarioKey } from "@/data/scenarios";
import {
  CHOICE_EVENTS,
  countsFromChoices,
  SCENARIO_CALENDARS,
  scheduleChoiceRows,
  supplyPFromChoices,
  type ChoiceEvent,
  type ScheduleChoices,
} from "@/data/scheduleCalendar";

/**
 * スケジュールの選択（週・日ごとに1つだけ選ぶ）を正方形のカードで並べる画面。
 * レッスン・☆レッスン・授業・営業・試験の週は出さない（選択肢が無いため）。
 * カードを押すとその週の選択になり、もう一度押すと外れる。選んだ行動の回数がプロデュースの回数になる。
 * 差し入れ（活動支給）のカードにはその週のPポイントを添え、上の集計に合計を出す。
 */
export default function ScheduleChoiceGrid({
  scenario,
  choices,
  onPick,
  adjustedRowIds,
}: {
  scenario: ScenarioKey;
  choices: ScheduleChoices;
  /** 無ければ表示だけ */
  onPick?: (rowId: string, event: ChoiceEvent | null) => void;
  /** この育成だけ変えた週（黄色い枠） */
  adjustedRowIds?: ReadonlySet<string>;
}) {
  const cal = SCENARIO_CALENDARS[scenario];
  const rows = scheduleChoiceRows(scenario);
  const counts = countsFromChoices(scenario, choices);
  const supply = supplyPFromChoices(scenario, choices);
  const unitLabel = cal.unit === "週" ? "週目" : "日目";
  const sections = cal.sections
    .map((section, si) => ({
      title: section.title,
      rows: rows.filter((row) => row.sectionIndex === si),
    }))
    .filter((s) => s.rows.length > 0);

  return (
    <div className="flex flex-col gap-2">
      {/* 集計（スクロールしても見える） */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs text-slate-600 backdrop-blur">
        {CHOICE_EVENTS.map((ev) => (
          <span key={ev} className="whitespace-nowrap">
            {EVENT_CARD[ev].label}{" "}
            <b className="tabular-nums text-slate-900">{counts[ev]}</b>回
          </span>
        ))}
        <span className="whitespace-nowrap rounded bg-cyan-400 px-1.5 py-0.5 font-bold tabular-nums text-cyan-950">
          差し入れ（活動支給）+{supply.total}P
        </span>
      </div>
      {onPick && (
        <p className="text-[11px] leading-relaxed text-slate-500">
          各{cal.unit === "週" ? "週" : "日"}で選んだものを1つ押します（もう一度押すと外れます）。選んだ回数がこのプロデュースの
          おでかけ・相談・活動支給・特別指導の回数になります。
        </p>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:gap-6">
        {sections.map((section) => (
          <div key={section.title ?? "all"} className="flex min-w-0 flex-col gap-1 sm:w-[19rem]">
            {section.title && (
              <p className="text-xs font-bold text-slate-700">{section.title}</p>
            )}
            {section.rows.map((row) => {
              const adjusted = adjustedRowIds?.has(row.id) ?? false;
              const picked = choices[row.id] ?? null;
              return (
                <div
                  key={row.id}
                  className={`grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-2 rounded-lg p-1 ${
                    adjusted ? "bg-amber-50 ring-2 ring-amber-400" : ""
                  }`}
                  title={
                    adjusted
                      ? "この育成だけ変えた選択です（「上書き保存」でデフォルトにできます）"
                      : undefined
                  }
                >
                  <span className="pt-4 text-center text-xs font-bold tabular-nums text-slate-600">
                    {row.label}
                    <span className="block text-[9px] font-normal text-slate-400">{unitLabel}</span>
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {row.options.map((ev) => (
                      <ScheduleCard
                        key={ev}
                        kind={ev}
                        selected={picked === ev}
                        onClick={onPick ? () => onPick(row.id, picked === ev ? null : ev) : undefined}
                        title={
                          ev === "supply"
                            ? `差し入れ（活動支給）: Pポイント +${row.supplyP}`
                            : EVENT_CARD[ev].label
                        }
                        sub={
                          ev === "supply" ? (
                            <span
                              className={`rounded px-1 text-[10px] font-bold tabular-nums ${
                                picked === ev ? "bg-cyan-400 text-cyan-950" : "bg-cyan-50 text-cyan-600"
                              }`}
                            >
                              +{row.supplyP}P
                            </span>
                          ) : undefined
                        }
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
