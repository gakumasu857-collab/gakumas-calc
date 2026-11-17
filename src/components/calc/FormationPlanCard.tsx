import { Link } from "react-router-dom";
import { CalendarCheck, LayoutGrid, ListOrdered, SlidersHorizontal, Table2 } from "lucide-react";
import AbilityCountDrawer from "@/components/calc/AbilityCountDrawer";
import { Card } from "@/components/calc/CalcCard";
import { currentPlanSummary, formatProb, PlanChips } from "@/components/calc/PlanChips";
import PlanEditDrawer from "@/components/calc/PlanEditDrawer";
import SupportSlot from "@/components/calc/SupportSlot";
import Hint from "@/components/Hint";
import { BTN_SECONDARY, TYPE_SHORT } from "@/components/ui";
import { GLOSSARY } from "@/lib/glossary";
import type { CardFlagSets } from "@/lib/formation";
import type { SelectedMember, useCalcResult } from "@/lib/useCalcResult";
import { TYPE_KEYS } from "@/lib/useCalcSettings";

type CalcResult = ReturnType<typeof useCalcResult>;

/** 「微調整」のタブ */
export type AdjustTab = "formation" | "plan" | "counts" | "events";

const TYPE_TEXT = {
  vocal: "text-red-600",
  dance: "text-blue-600",
  visual: "text-yellow-600",
} as const;

/**
 * 計算ページの「微調整」（探索の結果を実際の育成に合わせて直す場所）。2026-11-17 の画面整理で、
 * 以前の左端の縦タブ（プロデュース・レッスン等の踏み方）と黄色い帯（前イベ・後イベ・ステイベ）を
 * このカードのタブにまとめた: サポカ編成｜踏み方｜発動回数｜イベント。どれも「この育成だけ」で、
 * 変えると右の評価値がその場で動く（PCでは右の列が見えたまま）。
 * 開始時のステ・SP率・実現確率は「育成後のステータス」の「くわしい数字」へ移した（DetailNumbers）。
 */
export default function FormationPlanCard({
  r,
  flags,
  tab,
  onTab,
  highlight,
  onDismissHighlight,
  eventOverrideCount,
  eventOverrideTitle,
  onOpenSlot,
  onDetail,
  onClearAll,
  children,
}: {
  r: CalcResult;
  flags: CardFlagSets;
  tab: AdjustTab;
  onTab: (tab: AdjustTab) => void;
  /** 初めて探索したあとの案内（タブを光らせる） */
  highlight: boolean;
  onDismissHighlight: () => void;
  /** 前イベ・後イベ・ステイベを手で変えているカード数（タブのバッジ） */
  eventOverrideCount: number;
  /** バッジのツールチップ（どのカードを変えているか） */
  eventOverrideTitle?: string;
  onOpenSlot: (index: number) => void;
  onDetail: (member: SelectedMember) => void;
  onClearAll: () => void;
  /** イベントのタブの中身（前イベ・後イベ・ステイベの表） */
  children: React.ReactNode;
}) {
  const plan = currentPlanSummary(r);
  const rentalCount = r.members.filter((m) => m?.rental).length;
  const set = r.selectedSet;
  const countAdjusted = set ? r.ability.runAdjustCount(set) : 0;
  const planLabel = r.scenario === "niaMaster" ? "レッスン・営業" : "レッスン・授業";
  const tabs: { key: AdjustTab; label: string; icon: React.ReactNode; badge?: string; title?: string }[] = [
    { key: "formation", label: "サポカ編成", icon: <LayoutGrid size={13} /> },
    { key: "plan", label: planLabel, icon: <CalendarCheck size={13} /> },
    {
      key: "counts",
      label: "発動回数",
      icon: <ListOrdered size={13} />,
      badge: countAdjusted > 0 ? `${countAdjusted}` : undefined,
      title: "サポカのアビリティが何回発動するか（この育成だけ）",
    },
    {
      key: "events",
      label: "イベント",
      icon: <SlidersHorizontal size={13} />,
      badge: eventOverrideCount > 0 ? `${eventOverrideCount}` : undefined,
      title: eventOverrideTitle ?? "前イベ・後イベ・ステイベの発動（この育成だけ）",
    },
  ];
  const pick = (key: AdjustTab) => {
    onDismissHighlight();
    onTab(key);
  };

  return (
    <Card
      id="step-adjust"
      className="scroll-mt-16"
      title="微調整"
      hint={<Hint text={GLOSSARY.formationPlan} />}
      action={
        tab === "formation" ? (
          <button type="button" onClick={onClearAll} className={BTN_SECONDARY}>
            全て外す
          </button>
        ) : undefined
      }
    >
      {/* タブ（スマホでは横にスクロール） */}
      <div
        role="tablist"
        className={`-mx-1 mb-3 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-slate-200 px-1 ${
          highlight ? "rounded-t-lg ring-4 ring-amber-300 animate-pulse" : ""
        }`}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => pick(t.key)}
            title={t.title}
            className={`-mb-px flex shrink-0 grow items-center justify-center gap-1 border-b-2 px-2 py-2 text-sm font-bold transition sm:grow-0 sm:px-3 ${
              tab === t.key
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <span className="hidden sm:inline-flex">{t.icon}</span>
            {t.label}
            {t.badge && (
              <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold leading-4 text-white">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>
      {highlight && (
        <p className="-mt-1 mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-amber-700">
          タブを切り替えると、実際の育成に合わせて直せます（評価値がその場で変わります）
          <button
            type="button"
            onClick={onDismissHighlight}
            className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-600 hover:bg-slate-200"
          >
            わかった
          </button>
        </p>
      )}

      {tab === "formation" && (
        <>
          {rentalCount >= 2 && (
            <p className="mb-2 text-xs font-semibold text-amber-600">
              ⚠ レンタルが{rentalCount}枚選ばれています。レンタルサポカは1育成につき1枚です。
            </p>
          )}
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
          {/* 踏み方の要約（押すと「レッスン・授業」のタブへ） */}
          <button
            type="button"
            onClick={() => pick("plan")}
            title={`クリックで「${planLabel}」のタブへ`}
            className="mt-1.5 block w-full rounded-lg border border-transparent px-1.5 py-1.5 text-left transition hover:border-slate-200 hover:bg-slate-50"
          >
            <PlanChips plan={plan} />
          </button>
        </>
      )}
      {tab === "plan" && <PlanEditDrawer r={r} open onClose={() => pick("formation")} inline />}
      {tab === "counts" && <AbilityCountDrawer r={r} open onClose={() => pick("formation")} inline />}
      {tab === "events" &&
        (r.members.some((m) => m !== null) ? (
          <>
            {children}
            <p className="mt-2 text-xs text-slate-500">
              ここはこの育成だけの設定です。どの育成でも共通の設定（前イベの回数の上限など）は
              <Link to="/card-settings" className="mx-0.5 font-semibold text-blue-600 underline">
                サポカ設定
              </Link>
              で。
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-500">サポカを選ぶと、ここで前イベ・後イベ・ステイベの発動を変えられます。</p>
        ))}
    </Card>
  );
}

/**
 * 「くわしい数字」の中身のうち、開始時のステータスとSPレッスン率（以前は「サポカ編成と踏み方」の下にあった）。
 * 右の列（育成後のステータス）は幅が狭いので縦に積む。
 */
export function DetailNumbers({ r, onOpenParabo }: { r: CalcResult; onOpenParabo: () => void }) {
  const { calc } = r;
  const { settings } = calc;
  const row = "flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-2";
  return (
    <div className="divide-y divide-slate-200 rounded-lg bg-slate-50 text-xs text-slate-600">
      <div className={row}>
        <span className="w-full font-bold text-slate-700">開始時のステータス</span>
        {TYPE_KEYS.map((type) => (
          <span key={type} className="whitespace-nowrap tabular-nums">
            <span className={`font-bold ${TYPE_TEXT[type]}`}>{TYPE_SHORT[type]}</span>{" "}
            <b className="text-sm text-slate-900">{Math.round(r.perType[type].startFixed)}</b>{" "}
            <span className="text-slate-500">+{r.perType[type].startPct}%</span>
          </span>
        ))}
        <span className="text-slate-500">
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
      <div className={row}>
        <span className="flex w-full items-center gap-1 font-bold text-slate-700">
          SPレッスン率上昇
          <Hint text={GLOSSARY.spRate} />
        </span>
        {TYPE_KEYS.map((type) => (
          <span key={type} className="whitespace-nowrap tabular-nums">
            <span className={`font-bold ${TYPE_TEXT[type]}`}>{TYPE_SHORT[type]}</span>{" "}
            <b className="text-sm text-slate-900">+{(r.spLesson.shown[type] * 100).toFixed(1)}%</b>
          </span>
        ))}
        <label className="flex items-center gap-1 text-slate-500">
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
        <span className="flex w-full flex-wrap items-center gap-x-1.5 tabular-nums">
          <span className="font-bold text-slate-700">実現確率</span>
          {r.scenario === "hif" ? (
            <>
              選抜 <b className="text-sm text-blue-700">{formatProb(r.spLesson.probSen)}</b> ／ 本戦{" "}
              <b className="text-sm text-blue-700">{formatProb(r.spLesson.probHon)}</b>
            </>
          ) : (
            <b className="text-sm text-blue-700">{formatProb(r.spLesson.prob)}</b>
          )}
        </span>
      </div>
    </div>
  );
}
