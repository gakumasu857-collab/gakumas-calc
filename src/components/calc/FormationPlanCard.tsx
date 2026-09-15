import { useState } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal, Table2 } from "lucide-react";
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
 * 「サポカ編成と踏み方」: サポカ6枚・レッスン（メイン＋サブ・SP）・授業／営業・選抜配分・
 * 開始時のステータス・SP率を1つのカードで一度に見せる。探索を押すとここが書き換わり、
 * 手で変えると評価値がその場で変わる（その旨を1行で書いておく）。
 * 前イベ・後イベ・ステイベの調整（children）は目立つボタンの下に畳んでおく。
 */
export default function FormationPlanCard({
  r,
  flags,
  eventOverrideCount,
  eventOverrideTitle,
  onOpenSlot,
  onDetail,
  onEditPlan,
  onClearAll,
  onOpenParabo,
  children,
}: {
  r: CalcResult;
  flags: CardFlagSets;
  /** 前イベ・後イベ・ステイベを手で変えているカード数（ボタンのバッジ） */
  eventOverrideCount: number;
  /** バッジのツールチップ（どのカードを変えているか） */
  eventOverrideTitle?: string;
  onOpenSlot: (index: number) => void;
  onDetail: (member: SelectedMember) => void;
  onEditPlan: () => void;
  onClearAll: () => void;
  /** パラボ変換表を開く（開始時のステータスの行から） */
  onOpenParabo: () => void;
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
        <Hint text="上がサポカ6枚（クリックで入れ替え・凸変更・固定・BAN）、下がレッスンの踏み方（画面左端の「レッスン等の踏み方」タブか、エリアをクリックで編集）。自動探索を押すとここが書き換わります。変更すると評価値がその場で変わります。" />
      }
      action={
        <button type="button" onClick={onClearAll} className={BTN_SECONDARY}>
          全て外す
        </button>
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
        title="クリックでレッスン等の踏み方を編集"
        className="mt-1.5 block w-full rounded-lg border border-transparent px-1.5 py-1.5 text-left transition hover:border-slate-200 hover:bg-slate-50"
      >
        <PlanChips plan={plan} />
      </button>

      {/* 開始時のステータスとSPレッスン率（1つの枠に2行。数字は大きめ） */}
      <div className="mt-2 divide-y divide-slate-200 rounded-lg bg-slate-50 text-sm text-slate-600">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
          <span className="w-full font-bold text-slate-700 sm:w-36">開始時のステータス</span>
          {/* スマホでは3列のグリッド（Visual が2行目に落ちない）、PCでは横並び */}
          <div className="grid w-full grid-cols-3 gap-x-2 sm:flex sm:w-auto sm:gap-x-4">
            {TYPE_KEYS.map((type) => (
              <span key={type} className="whitespace-nowrap tabular-nums">
                <span className={`font-bold ${TYPE_TEXT[type]}`}>{TYPE_SHORT[type]}</span>{" "}
                <b className="text-base text-slate-900">{Math.round(r.perType[type].startFixed)}</b>
                <span className="text-slate-500"> +{r.perType[type].startPct}%</span>
              </span>
            ))}
          </div>
          <span className="text-xs text-slate-500">
            審査基準 {TYPE_KEYS.map((t) => `${TYPE_SHORT[t]}${r.ranks?.[t] ?? "—"}`).join("/")}
          </span>
          <button
            type="button"
            onClick={onOpenParabo}
            title="パラボが今の踏み方で実質いくつのステになるかの変換表を開きます"
            className={`${BTN_SECONDARY} ml-auto`}
          >
            <Table2 size={12} />
            パラボ変換表
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
          <span className="flex w-full items-center gap-1 font-bold text-slate-700 sm:w-36">
            SPレッスン率上昇
            <Hint text={GLOSSARY.spRate} />
          </span>
          <div className="grid w-full grid-cols-3 gap-x-2 sm:flex sm:w-auto sm:gap-x-4">
            {TYPE_KEYS.map((type) => (
              <span key={type} className="whitespace-nowrap tabular-nums">
                <span className={`font-bold ${TYPE_TEXT[type]}`}>{TYPE_SHORT[type]}</span>{" "}
                <b className="text-base text-slate-900">
                  +{(r.spLesson.shown[type] * 100).toFixed(1)}%
                </b>
              </span>
            ))}
          </div>
          <label className="flex items-center gap-1 text-xs text-slate-500">
            表記外推定SP率
            <input
              type="number"
              min={0}
              max={100}
              value={settings.baseSpRate[r.scenario]}
              onChange={(e) =>
                calc.update({
                  baseSpRate: {
                    ...settings.baseSpRate,
                    [r.scenario]: Math.max(0, Number(e.target.value) || 0),
                  },
                })
              }
              className="w-12 rounded border border-slate-300 bg-white px-1 py-0.5 text-right text-xs text-slate-700"
            />
            %
          </label>
          <span className="ml-auto flex flex-wrap items-center gap-x-1.5 text-sm tabular-nums text-slate-600">
            <span className="font-bold text-slate-700">実現確率</span>
            {r.scenario === "hif" ? (
              <>
                選抜 <b className="text-lg text-blue-700">{formatProb(r.spLesson.probSen)}</b> ／ 本戦{" "}
                <b className="text-lg text-blue-700">{formatProb(r.spLesson.probHon)}</b>
              </>
            ) : (
              <b className="text-lg text-blue-700">{formatProb(r.spLesson.prob)}</b>
            )}
          </span>
        </div>
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
            前イベ・後イベ・ステイベの発動を調整（評価値に反映）
            {eventOverrideCount > 0 && (
              <span
                title={eventOverrideTitle}
                className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white"
              >
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
