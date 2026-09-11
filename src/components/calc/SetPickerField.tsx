import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { setVisibleInScenario } from "@/data/abilityCounts";
import { FIELD } from "@/components/ui";
import type { useCalcResult } from "@/lib/useCalcResult";

type CalcResult = ReturnType<typeof useCalcResult>;

/**
 * 育成パターン（発動回数セット）の選択欄。
 * ネイティブの select は他の欄と見た目がそろわないので、ボタン＋自前の一覧にしている。
 */
export default function SetPickerField({ r }: { r: CalcResult }) {
  const [open, setOpen] = useState(false);
  const current = r.selectedSet;
  const visible = r.ability.sets.filter((set) => setVisibleInScenario(set.id, r.scenario));
  const normal = visible.filter((s) => !r.ability.saveIdOf(s.id));
  const saveSets = visible.filter((s) => r.ability.saveIdOf(s.id));

  const pick = (id: string) => {
    if (id !== r.ability.selectedSetId) r.ability.selectSet(id);
    setOpen(false);
  };
  const group = (label: string, list: typeof visible) =>
    list.length > 0 && (
      <div>
        <p className="px-2 pb-0.5 pt-1.5 text-[10px] font-bold text-slate-400">{label}</p>
        {list.map((set) => {
          const on = set.id === r.ability.selectedSetId;
          return (
            <button
              key={set.id}
              type="button"
              onClick={() => pick(set.id)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
                on ? "bg-blue-50 text-blue-800" : "text-slate-800 hover:bg-slate-100"
              }`}
            >
              {set.plan && (
                <span className="shrink-0 rounded bg-slate-100 px-1 text-[10px] font-bold text-slate-600">
                  {set.plan}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate">{set.name}</span>
              {on && <Check size={14} className="shrink-0 text-blue-600" />}
            </button>
          );
        })}
      </div>
    );

  return (
    <span className="relative block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${FIELD} flex w-full items-center gap-2 text-left ${
          current ? "" : "border-amber-400 bg-amber-50"
        }`}
      >
        {current ? (
          <>
            {current.plan && (
              <span className="shrink-0 rounded bg-slate-100 px-1 text-[10px] font-bold text-slate-600">
                {current.plan}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate">{current.name}</span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate font-bold text-amber-700">
            未選択（クリックして選ぶ）
          </span>
        )}
        <ChevronDown size={14} className="shrink-0 text-slate-400" />
      </button>
      {open && (
        <>
          <span className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-30 mt-1 max-h-72 w-full min-w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
            {visible.length === 0 ? (
              <p className="px-2 py-2 text-xs text-slate-500">
                このシナリオの育成パターンがありません（発動回数ページで作れます）
              </p>
            ) : (
              <>
                {group("育成パターン", normal)}
                {group("セーブデータ用", saveSets)}
              </>
            )}
          </div>
        </>
      )}
    </span>
  );
}
