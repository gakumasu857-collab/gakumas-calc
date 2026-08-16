/**
 * 計算ページの左端タブ（発動回数タブの下）から開く、レッスン・授業（営業）・選抜エディタ。
 * レッスンページと同じストアを共有していて、どちらで編集しても同期する。
 * シナリオごとに内容が変わる:
 * - H.I.F.: 公開レッスン（メイン＋サブ＋SP）・授業・選抜スコア
 * - N.I.A.: 自主レッスン（単タイプ＋SP）・営業（営業先/成功度）・オーディション
 * - 初: レジェンドレッスン（単タイプ＋SP＋パーフェクト）・授業・試験
 */
import { useState } from "react";
import { CalendarCheck, Info, Sparkles } from "lucide-react";
import Modal from "@/components/Modal";
import NumberField from "@/components/NumberField";
import {
  CLASSES,
  distributeExam,
  EXAMS,
  examStar,
  LESSON_KIND_LABELS,
  LESSONS,
} from "@/data/schedule";
import {
  HATSU_CLASSES,
  HATSU_EXAMS,
  HATSU_LESSONS,
  NIA_AUDITION_CAPS,
  NIA_AUDITIONS,
  NIA_LESSONS,
  NIA_SALES,
  type NiaTag,
} from "@/data/scenarios";
import { optimizeSteppingForSlots } from "@/lib/autoOptimize";
import { buildAutoOptimizeInput } from "@/lib/buildOptimizeInput";
import type { SelectedSlot } from "@/lib/formation";
import type { useCalcResult } from "@/lib/useCalcResult";
import { TYPE_KEYS, TYPE_LABELS, type TypeKey } from "@/lib/useCalcSettings";

const TYPE_STYLE: Record<TypeKey, { on: string; off: string; head: string; chip: string }> = {
  vocal: {
    on: "bg-red-500 text-white shadow-sm",
    off: "bg-red-50 text-red-400 hover:bg-red-100",
    head: "text-red-600",
    chip: "bg-red-100 text-red-700",
  },
  dance: {
    on: "bg-blue-500 text-white shadow-sm",
    off: "bg-blue-50 text-blue-400 hover:bg-blue-100",
    head: "text-blue-600",
    chip: "bg-blue-100 text-blue-700",
  },
  visual: {
    on: "bg-yellow-400 text-yellow-950 shadow-sm",
    off: "bg-yellow-50 text-yellow-500 hover:bg-yellow-100",
    head: "text-yellow-600",
    chip: "bg-yellow-100 text-yellow-700",
  },
};

/** 選抜ごとのスライダー上限（1次3万・2次30万・3次50万） */
const EXAM_SLIDER_MAX = [30000, 300000, 500000] as const;

type CalcResult = ReturnType<typeof useCalcResult>;

export default function PlanEditDrawer({ r }: { r: CalcResult }) {
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [optMsg, setOptMsg] = useState<string | null>(null);
  const [optBusy, setOptBusy] = useState(false);
  const title =
    r.scenario === "niaMaster"
      ? "自主レッスン・営業・オーディション"
      : r.scenario === "hatsuLegend"
        ? "レッスン・授業・試験"
        : "レッスン・授業・選抜";

  /** 今の選択サポカ6枚を前提に、踏み方（授業・営業込み）だけを広域探索して適用 */
  const optimizePlan = () => {
    setOptBusy(true);
    setOptMsg(null);
    // 「計算中…」を先に描画させてから重い探索を回す
    setTimeout(() => {
      try {
        const slots = r.selected.slots.filter(
          (s): s is SelectedSlot => s !== null,
        );
        // 編成は固定するので BAN/固定フラグは無関係（空で渡す）
        const input = buildAutoOptimizeInput(
          r,
          { banned: new Set(), pinned: new Set() },
          r.calc.settings,
        );
        const result = optimizeSteppingForSlots(input, slots);
        if (!result) return;
        if (result.hif)
          r.schedule.setPlan(
            result.hif.lessons,
            result.hif.classTypes,
            result.hif.examScores,
          );
        if (result.nia)
          r.niaSchedule.setPlan(result.nia.lessons, result.nia.sales);
        if (result.hatsu)
          r.hatsuSchedule.setPlan(result.hatsu.lessons, result.hatsu.classTypes);
        setOptMsg(
          `今のサポカ編成での最適な踏み方に更新しました（合計ステ ${Math.round(result.cappedSum).toLocaleString()}）`,
        );
      } finally {
        setOptBusy(false);
      }
    }, 30);
  };

  return (
    <>
      {/* 左端の開くハンドル（下半分・縦書き。上半分は発動回数） */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="レッスン・授業・選抜を編集"
        className="fixed bottom-4 left-0 top-[calc(50%+4px)] z-30 flex w-8 items-center justify-center gap-1.5 rounded-r-xl bg-sky-600 text-xs font-bold text-white shadow-lg transition hover:bg-sky-500"
        style={{ writingMode: "vertical-rl" }}
      >
        <CalendarCheck size={14} />
        レッスン
      </button>

      {open && (
        <Modal title={title} onClose={() => setOpen(false)} widthClass="max-w-4xl">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={optimizePlan}
              disabled={optBusy}
              title="編成は変えずに、今の選択サポカ6枚で合計ステが最大になる踏み方・授業（営業）を探して適用します"
              className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-blue-500 disabled:opacity-60"
            >
              <Sparkles size={13} />
              {optBusy ? "計算中…" : "今のサポカ編成で踏み方を最適化"}
            </button>
            {r.scenario === "hif" && (
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                title="レッスン・授業・選抜・本戦の数値表と計算式を見る"
                className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                <Info size={13} />
                数値表・計算式
              </button>
            )}
            <span className="text-xs text-slate-400">
              レッスンページと共有（どちらで編集してもOK）。値は素の獲得量で、パラメータボーナス%は計算側で反映します。
            </span>
          </div>
          {optMsg && (
            <p className="mb-2 text-xs font-semibold text-blue-600">{optMsg}</p>
          )}
          {/* モーダルを開いたままでも最終ステ・評価値を追えるライブサマリー */}
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm tabular-nums">
            <span className="text-xs font-bold text-slate-500">
              最終ステータス
            </span>
            {TYPE_KEYS.map((t) => (
              <span key={t}>
                <span className={`text-xs font-bold ${TYPE_STYLE[t].head}`}>
                  {TYPE_LABELS[t]}
                </span>{" "}
                <b className="text-slate-800">
                  {Math.round(r.perType[t].current).toLocaleString()}
                </b>
              </span>
            ))}
            <span className="text-xs text-slate-500">
              合計{" "}
              <b className="text-sm text-slate-800">
                {Math.round(r.cappedSum).toLocaleString()}
              </b>
            </span>
            <span className="ml-auto text-xs text-slate-500">
              評価値{" "}
              <b className="text-base text-blue-600">
                {r.members.every((m) => m !== null) && r.selectedSet
                  ? r.rating.toLocaleString()
                  : "—"}
              </b>
            </span>
          </div>
          {r.scenario === "hif" && <HifEditor r={r} />}
          {r.scenario === "niaMaster" && <NiaEditor r={r} />}
          {r.scenario === "hatsuLegend" && <HatsuEditor r={r} />}
          {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
        </Modal>
      )}
    </>
  );
}

/** H.I.F.: 公開レッスン（メイン＋サブ切替＋SP）・授業・選抜スコア */
function HifEditor({ r }: { r: CalcResult }) {
  const schedule = r.schedule;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <BulkRow
          groups={[
            { label: "メイン一括", onPick: (t) => schedule.applyAllMain(t) },
            { label: "サブ一括", onPick: (t) => schedule.applyAllSubs(t) },
            { label: "授業一括", onPick: (t) => schedule.applyAllClasses(t) },
          ]}
        />
        <button
          type="button"
          onClick={() => schedule.clearAllLessons()}
          title="全レッスンを「踏まない」に戻す（メインの選択を解除）"
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
        >
          レッスン全クリア
        </button>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-4">
        <MiniTable
          head={["日程", ...TYPE_KEYS.map((t) => TYPE_LABELS[t]), "SP"]}
          rows={LESSONS.map((lesson, i) => {
            const pick = schedule.lessons[i];
            const spIndex = pick.sp ? 1 : 0;
            return [
              lesson.label,
              ...TYPE_KEYS.map((type) => (
                <span key={type} className="relative inline-block">
                  <MiniTypeButton
                    type={type}
                    selected={pick.main === type}
                    value={lesson.main[spIndex]}
                    title={
                      pick.main === type
                        ? "もう一度クリックで「踏まない」に戻す"
                        : undefined
                    }
                    onClick={() => {
                      if (pick.main === type) schedule.clearLessonMain(i);
                      else schedule.setLessonMain(i, type);
                    }}
                  />
                  {/* サブバッジ: クリックで残り2タイプを交互に切替 */}
                  {pick.main === type && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const others = TYPE_KEYS.filter((t) => t !== type);
                        const next =
                          others[(others.indexOf(pick.sub) + 1) % others.length];
                        schedule.setLessonSub(i, next);
                      }}
                      title={`サブ: ${TYPE_LABELS[pick.sub]}（クリックで切替）`}
                      className={`absolute -bottom-1 -right-1.5 z-10 flex h-4 min-w-6 items-center justify-center rounded px-0.5 text-[9px] font-bold ring-2 ring-white ${TYPE_STYLE[pick.sub].on}`}
                    >
                      {lesson.sub[spIndex]}
                    </button>
                  )}
                </span>
              )),
              <MiniSpToggle
                key="sp"
                on={pick.sp}
                onToggle={() => schedule.toggleLessonSp(i)}
              />,
            ];
          })}
        />
        <MiniTable
          head={["授業", ...TYPE_KEYS.map((t) => TYPE_LABELS[t])]}
          rows={CLASSES.map((cls, i) => [
            cls.label,
            ...TYPE_KEYS.map((type) => (
              <MiniTypeButton
                key={type}
                type={type}
                selected={schedule.classTypes[i] === type}
                value={cls.gain}
                onClick={() => schedule.setClassType(i, type)}
              />
            )),
          ])}
        />
      </div>

      {/* 選抜スコア（タイプ別・総スコアは自動合計・極振り付き） */}
      <Section title="選抜スコア">
        <div className="flex flex-col divide-y divide-slate-200">
          {EXAMS.map((exam, i) => {
            const scores = schedule.examScores[i];
            const total = TYPE_KEYS.reduce((sum, t) => sum + scores[t], 0);
            /** 極振り: 現在の総スコアを1タイプに全部 */
            const allIn = (type: TypeKey) => {
              const next: Record<TypeKey, number> = {
                vocal: 0,
                dance: 0,
                visual: 0,
              };
              next[type] = total;
              schedule.setExamScores(i, next);
            };
            return (
              <div
                key={exam.name}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2"
              >
                <span className="w-12 shrink-0 text-sm font-medium text-slate-800">
                  {exam.name}
                </span>
                {TYPE_KEYS.map((type) => (
                  <label
                    key={type}
                    className="flex items-center gap-1 text-xs text-slate-500"
                  >
                    <span className={`font-bold ${TYPE_STYLE[type].head}`}>
                      {TYPE_LABELS[type]}
                    </span>
                    <NumberField
                      value={scores[type]}
                      onChange={(v) => schedule.setExamScore(i, type, v)}
                      sliderMax={EXAM_SLIDER_MAX[i] ?? 500000}
                      className="w-24"
                    />
                  </label>
                ))}
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  極振り:
                  {TYPE_KEYS.map((type) => (
                    <button
                      key={type}
                      type="button"
                      disabled={total === 0}
                      onClick={() => allIn(type)}
                      title={`総スコアを全部${TYPE_LABELS[type]}に`}
                      className={`rounded-md px-1.5 py-1 text-xs font-bold transition disabled:opacity-40 ${TYPE_STYLE[type].chip} hover:brightness-95`}
                    >
                      {TYPE_LABELS[type].slice(0, 2)}
                    </button>
                  ))}
                </span>
                <span className="ml-auto text-xs tabular-nums text-slate-500">
                  総スコア{" "}
                  <b className="text-slate-800">{total.toLocaleString()}</b>
                </span>
                {/* この配分での上昇量とスター性 */}
                {total > 0 && (
                  <span className="w-full text-[11px] tabular-nums text-slate-500">
                    →{" "}
                    {(() => {
                      const dist = distributeExam(i, scores, TYPE_KEYS);
                      return TYPE_KEYS.map((t) => (
                        <span key={t} className="mr-2">
                          <b className={TYPE_STYLE[t].head}>
                            {TYPE_LABELS[t]}
                          </b>{" "}
                          +{Math.round(dist[t])}
                        </span>
                      ));
                    })()}
                    <span className="text-violet-600">
                      ★{examStar(i, total)}
                    </span>
                    <span className="ml-2 text-slate-400">
                      ※パラメータボーナス%は別途上乗せ
                    </span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] tabular-nums text-slate-500">
          レッスン・授業のPポイント合計:{" "}
          <b className="text-cyan-700">{r.resources.pLesson}</b> ／
          レッスンのスター性: <b className="text-violet-600">{r.starParts.lesson}</b>
        </p>
      </Section>
    </div>
  );
}

/** N.I.A.: 自主レッスン・営業・オーディション（1次2次＋最終） */
function NiaEditor({ r }: { r: CalcResult }) {
  const nia = r.niaSchedule;
  const tag: NiaTag = r.ranks?.tag === "特化" ? "skew" : "flat";
  const capOf = (auditionIndex: number, type: TypeKey) =>
    NIA_AUDITION_CAPS[tag][auditionIndex][r.typeRanks[type] - 1];
  return (
    <div className="flex flex-col gap-4">
      <BulkRow
        groups={[
          { label: "レッスン一括", onPick: (t) => nia.applyAllMain(t) },
          { label: "営業一括", onPick: (t) => nia.applyAllSales(t) },
        ]}
      />
      <div className="flex flex-wrap gap-x-8 gap-y-4">
        <MiniTable
          head={["レッスン", ...TYPE_KEYS.map((t) => TYPE_LABELS[t]), "SP"]}
          rows={NIA_LESSONS.map((lesson, i) => {
            const pick = nia.lessons[i];
            const value = lesson.value[pick.sp ? 1 : 0];
            return [
              lesson.label,
              ...TYPE_KEYS.map((type) => (
                <MiniTypeButton
                  key={type}
                  type={type}
                  selected={pick.main === type}
                  value={value}
                  onClick={() => nia.setLessonMain(i, type)}
                />
              )),
              <MiniSpToggle
                key="sp"
                on={pick.sp}
                onToggle={() => nia.toggleLessonSp(i)}
              />,
            ];
          })}
        />
        <MiniTable
          head={["営業", ...TYPE_KEYS.map((t) => TYPE_LABELS[t]), "営業先", "成功度"]}
          rows={NIA_SALES.map((sale, i) => {
            const pick = nia.sales[i];
            return [
              sale.label,
              ...TYPE_KEYS.map((type) => (
                <MiniTypeButton
                  key={type}
                  type={type}
                  selected={pick.type === type}
                  value={sale.value}
                  onClick={() => nia.setSale(i, { type })}
                />
              )),
              <MiniToggle
                key="resort"
                on={pick.resort}
                onLabel="リゾート"
                offLabel="その他"
                onClass="border-teal-400 bg-teal-100 text-teal-700"
                onToggle={() => nia.setSale(i, { resort: !pick.resort })}
              />,
              <MiniToggle
                key="great"
                on={pick.great}
                onLabel="大成功"
                offLabel="成功"
                onClass="border-amber-400 bg-amber-100 text-amber-700"
                onToggle={() => nia.setSale(i, { great: !pick.great })}
              />,
            ];
          })}
        />
      </div>

      {/* オーディション（1次・2次の素点＋投票、最終のタイプ別スコア） */}
      <Section title="オーディション">
        <div className="flex flex-col divide-y divide-slate-200">
          {NIA_AUDITIONS.map((audition, i) => (
            <div
              key={audition.name}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2"
            >
              <span className="w-12 shrink-0 text-sm font-medium text-slate-800">
                {audition.name}
              </span>
              {TYPE_KEYS.map((type) => (
                <label
                  key={type}
                  className="flex items-center gap-1 text-xs text-slate-500"
                >
                  <span className={`font-bold ${TYPE_STYLE[type].head}`}>
                    {TYPE_LABELS[type]}
                  </span>
                  <NumberField
                    value={nia.auditions[i][type]}
                    onChange={(v) => nia.setAudition(i, type, v)}
                    max={capOf(i, type)}
                    className="w-16"
                  />
                  <span className="text-slate-400">/{capOf(i, type)}</span>
                </label>
              ))}
              <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
                投票
                <NumberField
                  value={nia.auditionVotes[i]}
                  onChange={(v) => nia.setAuditionVotes(i, v)}
                  sliderMax={20000}
                  className="w-20"
                />
              </label>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
            <span className="w-12 shrink-0 text-sm font-medium text-slate-800">
              最終
            </span>
            {TYPE_KEYS.map((type) => (
              <label
                key={type}
                className="flex items-center gap-1 text-xs text-slate-500"
              >
                <span className={`font-bold ${TYPE_STYLE[type].head}`}>
                  {TYPE_LABELS[type]}
                </span>
                <NumberField
                  value={nia.finalScores[type]}
                  onChange={(v) => nia.setFinalScore(type, v)}
                  sliderMax={500000}
                  className="w-24"
                />
              </label>
            ))}
            <span className="ml-auto text-[11px] text-slate-400">
              スコアから素点・投票を自動導出
            </span>
          </div>
        </div>
      </Section>
    </div>
  );
}

/** 初: レジェンドレッスン・授業・試験 */
function HatsuEditor({ r }: { r: CalcResult }) {
  const hatsu = r.hatsuSchedule;
  return (
    <div className="flex flex-col gap-4">
      <BulkRow
        groups={[
          { label: "レッスン一括", onPick: (t) => hatsu.applyAllMain(t) },
          { label: "授業一括", onPick: (t) => hatsu.applyAllClasses(t) },
        ]}
      />
      <div className="flex flex-wrap gap-x-8 gap-y-4">
        <MiniTable
          head={["レッスン", ...TYPE_KEYS.map((t) => TYPE_LABELS[t]), "SP", "パフェ"]}
          rows={HATSU_LESSONS.map((lesson, i) => {
            const pick = hatsu.lessons[i];
            const spIndex = pick.sp ? 1 : 0;
            const value = pick.perfect
              ? lesson.perfectMain[spIndex]
              : lesson.clear[spIndex];
            return [
              lesson.label,
              ...TYPE_KEYS.map((type) => (
                <MiniTypeButton
                  key={type}
                  type={type}
                  selected={pick.main === type}
                  value={value}
                  onClick={() => hatsu.setLessonMain(i, type)}
                />
              )),
              <MiniSpToggle
                key="sp"
                on={pick.sp}
                onToggle={() => hatsu.toggleLessonSp(i)}
              />,
              <MiniToggle
                key="perfect"
                on={pick.perfect}
                onLabel="パフェ"
                offLabel="クリア"
                onClass="border-violet-400 bg-violet-100 text-violet-700"
                onToggle={() => hatsu.toggleLessonPerfect(i)}
              />,
            ];
          })}
        />
        <MiniTable
          head={["授業", ...TYPE_KEYS.map((t) => TYPE_LABELS[t])]}
          rows={HATSU_CLASSES.map((cls, i) => [
            cls.label,
            ...TYPE_KEYS.map((type) => (
              <MiniTypeButton
                key={type}
                type={type}
                selected={hatsu.classTypes[i] === type}
                value={cls.gain}
                onClick={() => hatsu.setClassType(i, type)}
              />
            )),
          ])}
        />
      </div>

      {/* 試験（順位＋スコア） */}
      <Section title="中間・最終試験">
        <div className="flex flex-col divide-y divide-slate-200">
          {HATSU_EXAMS.map((exam, i) => {
            const isMid = i === 0;
            const rank = isMid ? hatsu.midRank : hatsu.finalRank;
            const score = isMid ? hatsu.midScore : hatsu.finalScore;
            return (
              <div
                key={exam.name}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2"
              >
                <span className="w-20 shrink-0 text-sm font-medium text-slate-800">
                  {exam.name}
                </span>
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  順位
                  <select
                    value={rank}
                    onChange={(e) =>
                      hatsu.update(
                        isMid
                          ? { midRank: Number(e.target.value) }
                          : { finalRank: Number(e.target.value) },
                      )
                    }
                    className="rounded-lg border border-slate-300 bg-white px-1.5 py-1 text-sm text-slate-700"
                  >
                    {exam.ranks.map((n) => (
                      <option key={n} value={n}>
                        {n === 4 ? "4位以下" : `${n}位`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  スコア
                  <NumberField
                    value={score}
                    onChange={(v) =>
                      hatsu.update(isMid ? { midScore: v } : { finalScore: v })
                    }
                    sliderMax={isMid ? 250000 : 2000000}
                    className="w-28"
                  />
                </label>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

/** 数値表と計算式の開示モーダル（旧レッスンページから移植。H.I.F.用） */
function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="数値表・計算式" onClose={onClose} widthClass="max-w-3xl">
      <NumbersTables />
    </Modal>
  );
}

/** レッスン・授業・本戦・選抜の数値表本体（ヘルプモーダルからも使う） */
export function NumbersTables() {
  const th = "border border-slate-300 bg-slate-100 px-2 py-1";
  const td = "border border-slate-200 px-2 py-1";
  const tdC = `${td} text-center`;
  return (
    <>
      <p className="mb-3 text-xs text-slate-500">
        ※ コミュニティ調べの暫定値・近似式です。
        サブパラメータは選択した1タイプに入ります。
        パラメータボーナス%はここでは適用せず、計算ページで反映します。
      </p>

      <h3 className="mb-1 text-xs font-bold text-slate-700">公開レッスン</h3>
      <table className="mb-4 w-full border-collapse text-xs tabular-nums">
        <thead>
          <tr>
            {["日程", "種別", "メイン(非SP/SP)", "サブ(非SP/SP)", "★(非SP/SP)", "P"].map(
              (h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {LESSONS.map((lesson, i) => (
            <tr key={i}>
              <td className={td}>{lesson.label}</td>
              <td className={tdC}>{LESSON_KIND_LABELS[lesson.kind]}</td>
              <td className={tdC}>
                {lesson.main[0]} / {lesson.main[1]}
              </td>
              <td className={tdC}>
                {lesson.sub[0]} / {lesson.sub[1]}
              </td>
              <td className={tdC}>
                {lesson.star[0]} / {lesson.star[1]}
              </td>
              <td className={tdC}>{lesson.p}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="mb-1 text-xs font-bold text-slate-700">授業</h3>
      <table className="mb-4 w-full border-collapse text-xs tabular-nums">
        <tbody>
          {CLASSES.map((cls, i) => (
            <tr key={i}>
              <td className={td}>{cls.label}</td>
              <td className={tdC}>+{cls.gain}</td>
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

      <h3 className="mb-1 text-xs font-bold text-slate-700">選抜のステータス分配</h3>
      <table className="mb-2 w-full border-collapse text-xs tabular-nums">
        <thead>
          <tr>
            {["試験", "上昇基準値", "固定上昇値", "配分上昇値", "★上限"].map((h) => (
              <th key={h} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {EXAMS.map((exam) => (
            <tr key={exam.name}>
              <td className={td}>{exam.name}</td>
              <td className={tdC}>{exam.base}</td>
              <td className={tdC}>
                {exam.fixed}（各タイプ+{exam.fixed / 3}）
              </td>
              <td className={tdC}>{exam.dist}</td>
              <td className={tdC}>{exam.starCap * 1.5}</td>
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
    </>
  );
}

/** 一括選択の行（グループごとにタイプ3ボタン） */
function BulkRow({
  groups,
}: {
  groups: { label: string; onPick: (type: TypeKey) => void }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
      {groups.map((g) => (
        <span key={g.label} className="flex items-center gap-1">
          {g.label}:
          {TYPE_KEYS.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => g.onPick(type)}
              className={`rounded-md px-2 py-1 text-xs font-bold transition ${TYPE_STYLE[type].chip} hover:brightness-95`}
            >
              {TYPE_LABELS[type]}
            </button>
          ))}
        </span>
      ))}
    </div>
  );
}

/** 見出し付きの区切り */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 p-3">
      <h3 className="mb-1 text-xs font-bold text-slate-700">{title}</h3>
      {children}
    </section>
  );
}

/** ヘッダー＋行（先頭列はラベル・残りはボタン）を並べる小さい表 */
function MiniTable({
  head,
  rows,
}: {
  head: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-auto text-xs">
        <thead>
          <tr className="border-b border-slate-300 text-left font-semibold text-slate-500">
            {head.map((h, i) => (
              <th
                key={i}
                className={`px-1.5 py-1 font-semibold ${
                  i === 0 ? "pr-3 text-left" : "text-center"
                } ${TYPE_KEYS.some((t) => TYPE_LABELS[t] === h) ? TYPE_STYLE[TYPE_KEYS.find((t) => TYPE_LABELS[t] === h)!].head : ""}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map((cells, i) => (
            <tr key={i}>
              {cells.map((cell, j) => (
                <td
                  key={j}
                  className={`px-1.5 py-1 ${j === 0 ? "whitespace-nowrap pr-3 font-medium text-slate-700" : "text-center"}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** タイプ選択の小ボタン（値表示つき） */
function MiniTypeButton({
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
      className={`h-8 w-10 rounded-md text-xs font-bold tabular-nums transition ${
        selected ? TYPE_STYLE[type].on : TYPE_STYLE[type].off
      }`}
    >
      {value}
    </button>
  );
}

/** SPトグル（ON=濃い灰色×白文字、OFF=白背景×打ち消し線） */
function MiniSpToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={on ? "SPレッスン（クリックで通常に）" : "通常レッスン（クリックでSPに）"}
      className={`h-7 w-8 rounded-md border text-[10px] font-bold transition ${
        on
          ? "border-slate-700 bg-slate-700 text-white hover:bg-slate-600"
          : "border-slate-300 bg-white text-slate-500 line-through decoration-2 hover:bg-slate-50"
      }`}
    >
      SP
    </button>
  );
}

/** 2値トグル（営業先・成功度・パーフェクト用） */
function MiniToggle({
  on,
  onLabel,
  offLabel,
  onClass,
  onToggle,
}: {
  on: boolean;
  onLabel: string;
  offLabel: string;
  onClass: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`h-7 rounded-md border px-1.5 text-[10px] font-bold transition ${
        on ? onClass : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {on ? onLabel : offLabel}
    </button>
  );
}
