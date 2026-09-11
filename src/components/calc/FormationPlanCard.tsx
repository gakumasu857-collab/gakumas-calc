import { useState } from "react";
import {
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  ListOrdered,
  SlidersHorizontal,
} from "lucide-react";
import { Card } from "@/components/calc/CalcCard";
import { currentPlanSummary, formatProb, PlanChips } from "@/components/calc/PlanChips";
import SupportSlot from "@/components/calc/SupportSlot";
import Hint from "@/components/Hint";
import { BTN_SECONDARY, TYPE_SHORT } from "@/components/ui";
import { GLOSSARY } from "@/lib/glossary";
import type { CardFlagSets } from "@/lib/formation";
import type { SelectedMember, useCalcResult } from "@/lib/useCalcResult";
import { TYPE_KEYS } from "@/lib/useCalcSettings";

type CalcResult = ReturnType<typeof useCalcResult>;

const TYPE_TEXT = {
  vocal: "text-red-600",
  dance: "text-blue-600",
  visual: "text-yellow-600",
} as const;

/**
 * 「サポカ編成と踏み方」: サポカ6枚・レッスン（メイン｜サブ・SP）・授業／営業・選抜配分・SP率を
 * 1つのカードで一度に見せる。探索を押すとここが書き換わる。
 * 前イベ・後イベ・ステイベの調整（children）は目立つボタンの下に畳んでおく。
 */
export default function FormationPlanCard({
  r,
  flags,
  eventOverrideCount,
  onOpenSlot,
  onDetail,
  onEditPlan,
  onEditCounts,
  onClearAll,
  children,
}: {
  r: CalcResult;
  flags: CardFlagSets;
  /** 前イベ・後イベ・ステイベを手で変えているカード数（ボタンのバッジ） */
  eventOverrideCount: number;
  onOpenSlot: (index: number) => void;
  onDetail: (member: SelectedMember) => void;
  onEditPlan: () => void;
  onEditCounts: () => void;
  onClearAll: () => void;
  children: React.ReactNode;
}) {
  const [eventsOpen, setEventsOpen] = useState(false);
  const { calc } = r;
  const { settings } = calc;
  const plan = currentPlanSummary(r);
  const rentalCount = r.members.filter((m) => m?.rental).length;

  return (
    <Card
      title="サポカ編成と踏み方"
      hint={
        <Hint text="上がサポカ6枚（クリックで入れ替え・凸・固定・BAN）、下がレッスンの踏み方（クリックで編集）。自動探索を押すとここが書き換わります。" />
      }
      action={
        <>
          <button type="button" onClick={onEditPlan} className={BTN_SECONDARY}>
            <CalendarCheck size={13} />
            踏み方を編集
          </button>
          <button
            type="button"
            onClick={onEditCounts}
            className={BTN_SECONDARY}
            title={
              r.selectedSet
                ? `育成パターン「${r.selectedSet.name}」の発動回数を調整`
                : "育成パターンを選ぶと調整できます"
            }
          >
            <ListOrdered size={13} />
            発動回数
          </button>
          <button type="button" onClick={onClearAll} className={BTN_SECONDARY}>
            全て外す
          </button>
        </>
      }
    >
      {rentalCount >= 2 && (
        <p className="mb-2 text-xs font-semibold text-amber-600">
          ⚠ レンタルが{rentalCount}枚選ばれています。レンタルサポカは1育成につき1枚です。
        </p>
      )}
      {/* サポカ6枚 */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {r.selected.slots.map((_, i) => (
          <SupportSlot
            key={i}
            member={r.members[i]}
            plan={r.plan}
            flags={flags}
            onOpen={() => onOpenSlot(i)}
            onDetail={() => {
              const m = r.members[i];
              if (m) onDetail(m);
            }}
          />
        ))}
      </div>

      {/* 踏み方（クリックで編集） */}
      <button
        type="button"
        onClick={onEditPlan}
        title="クリックで踏み方を編集"
        className="mt-3 block w-full rounded-lg border border-transparent px-1.5 py-1.5 text-left transition hover:border-slate-200 hover:bg-slate-50"
      >
        <PlanChips plan={plan} />
      </button>

      {/* SPレッスン率とこの踏み方の実現確率（1行） */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
        <span className="flex items-center gap-1 font-bold text-slate-700">
          SPレッスン率上昇
          <Hint text={GLOSSARY.spRate} />
        </span>
        {TYPE_KEYS.map((type) => (
          <span key={type} className="tabular-nums">
            <span className={`font-bold ${TYPE_TEXT[type]}`}>{TYPE_SHORT[type]}</span>{" "}
            +{(r.spLesson.shown[type] * 100).toFixed(1)}%
          </span>
        ))}
        <label className="flex items-center gap-1 text-[11px] text-slate-400">
          表記外推定SP率
          <input
            type="number"
            min={0}
            max={100}
            value={settings.baseSpRate}
            onChange={(e) =>
              calc.update({ baseSpRate: Math.max(0, Number(e.target.value) || 0) })
            }
            className="w-12 rounded border border-slate-300 bg-white px-1 py-0.5 text-right text-xs text-slate-700"
          />
          %
        </label>
        <span className="ml-auto tabular-nums">
          実現確率{" "}
          {r.scenario === "hif" ? (
            <>
              選抜 <b className="text-blue-700">{formatProb(r.spLesson.probSen)}</b> ／ 本戦{" "}
              <b className="text-blue-700">{formatProb(r.spLesson.probHon)}</b>
            </>
          ) : (
            <b className="text-blue-700">{formatProb(r.spLesson.prob)}</b>
          )}
        </span>
      </div>

      {/* 前イベ・後イベ・ステイベの調整（畳んであるが目立たせる） */}
      {r.members.some((m) => m !== null) && (
        <>
          <button
            type="button"
            onClick={() => setEventsOpen((v) => !v)}
            className={`mt-3 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-bold transition ${
              eventsOpen
                ? "border-blue-300 bg-blue-50 text-blue-800"
                : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
            }`}
          >
            <SlidersHorizontal size={14} />
            前イベ・後イベ・ステイベの発動を調整
            {eventOverrideCount > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {eventOverrideCount}枚変更中
              </span>
            )}
            <span className="ml-auto">
              {eventsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </button>
          {eventsOpen && children}
        </>
      )}
    </Card>
  );
}
