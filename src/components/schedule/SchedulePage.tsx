import { useState } from "react";
import { CircleHelp, Sparkles } from "lucide-react";
import Modal from "@/components/Modal";
import NumberField from "@/components/NumberField";
import {
  CLASSES,
  EXAMS,
  FINAL_ROUNDS,
  finalRoundValue,
  LESSON_KIND_LABELS,
  LESSONS,
} from "@/data/schedule";
import { optimizeSteppingForSlots } from "@/lib/autoOptimize";
import type { SelectedSlot } from "@/lib/formation";
import { manualCountFromSet } from "@/lib/sheetContext";
import { useCalcResult } from "@/lib/useCalcResult";
import {
  TYPE_KEYS,
  TYPE_LABELS,
  type TypeKey,
} from "@/lib/useCalcSettings";
import { computeScheduleGains, useSchedule } from "@/lib/useSchedule";

/** タイプごとの配色（チップ / サマリーのドット / ボタンON / OFF） */
const TYPE_STYLE: Record<
  TypeKey,
  { chip: string; dot: string; on: string; off: string; head: string }
> = {
  vocal: {
    chip: "bg-red-100 text-red-700",
    dot: "bg-red-400",
    on: "bg-red-500 text-white shadow-sm",
    off: "bg-red-50 text-red-400 hover:bg-red-100",
    head: "text-red-600",
  },
  dance: {
    chip: "bg-blue-100 text-blue-700",
    dot: "bg-blue-400",
    on: "bg-blue-500 text-white shadow-sm",
    off: "bg-blue-50 text-blue-400 hover:bg-blue-100",
    head: "text-blue-600",
  },
  visual: {
    chip: "bg-yellow-100 text-yellow-700",
    dot: "bg-yellow-400",
    on: "bg-yellow-400 text-yellow-950 shadow-sm",
    off: "bg-yellow-50 text-yellow-500 hover:bg-yellow-100",
    head: "text-yellow-600",
  },
};

const TYPE_JA: Record<TypeKey, string> = {
  vocal: "Vo",
  dance: "Da",
  visual: "Vi",
};
const BAR_COLOR: Record<TypeKey, string> = {
  vocal: "bg-red-400",
  dance: "bg-blue-400",
  visual: "bg-yellow-400",
};

/**
 * レッスン・オーディション・授業ページ。
 * 踏み方・授業・選抜スコアはタイプ（Vo/Da/Vi）に直接紐づけて保存される。
 * 値はすべて素の獲得量（パラメータボーナス%は計算ページ側で反映）。
 */
export default function SchedulePage() {
  const r = useCalcResult();
  const schedule = r.schedule;
  const calc = r.calc;
  const [helpOpen, setHelpOpen] = useState(false);
  const [subPicker, setSubPicker] = useState<number | null>(null);
  const [optMsg, setOptMsg] = useState<string | null>(null);

  const { gains, star, pPoints, examRows } = computeScheduleGains(schedule);

  /**
   * 選択サポカ6枚で総ステ（Σmin(3200, 現在のステ)）が最大になる踏み方を探す。
   * 全自動最適化と同じ広域探索（一様踏み・全配分シード＋多点山登り）を編成固定で回す。
   */
  const optimizePlan = () => {
    const manual = manualCountFromSet(
      r.selectedSet ? (key) => r.ability.getCount(r.selectedSet!, key) : null,
    );
    const slots = r.selected.slots.filter(
      (s): s is SelectedSlot => s !== null,
    );
    const result = optimizeSteppingForSlots(
      {
        scenario: "hif",
        hif: {
          lessons: schedule.lessons,
          classTypes: schedule.classTypes,
          examScores: schedule.examScores,
        },
        nia: r.niaSchedule,
        hatsu: r.hatsuSchedule,
        memories: r.memoryStore.selected.map(
          (id) => r.memoryStore.findMemory(id) ?? undefined,
        ),
        pStats: r.pStats,
        plan: r.plan,
        statCap: r.statCap,
        tag: r.ranks?.tag === "特化" ? "skew" : "flat",
        ranks: r.typeRanks,
        manual,
        eventCounts: r.events.get,
        getLevel: r.getLevel,
        flags: { banned: new Set(), pinned: new Set() },
        spMin: calc.settings.spMin,
        wappenCount: calc.settings.wappenCount,
        round1: calc.settings.round1,
        round2: calc.settings.round2,
      },
      slots,
    );
    if (!result?.hif) return;
    schedule.setPlan(result.hif.lessons, result.hif.classTypes);
    setOptMsg(
      `最適化しました（合計 ${Math.round(result.cappedSum).toLocaleString()}）`,
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ===== サマリー ===== */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {TYPE_KEYS.map((type) => (
          <SummaryCard
            key={type}
            label={TYPE_LABELS[type]}
            value={gains[type]}
            dot={TYPE_STYLE[type].dot}
          />
        ))}
        <SummaryCard label="スター性" value={star} dot="bg-violet-400" />
        <SummaryCard label="Pポイント" value={pPoints} dot="bg-cyan-400" />
      </div>
      <p className="-mt-2 text-xs text-slate-400">
        ※
        パラメータボーナス%はこのページでは適用しません。アイドルを切り替えると、審査基準に合わせて踏み方・スコアがタイプ間で入れ替わります。
      </p>

      {/* ===== 公開レッスン・授業 ===== */}
      <Section
        title="公開レッスン・授業"
        action={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            <button
              type="button"
              onClick={optimizePlan}
              title="選択サポカ6枚で総ステ（Σmin(3200, 現在のステ)）が最大になる踏み方・授業を探します"
              className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-500"
            >
              <Sparkles size={13} />
              選択サポカで踏み方を最適化
            </button>
            <span className="flex items-center gap-1">
              メイン一括:
              {TYPE_KEYS.map((type) => (
                <BulkButton
                  key={type}
                  type={type}
                  onClick={() => schedule.applyAllMain(type)}
                />
              ))}
            </span>
            <span className="flex items-center gap-1">
              サブ一括:
              {TYPE_KEYS.map((type) => (
                <BulkButton
                  key={type}
                  type={type}
                  onClick={() => schedule.applyAllSubs(type)}
                />
              ))}
            </span>
            <span className="flex items-center gap-1">
              授業一括:
              {TYPE_KEYS.map((type) => (
                <BulkButton
                  key={type}
                  type={type}
                  onClick={() => schedule.applyAllClasses(type)}
                />
              ))}
            </span>
            <button
              type="button"
              onClick={() => schedule.clearAllLessons()}
              title="全レッスンを「踏まない」に戻す（メインの選択を解除）"
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
            >
              レッスン全クリア
            </button>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50"
            >
              <CircleHelp size={14} />
              数値表
            </button>
          </div>
        }
      >
        {optMsg && (
          <p className="mb-2 text-xs font-semibold text-blue-600">{optMsg}</p>
        )}
        {/* PCではレッスンの横に授業、スマホでは下に並ぶ */}
        <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch lg:gap-0">
          <div className="overflow-x-auto lg:pr-8">
            <table className="w-auto text-sm">
              <thead>
                <tr className="border-b-2 border-slate-300 text-left text-sm font-semibold text-slate-500">
                  <th className="py-1.5 pr-4 font-semibold">日程</th>
                  {TYPE_KEYS.map((type) => (
                    <th
                      key={type}
                      className={`px-2.5 py-1.5 text-center font-bold ${TYPE_STYLE[type].head}`}
                    >
                      {TYPE_LABELS[type]}
                    </th>
                  ))}
                  <th className="px-2 py-1.5 text-center font-semibold">SP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300">
                {LESSONS.map((_, i) => (
                  <LessonRow
                    key={i}
                    lessonIndex={i}
                    schedule={schedule}
                    subPickerOpen={subPicker === i}
                    onToggleSubPicker={() =>
                      setSubPicker(subPicker === i ? null : i)
                    }
                    onCloseSubPicker={() => setSubPicker(null)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* 授業（同じ枠内・PCは横並び） */}
          <div className="overflow-x-auto lg:border-l lg:border-slate-200 lg:pl-8">
            <table className="w-auto text-sm">
              <thead>
                <tr className="border-b-2 border-slate-300 text-left text-sm font-semibold text-slate-500">
                  <th className="py-1.5 pr-4 font-semibold">
                    授業
                    <span className="ml-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      固定値
                    </span>
                  </th>
                  {TYPE_KEYS.map((type) => (
                    <th
                      key={type}
                      className={`px-2.5 py-1.5 text-center font-bold ${TYPE_STYLE[type].head}`}
                    >
                      {TYPE_LABELS[type]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300">
                {CLASSES.map((cls, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap py-1.5 pr-4 font-medium text-slate-800">
                      {cls.label}
                    </td>
                    {TYPE_KEYS.map((type) => (
                      <td key={type} className="px-2.5 py-1.5 text-center">
                        <TypeButton
                          type={type}
                          selected={schedule.classTypes[i] === type}
                          value={cls.gain}
                          onClick={() => schedule.setClassType(i, type)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* ===== 選抜・本戦 ===== */}
      <Section
        title="選抜・本戦"
        hint="選抜はタイプごとのスコアからステータスを自動分配。本戦のスコアは計算ページと共有"
      >
        <div className="flex flex-col divide-y divide-slate-300">
          {examRows.map((row, i) => (
            <ExamEditor key={row.name} index={i} row={row} schedule={schedule} />
          ))}

          {/* 本戦（スコア→評価値・★固定） */}
          {(
            [
              ["本戦 ラウンド1", calc.settings.round1, (v: number) => calc.update({ round1: v }), 0],
              ["本戦 ラウンド2", calc.settings.round2, (v: number) => calc.update({ round2: v }), 1],
            ] as const
          ).map(([label, value, onChange, i]) => (
            <div
              key={label}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5"
            >
              <span className="w-28 font-medium text-slate-800">{label}</span>
              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                スコア（ボーナス前）
                <NumberField
                  value={value}
                  onChange={onChange}
                  max={FINAL_ROUNDS[i].maxScore}
                  className="w-32"
                />
              </label>
              <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-400">
                スコア評価値
                <span className="inline-block w-20 rounded-md bg-slate-100 px-1 py-1 text-center font-bold tabular-nums text-slate-700">
                  {finalRoundValue(i, value).toLocaleString()}
                </span>
                <span className="inline-block w-14 rounded-md bg-violet-100 px-1 py-1 text-center font-bold tabular-nums text-violet-700">
                  ★{FINAL_ROUNDS[i].star}
                </span>
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* サブ選択ポップオーバーの外側クリックで閉じる透明レイヤー */}
      {subPicker !== null && (
        <div className="fixed inset-0 z-20" onClick={() => setSubPicker(null)} />
      )}

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

type ScheduleStore = ReturnType<typeof useSchedule>;

/**
 * レッスン1回分（1行）。
 * メインの正方形ボタンを選び、選択中ボタンの右下のサブバッジをクリックすると
 * 残り2タイプからサブを選ぶポップオーバーが開く。
 */
function LessonRow({
  lessonIndex,
  schedule,
  subPickerOpen,
  onToggleSubPicker,
  onCloseSubPicker,
}: {
  lessonIndex: number;
  schedule: ScheduleStore;
  subPickerOpen: boolean;
  onToggleSubPicker: () => void;
  onCloseSubPicker: () => void;
}) {
  const lesson = LESSONS[lessonIndex];
  const pick = schedule.lessons[lessonIndex];
  const spIndex = pick.sp ? 1 : 0;
  const mainType = pick.main;
  const subType = pick.sub;

  return (
    <tr>
      <td className="whitespace-nowrap py-1.5 pr-4">
        <div className="font-medium text-slate-800">{lesson.label}</div>
        <div
          className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-500`}
        >
          {LESSON_KIND_LABELS[lesson.kind]}
        </div>
      </td>
      {TYPE_KEYS.map((type) => {
        const isMain = mainType === type;
        return (
          <td key={type} className="relative px-2.5 py-1.5 text-center">
            <span className="relative inline-block">
              <TypeButton
                type={type}
                selected={isMain}
                value={lesson.main[spIndex]}
                title={
                  isMain
                    ? "もう一度クリックで「踏まない」に戻す"
                    : undefined
                }
                onClick={() => {
                  if (isMain) schedule.clearLessonMain(lessonIndex);
                  else schedule.setLessonMain(lessonIndex, type);
                }}
              />
              {/* サブバッジ（メインの右下）: クリックで残り2タイプから選ぶ */}
              {isMain && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSubPicker();
                  }}
                  title={`サブ: ${TYPE_LABELS[subType]}（クリックで変更）`}
                  className={`absolute -bottom-1.5 -right-2 z-10 flex h-5 min-w-7 items-center justify-center rounded px-1 text-[10px] font-bold ring-2 ring-white ${TYPE_STYLE[subType].on}`}
                >
                  {lesson.sub[spIndex]}
                </button>
              )}
            </span>
            {/* サブ選択ポップオーバー */}
            {isMain && subPickerOpen && (
              <div className="absolute left-1/2 top-full z-30 mt-1 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-slate-300 bg-white p-1.5 shadow-lg">
                <span className="text-[10px] font-semibold text-slate-400">
                  サブ
                </span>
                {TYPE_KEYS.filter((t) => t !== type).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      schedule.setLessonSub(lessonIndex, t);
                      onCloseSubPicker();
                    }}
                    className={`h-8 w-11 rounded-md text-xs font-bold transition ${
                      subType === t ? TYPE_STYLE[t].on : TYPE_STYLE[t].off
                    }`}
                  >
                    {TYPE_JA[t]}
                  </button>
                ))}
              </div>
            )}
          </td>
        );
      })}
      <td className="px-2 py-1.5 text-center">
        <SpToggle
          on={pick.sp}
          onToggle={() => schedule.toggleLessonSp(lessonIndex)}
        />
      </td>
    </tr>
  );
}

/**
 * タイプ選択の正方形ボタン。
 * 未選択は薄いタイプ色、選択中は濃いタイプ色（値は常に表示）。
 */
function TypeButton({
  type,
  selected,
  value,
  onClick,
  title,
}: {
  type: TypeKey;
  selected: boolean;
  value: number;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? TYPE_LABELS[type]}
      className={`h-11 w-11 rounded-lg text-sm font-bold tabular-nums transition ${
        selected ? TYPE_STYLE[type].on : TYPE_STYLE[type].off
      }`}
    >
      {value}
    </button>
  );
}

/** 一括選択用の小さいタイプボタン */
function BulkButton({ type, onClick }: { type: TypeKey; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-xs font-bold transition ${TYPE_STYLE[type].chip} hover:brightness-95`}
    >
      {TYPE_LABELS[type]}
    </button>
  );
}

/**
 * SPレッスンのトグル。
 * ON=濃い灰色×白文字、OFF=白背景×打ち消し線。
 */
function SpToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={on ? "SPレッスン（クリックで通常に）" : "通常レッスン（クリックでSPに）"}
      className={`h-9 w-9 rounded-lg border text-xs font-bold transition ${
        on
          ? "border-slate-700 bg-slate-700 text-white hover:bg-slate-600"
          : "border-slate-300 bg-white text-slate-500 line-through decoration-2 hover:bg-slate-50"
      }`}
    >
      SP
    </button>
  );
}

/** 選抜ごとのスライダー上限（1次3万・2次30万・3次50万） */
const EXAM_SLIDER_MAX = [30000, 300000, 500000] as const;

/**
 * 選抜1回分のスコア入力。
 * タイプ別スコアを入力し（右クリックでスライダー・±ボタン）、総スコアは自動合計。
 */
function ExamEditor({
  index,
  row,
  schedule,
}: {
  index: number;
  row: {
    name: string;
    total: number;
    dist: Record<TypeKey, number>;
    star: number;
  };
  schedule: ScheduleStore;
}) {
  const scores = schedule.examScores[index];
  const scoreOf = (type: TypeKey) => scores[type];
  const total = TYPE_KEYS.reduce((sum, t) => sum + scoreOf(t), 0);

  /** 極振り: 現在の総スコアを1タイプに全部 */
  const allIn = (type: TypeKey) => {
    const next: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
    next[type] = total;
    schedule.setExamScores(index, next);
  };

  return (
    <div className="py-2.5">
      {/* 1行目: 名前・総スコア（自動合計）・極振り・分配・★ */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="w-12 shrink-0 font-medium text-slate-800">
          {row.name}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          総スコア
          <span className="inline-block w-28 rounded-md bg-slate-100 px-2 py-1.5 text-right text-sm font-bold tabular-nums text-slate-800">
            {total.toLocaleString()}
          </span>
        </span>
        <span className="flex items-center gap-1 text-xs text-slate-500">
          極振り:
          {TYPE_KEYS.map((type) => (
            <button
              key={type}
              type="button"
              disabled={total === 0}
              onClick={() => allIn(type)}
              title={`総スコアを全部${TYPE_LABELS[type]}に`}
              className={`rounded-md px-2 py-1 text-xs font-bold transition disabled:opacity-40 ${TYPE_STYLE[type].chip} hover:brightness-95`}
            >
              {TYPE_JA[type]}
            </button>
          ))}
        </span>
        {/* 分配・★（固定幅で揃える） */}
        <span className="ml-auto flex items-center gap-1 tabular-nums">
          {TYPE_KEYS.map((type) => (
            <span
              key={type}
              className={`inline-block w-20 rounded-md px-1 py-1 text-center text-xs font-bold ${
                row.total > 0
                  ? TYPE_STYLE[type].chip
                  : "bg-slate-100 text-slate-300"
              }`}
            >
              {TYPE_JA[type]} +{row.total > 0 ? row.dist[type] : 0}
            </span>
          ))}
          <span
            className={`inline-block w-14 rounded-md px-1 py-1 text-center text-xs font-bold ${
              row.total > 0
                ? "bg-violet-100 text-violet-700"
                : "bg-slate-100 text-slate-300"
            }`}
          >
            ★{row.total > 0 ? row.star : 0}
          </span>
        </span>
      </div>

      {/* 2行目: 分配バー＋タイプ別入力 */}
      <div className="mt-1.5 flex flex-col gap-1.5">
        <div className="flex h-2.5 w-full overflow-hidden rounded bg-slate-100">
          {total > 0 &&
            TYPE_KEYS.map((type) => (
              <div
                key={type}
                className={BAR_COLOR[type]}
                style={{ width: `${(scoreOf(type) / total) * 100}%` }}
              />
            ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          {TYPE_KEYS.map((type) => (
            <label key={type} className="flex items-center gap-1">
              <span className={`font-bold ${TYPE_STYLE[type].head}`}>
                {TYPE_JA[type]}
              </span>
              <NumberField
                value={scoreOf(type)}
                onChange={(v) => schedule.setExamScore(index, type, v)}
                sliderMax={EXAM_SLIDER_MAX[index] ?? 500000}
                className="w-24"
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}


function SummaryCard({
  label,
  value,
  dot,
}: {
  label: string;
  value: number;
  dot: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        {label}
      </p>
      <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-800">
        +{value.toLocaleString()}
      </p>
    </div>
  );
}

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <div>{children}</div>
    </section>
  );
}

/** 数値表と計算式の開示モーダル */
function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="数値表・計算式" onClose={onClose} widthClass="max-w-3xl">
      <p className="mb-3 text-xs text-slate-500">
        ※ コミュニティ調べの暫定値・近似式です。
        サブパラメータは選択した1タイプに入ります。
        パラメータボーナス%はこのページでは適用せず、計算ページで反映します。
      </p>

      <h3 className="mb-1 text-xs font-bold text-slate-700">公開レッスン</h3>
      <table className="mb-4 w-full border-collapse text-xs tabular-nums">
        <thead>
          <tr>
            {["日程", "種別", "メイン(非SP/SP)", "サブ(非SP/SP)", "★(非SP/SP)", "P"].map(
              (h) => (
                <th key={h} className="border border-slate-300 bg-slate-100 px-2 py-1">
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {LESSONS.map((lesson, i) => (
            <tr key={i}>
              <td className="border border-slate-200 px-2 py-1">{lesson.label}</td>
              <td className="border border-slate-200 px-2 py-1 text-center">
                {LESSON_KIND_LABELS[lesson.kind]}
              </td>
              <td className="border border-slate-200 px-2 py-1 text-center">
                {lesson.main[0]} / {lesson.main[1]}
              </td>
              <td className="border border-slate-200 px-2 py-1 text-center">
                {lesson.sub[0]} / {lesson.sub[1]}
              </td>
              <td className="border border-slate-200 px-2 py-1 text-center">
                {lesson.star[0]} / {lesson.star[1]}
              </td>
              <td className="border border-slate-200 px-2 py-1 text-center">
                {lesson.p}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="mb-1 text-xs font-bold text-slate-700">授業</h3>
      <table className="mb-4 w-full border-collapse text-xs tabular-nums">
        <tbody>
          {CLASSES.map((cls, i) => (
            <tr key={i}>
              <td className="border border-slate-200 px-2 py-1">{cls.label}</td>
              <td className="border border-slate-200 px-2 py-1 text-center">
                +{cls.gain}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="mb-1 text-xs font-bold text-slate-700">本戦スコア評価値</h3>
      <div className="mb-4 text-xs leading-relaxed text-slate-600">
        <p>
          ラウンド1: 〜70万 floor((X−30万)×0.01) ／ 〜100万 4,000+floor((X−70万)×0.003) ／
          〜120万 4,900+floor((X−100万)×0.002) ／ 〜140万 5,300+floor((X−120万)×0.001)（上限5,500）
        </p>
        <p className="mt-1">
          ラウンド2: 〜90万 floor((X−60万)×0.004) ／ 〜150万 1,200+floor((X−90万)×0.008) ／
          〜200万 6,000+floor((X−150万)×0.002) ／ 〜240万 7,000+floor((X−200万)×0.001)（上限7,400）
        </p>
        <p className="mt-1">★は固定（ラウンド1: 180 / ラウンド2: 225）。</p>
      </div>

      <h3 className="mb-1 text-xs font-bold text-slate-700">
        選抜のステータス分配
      </h3>
      <table className="mb-2 w-full border-collapse text-xs tabular-nums">
        <thead>
          <tr>
            {["試験", "上昇基準値", "固定上昇値", "配分上昇値", "★上限"].map((h) => (
              <th key={h} className="border border-slate-300 bg-slate-100 px-2 py-1">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {EXAMS.map((exam) => (
            <tr key={exam.name}>
              <td className="border border-slate-200 px-2 py-1">{exam.name}</td>
              <td className="border border-slate-200 px-2 py-1 text-center">{exam.base}</td>
              <td className="border border-slate-200 px-2 py-1 text-center">
                {exam.fixed}（各タイプ+{exam.fixed / 3}）
              </td>
              <td className="border border-slate-200 px-2 py-1 text-center">{exam.dist}</td>
              <td className="border border-slate-200 px-2 py-1 text-center">
                {exam.starCap * 1.5}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mb-2 text-xs leading-relaxed text-slate-600">
        <p>
          分配: スコア昇順に 下位=floor(配分×スコア比)+固定÷3（端数は繰り越し）、
          中位=floor(繰り越し+配分×スコア比)+固定÷3、上位=基準値−下位−中位。
        </p>
        <p className="mt-1">
          スター性の近似式（X=合計スコア、いずれも最後に1.5倍）: 選抜1:
          (26+0.001X)×1.5（上限60）／ 選抜2: (40+X/1500)×1.5（72,500超は
          (70+0.000275X)×1.5、上限165）／ 選抜3: (13+X/2500)×1.5（180,000超は
          (65+X/9000)×1.5、上限165）
        </p>
        <p className="mt-1 text-slate-400">
          ※ 合計スコアが低く上昇基準値が上限に達しない場合の式は暫定版のため未実装（常に上限到達として計算）。
        </p>
      </div>
    </Modal>
  );
}