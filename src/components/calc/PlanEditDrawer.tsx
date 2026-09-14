/**
 * 計算ページの左端タブ（発動回数タブの下）から開く、レッスン・授業（営業）・選抜エディタ。
 * レッスンページと同じストアを共有していて、どちらで編集しても同期する。
 * シナリオごとに内容が変わる:
 * - H.I.F.: 公開レッスン（メイン＋サブ＋SP）・授業・選抜スコア
 * - N.I.A.: 自主レッスン（単タイプ＋SP）・営業（営業先/成功度）・オーディション
 * - 初: レジェンドレッスン（単タイプ＋SP＋パーフェクト）・授業・試験
 */
import { useState } from "react";
import { Info, Sparkles } from "lucide-react";
import Modal from "@/components/Modal";
import NumberField from "@/components/NumberField";
import ScheduleCalendarView from "@/components/ScheduleCalendarView";
import {
  CLASSES,
  distributeExam,
  EXAMS,
  examBaseFromRise,
  examRiseWithParabo,
  examStar,
  LESSON_KIND_LABELS,
  LESSONS,
} from "@/data/schedule";
import {
  HATSU_CLASSES,
  HATSU_EXAMS,
  HATSU_LESSONS,
  NIA_AUDITION_CAPS,
  type ScenarioKey,
  NIA_AUDITIONS,
  NIA_LESSONS,
  NIA_SALES,
  niaFinaleStat,
  niaFinaleVotes,
  type NiaTag,
  hatsuLessonGains,
  hatsuLessonScoreCap,
} from "@/data/scenarios";
import { missingCalcInputs, notReadyTitle } from "@/lib/optimizeReady";
import type { useCalcResult } from "@/lib/useCalcResult";
import { useOptimizePlan } from "@/lib/useOptimizePlan";
import { subAppearProb } from "@/lib/useSchedule";
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

/**
 * 踏み方エディタ（モーダル）。計算ページの「サポカ編成と踏み方」の「レッスン等の踏み方」から開く
 * （open / onClose は親が持つ。以前の左端縦タブは廃止）。
 */
export default function PlanEditDrawer({
  r,
  open,
  onClose,
}: {
  r: CalcResult;
  open: boolean;
  onClose: () => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const { run: optimizePlan, busy: optBusy, msg: optMsg } = useOptimizePlan(r);
  // 踏み方の最適化も、シナリオ・Pアイドル・育成セット・メモリーがそろうまで押せない
  const missingInputs = missingCalcInputs(r);
  const optimizeReady = missingInputs.length === 0;
  const title =
    r.scenario === "niaMaster"
      ? "自主レッスン・営業・オーディション"
      : r.scenario === "hatsuLegend"
        ? "レッスン・授業・試験"
        : "レッスン・授業・選抜";

  return (
    <>
      {open && (
        <Modal title={title} onClose={onClose} widthClass="max-w-4xl">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => optimizePlan()}
              disabled={optBusy || !optimizeReady}
              title={
                notReadyTitle(missingInputs) ??
                "編成は変えずに、今の選択サポカ6枚で合計ステが最大になる踏み方・授業（営業）を探して適用します"
              }
              className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles size={13} />
              {optBusy ? "計算中…" : "今のサポカ編成で踏み方を最適化"}
            </button>
            {!optimizeReady && (
              <span className="text-xs font-semibold text-amber-600">
                最適化には {missingInputs.join("・")} の選択が必要です
              </span>
            )}
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
                </b>{" "}
                <span className="text-[11px] text-slate-400">
                  (パラボ{r.perType[t].startPct}%)
                </span>
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
          {helpOpen && (
            <HelpModal scenario={r.scenario} onClose={() => setHelpOpen(false)} />
          )}
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
            { label: "踏むタイプ一括", onPick: (t) => schedule.applyAllMain(t) },
            { label: "2ndタイプ一括", onPick: (t) => schedule.applyAllSubs(t) },
            { label: "授業一括", onPick: (t) => schedule.applyAllClasses(t) },
          ]}
        />
        <button
          type="button"
          onClick={() => schedule.clearAllLessons()}
          title="全レッスンを「踏まない」に戻す（踏むタイプの選択を解除）"
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
                    value={pick.main === type ? lesson.main[spIndex] : 0}
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
                      title={`2ndタイプ: ${TYPE_LABELS[pick.sub]}（出現率${Math.round(subAppearProb(type, pick.sub, r.typeRanks) * 100)}%・クリックで切替）`}
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
                value={schedule.classTypes[i] === type ? cls.gain : 0}
                onClick={() => schedule.setClassType(i, type)}
              />
            )),
          ])}
        />
      </div>

      {/* 選抜（タイプ別スコア、または上昇ステを直接入力。選抜ごとに切り替え） */}
      <Section title="選抜">
        <p className="mb-1 text-[11px] leading-relaxed text-slate-500">
          スコアを入れると分配式で上昇ステを出します。実際の上昇量が分かっているときは「ステ」に切り替えて、
          ゲームのログに出る上昇幅（パラボ込み）をそのまま入力。今の編成のパラボ%で元のステに逆算します。ステ入力の選抜は自動探索で動かしません。
        </p>
        <div className="flex flex-col divide-y divide-slate-200">
          {EXAMS.map((exam, i) => {
            const scores = schedule.examScores[i];
            const stats = schedule.examStats[i];
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
            const modeBtn = (mode: "score" | "stat", label: string) => (
              <button
                type="button"
                onClick={() => schedule.setExamMode(i, mode)}
                className={`rounded-md px-2 py-0.5 text-[11px] font-bold transition ${
                  (stats ? "stat" : "score") === mode
                    ? "bg-blue-600 text-white"
                    : "text-slate-500 hover:bg-slate-200"
                }`}
              >
                {label}
              </button>
            );
            return (
              <div
                key={exam.name}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2"
              >
                <span className="w-12 shrink-0 text-sm font-medium text-slate-800">
                  {exam.name}
                </span>
                {/* 入力の切り替え（スコア／ステ） */}
                <span className="flex shrink-0 items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
                  {modeBtn("score", "スコア")}
                  {modeBtn("stat", "ステ")}
                </span>
                {stats ? (
                  <>
                    {/* スコアはスター性の計算にだけ使う。ログの「1位スコア」をそのまま */}
                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      スコア
                      <NumberField
                        value={total}
                        onChange={(v) => schedule.setExamTotalScore(i, v)}
                        sliderMax={EXAM_SLIDER_MAX[i] ?? 500000}
                        className="w-24"
                      />
                      <span className="text-violet-600">★{examStar(i, total)}</span>
                    </label>
                    {/* 上の段: ゲームのログに出る上昇幅（パラボ込み）。入れると今の編成のパラボ%で元のステに逆算して保存 */}
                    <span className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="w-40 shrink-0 text-[11px] font-bold text-slate-600">
                        ログの上昇幅（パラボ込み）
                      </span>
                      {TYPE_KEYS.map((type) => {
                        const pct = r.paraboDetail[type].totalPct;
                        return (
                          <label
                            key={type}
                            className="flex items-center gap-1 text-xs text-slate-500"
                          >
                            <span className={`font-bold ${TYPE_STYLE[type].head}`}>
                              {TYPE_LABELS[type]}
                            </span>
                            <RiseField
                              value={examRiseWithParabo(stats[type], pct)}
                              onChange={(rise) =>
                                schedule.setExamStat(i, type, examBaseFromRise(rise, pct))
                              }
                            />
                            <span className="text-[10px] tabular-nums text-slate-400">
                              +{pct}%
                            </span>
                          </label>
                        );
                      })}
                    </span>
                    {/* 下の段: パラボを除いた元のステ（計算に使う値）。直接打ち込んでもよい */}
                    <span className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="w-40 shrink-0 text-[11px] font-bold text-slate-600">
                        元のステ（パラボ抜き）
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
                            value={stats[type]}
                            onChange={(v) => schedule.setExamStat(i, type, v)}
                            max={999}
                            sliderMax={exam.base}
                            className="w-20"
                          />
                        </label>
                      ))}
                      <span className="text-xs tabular-nums text-slate-500">
                        合計{" "}
                        <b className="text-slate-800">
                          {TYPE_KEYS.reduce((sum, t) => sum + stats[t], 0)}
                        </b>
                        <span className="text-slate-400">（スコア入力の基準値は {exam.base}）</span>
                      </span>
                    </span>
                    <span className="w-full text-[11px] leading-relaxed text-slate-400">
                      上の段にログの値を入れると、今の編成のパラボ%で下の段（計算に使う値）を逆算します。編成を変えると上の段の表示も変わります。
                    </span>
                  </>
                ) : (
                  <>
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
                  </>
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
                  value={pick.main === type ? value : 0}
                  title={
                    pick.main === type
                      ? "もう一度クリックで「踏まない」に戻す"
                      : undefined
                  }
                  onClick={() =>
                    nia.setLessonMain(i, pick.main === type ? null : type)
                  }
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
                  value={pick.type === type ? sale.value : 0}
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
      <Section title="オーディション（1次・2次は上がるステを入力 / 最終はスコアを入力）">
        <div className="flex flex-col divide-y divide-slate-200">
          {NIA_AUDITIONS.map((audition, i) => (
            <div
              key={audition.name}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2"
            >
              <span className="w-24 shrink-0 text-sm font-medium text-slate-800">
                {audition.name}
                <span className="ml-1 text-[10px] font-normal text-slate-400">
                  ステ上昇
                </span>
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
                    value={Math.min(nia.auditions[i][type], capOf(i, type))}
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
          <div className="flex flex-col gap-1 py-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="w-24 shrink-0 text-sm font-medium text-slate-800">
                最終
                <span className="ml-1 text-[10px] font-normal text-slate-400">
                  スコア
                </span>
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
            </div>
            <div className="text-[11px] text-slate-500">
              スコアから導出:{" "}
              {TYPE_KEYS.map((type) => (
                <span key={type} className="mr-2">
                  <span className={`font-bold ${TYPE_STYLE[type].head}`}>
                    {TYPE_LABELS[type]}
                  </span>
                  +{niaFinaleStat(tag, r.typeRanks[type], nia.finalScores[type])}
                </span>
              ))}
              <span className="text-slate-400">
                / 投票 +
                {niaFinaleVotes(
                  TYPE_KEYS.reduce((s, t) => s + nia.finalScores[t], 0),
                ).toLocaleString()}
              </span>
            </div>
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
      <p className="text-[11px] leading-relaxed text-slate-500">
        初のレッスンは、レッスン中に出した点数がそのまま踏んだタイプの素ステになります（上限まで出せばパーフェクト）。
        クリアライン（数値表の「クリア」）を超えた分は残り2タイプにも同じだけ入ります。どちらもパラボが掛かります。
      </p>
      <div className="flex flex-wrap gap-x-8 gap-y-4">
        <MiniTable
          head={["レッスン", ...TYPE_KEYS.map((t) => TYPE_LABELS[t]), "SP", "点数"]}
          rows={HATSU_LESSONS.map((lesson, i) => {
            const pick = hatsu.lessons[i];
            const cap = hatsuLessonScoreCap(i, pick.sp);
            const g = hatsuLessonGains(i, pick.sp, pick.score);
            const mainValue = g.main;
            // クリアラインを超えた分は踏んでいないタイプにも入る
            const offValue = pick.main ? g.other : 0;
            return [
              lesson.label,
              ...TYPE_KEYS.map((type) => (
                <MiniTypeButton
                  key={type}
                  type={type}
                  selected={pick.main === type}
                  value={pick.main === type ? mainValue : offValue}
                  title={
                    pick.main === type
                      ? "もう一度クリックで「踏まない」に戻す"
                      : undefined
                  }
                  onClick={() =>
                    hatsu.setLessonMain(i, pick.main === type ? null : type)
                  }
                />
              )),
              <MiniSpToggle
                key="sp"
                on={pick.sp}
                onToggle={() => hatsu.toggleLessonSp(i)}
              />,
              <span key="score" className="flex items-center gap-1">
                <NumberField
                  value={pick.score ?? cap}
                  onChange={(v) => hatsu.setLessonScore(i, v >= cap ? undefined : v)}
                  max={cap}
                  sliderMax={cap}
                  className="w-20"
                />
                <MiniToggle
                  on={pick.score === undefined}
                  onLabel="パフェ"
                  offLabel={`クリア${lesson.clear[pick.sp ? 1 : 0]}`}
                  onClass="border-violet-400 bg-violet-100 text-violet-700"
                  onToggle={() => hatsu.toggleLessonPerfect(i)}
                />
              </span>,
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
                value={hatsu.classTypes[i] === type ? cls.gain : 0}
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
                      hatsu.update(
                        isMid
                          ? { midScore: Math.min(v, 200000) }
                          : { finalScore: v },
                      )
                    }
                    max={isMid ? 200000 : undefined}
                    sliderMax={isMid ? 200000 : 2000000}
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

/** 数値表と計算式の開示モーダル（シナリオ別） */
function HelpModal({
  onClose,
  scenario,
}: {
  onClose: () => void;
  scenario: ScenarioKey;
}) {
  return (
    <Modal title="数値表・計算式" onClose={onClose} widthClass="max-w-3xl">
      <NumbersTables scenario={scenario} />
    </Modal>
  );
}

/** レッスン・授業・試験の数値表本体（ヘルプモーダルからも使う）。シナリオ別 */
export function NumbersTables({
  scenario = "hif",
}: {
  scenario?: ScenarioKey;
}) {
  return (
    <>
      <h3 className="mb-1 text-xs font-bold text-slate-700">スケジュール</h3>
      <div className="mb-4">
        <ScheduleCalendarView scenario={scenario} />
      </div>
      {scenario === "niaMaster" ? (
        <NiaNumbers />
      ) : scenario === "hatsuLegend" ? (
        <HatsuNumbers />
      ) : (
        <HifNumbers />
      )}
    </>
  );
}

function HifNumbers() {
  const th = "border border-slate-300 bg-slate-100 px-2 py-1";
  const td = "border border-slate-200 px-2 py-1";
  const tdC = `${td} text-center`;
  return (
    <>
      <p className="mb-3 text-xs text-slate-500">
        ※ コミュニティ調べの暫定値・近似式です。
        サブパラメータは選択した1タイプに入ります。2ndタイプの出現は
        踏むタイプ以外の2タイプのうち審査基準が高い方75%／低い方25%の抽選で、
        実現確率の表示に反映しています。
        パラメータボーナス%はここでは適用せず、計算ページで反映します。
      </p>

      <h3 className="mb-1 text-xs font-bold text-slate-700">公開レッスン</h3>
      <table className="mb-4 w-full border-collapse text-xs tabular-nums">
        <thead>
          <tr>
            {["日程", "種別", "踏むタイプ(非SP/SP)", "2ndタイプ(非SP/SP)", "★(非SP/SP)", "P"].map(
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
                {Math.floor(lesson.star[0])} / {lesson.star[1]}
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
          ラウンド1: 〜70万 (X−30万)×0.01 ／ 〜100万 4,000+(X−70万)×0.003 ／
          〜120万 4,900+(X−100万)×0.002 ／ 〜140万 5,300+(X−120万)×0.001（上限5,500。小数点以下は切り捨て）
        </p>
        <p className="mt-1">
          ラウンド2: 〜90万 (X−60万)×0.004 ／ 〜150万 1,200+(X−90万)×0.008 ／
          〜200万 6,000+(X−150万)×0.002 ／ 〜240万 7,000+(X−200万)×0.001（上限7,400。小数点以下は切り捨て）
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
          分配: スコア昇順に 下位=配分×スコア比（切り捨て）+固定÷3（端数は繰り越し）、
          中位=（繰り越し+配分×スコア比）（切り捨て）+固定÷3、上位=基準値−下位−中位。
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

const NUM_TH = "border border-slate-300 bg-slate-100 px-2 py-1";
const NUM_TD = "border border-slate-200 px-2 py-1";
const NUM_TDC = `${NUM_TD} text-center`;

/** N.I.A.（マスター）の数値表と計算式 */
function NiaNumbers() {
  return (
    <>
      <p className="mb-3 text-xs text-slate-500">
        ※ コミュニティ調べの暫定値・近似式です。パラメータボーナス%はここでは適用せず、計算ページで反映します。
      </p>
      <h3 className="mb-1 text-xs font-bold text-slate-700">自主レッスン（選んだ1タイプのみ上昇）</h3>
      <table className="mb-4 w-full border-collapse text-xs tabular-nums">
        <thead>
          <tr>
            {["時期", "通常/SP", "P"].map((h) => (
              <th key={h} className={NUM_TH}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {NIA_LESSONS.map((l, i) => (
            <tr key={i}>
              <td className={NUM_TD}>{l.label}</td>
              <td className={NUM_TDC}>{l.value[0]} / {l.value[1]}</td>
              <td className={NUM_TDC}>{l.p}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="mb-1 text-xs font-bold text-slate-700">営業（選んだ1タイプのみ上昇・パラボ無効）</h3>
      <table className="mb-4 w-full border-collapse text-xs tabular-nums">
        <thead>
          <tr>
            {["時期", "ステ", "リゾート(成功/大成功)", "その他(成功/大成功)"].map((h) => (
              <th key={h} className={NUM_TH}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {NIA_SALES.map((sale, i) => (
            <tr key={i}>
              <td className={NUM_TD}>{sale.label}</td>
              <td className={NUM_TDC}>+{sale.value}</td>
              <td className={NUM_TDC}>{sale.votes.resort[0].toLocaleString()} / {sale.votes.resort[1].toLocaleString()}票</td>
              <td className={NUM_TDC}>{sale.votes.other[0].toLocaleString()} / {sale.votes.other[1].toLocaleString()}票</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="mb-1 text-xs font-bold text-slate-700">オーディションのステ上限（流行順位別）</h3>
      <table className="mb-2 w-full border-collapse text-xs tabular-nums">
        <thead>
          <tr>
            {["審査タイプ", "回", "流行1位", "2位", "3位"].map((h) => (
              <th key={h} className={NUM_TH}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(["flat", "skew"] as const).flatMap((tag) =>
            NIA_AUDITION_CAPS[tag].map((caps, i) => (
              <tr key={tag + i}>
                <td className={NUM_TD}>{i === 0 ? (tag === "flat" ? "バランス" : "特化") : ""}</td>
                <td className={NUM_TDC}>{["1次", "2次", "最終"][i]}</td>
                {caps.map((c, j) => (
                  <td key={j} className={NUM_TDC}>{c}</td>
                ))}
              </tr>
            )),
          )}
        </tbody>
      </table>
      <div className="mb-2 text-xs leading-relaxed text-slate-600">
        <p>評価値 = ステ合計（各2600まで）× 2.3（小数点以下は切り捨て）＋ ファン投票数換算。</p>
        <p className="mt-1">
          ファン投票数換算: 〜2万 ×0.1 ／ 〜4万 ×0.085+300 ／ 〜6万 ×0.07+900 ／ 〜8万 ×0.065+1,200 ／
          〜10万 ×0.06+1,600 ／ 〜12万 ×0.05+2,600 ／ 〜14万 ×0.04+3,800 ／ それ以上 ×0.03+5,200（切り捨て）
        </p>
        <p className="mt-1">札（スキルカード獲得）2枚ごとに+3,000票（端数の1枚は無効）。</p>
        <p className="mt-1">最終オーディションはスコアからステ素点（流行順位別の式）と投票数を自動導出。</p>
      </div>
    </>
  );
}

/** 定期公演『初』（レジェンド）の数値表と計算式 */
function HatsuNumbers() {
  return (
    <>
      <p className="mb-3 text-xs text-slate-500">
        ※ コミュニティ調べの暫定値・近似式です。パラメータボーナス%はここでは適用せず、計算ページで反映します。
      </p>
      <h3 className="mb-1 text-xs font-bold text-slate-700">レジェンドレッスン</h3>
      <table className="mb-2 w-full border-collapse text-xs tabular-nums">
        <thead>
          <tr>
            {["時期", "クリア(非SP/SP)", "パフェ踏みタイプ(非SP/SP)", "パフェ他タイプ(非SP/SP)", "P"].map((h) => (
              <th key={h} className={NUM_TH}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HATSU_LESSONS.map((l, i) => (
            <tr key={i}>
              <td className={NUM_TD}>{l.label}</td>
              <td className={NUM_TDC}>{l.clear[0]} / {l.clear[1]}</td>
              <td className={NUM_TDC}>{l.perfectMain[0]} / {l.perfectMain[1]}</td>
              <td className={NUM_TDC}>{l.perfectSub[0]} / {l.perfectSub[1]}</td>
              <td className={NUM_TDC}>{l.p}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mb-4 text-xs text-slate-500">
        ※ パーフェクト時は踏んだタイプ以外にも「パフェ他タイプ」の値が入る。パフェ値はチャレンジPアイテムでレッスン上限を最大(+90)にした時の数値。
      </p>
      <h3 className="mb-1 text-xs font-bold text-slate-700">授業（選んだ1タイプ）</h3>
      <table className="mb-4 w-full border-collapse text-xs tabular-nums">
        <tbody>
          {HATSU_CLASSES.map((cls, i) => (
            <tr key={i}>
              <td className={NUM_TD}>{cls.label}</td>
              <td className={NUM_TDC}>+{cls.gain}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="mb-1 text-xs font-bold text-slate-700">試験（順位で全タイプ一律上昇）</h3>
      <table className="mb-2 w-full border-collapse text-xs tabular-nums">
        <thead>
          <tr>
            {["試験", "1位", "2位", "3位", "4位以下"].map((h) => (
              <th key={h} className={NUM_TH}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HATSU_EXAMS.map((exam) => (
            <tr key={exam.name}>
              <td className={NUM_TD}>{exam.name}</td>
              {[0, 1, 2, 3].map((i) => (
                <td key={i} className={NUM_TDC}>
                  {exam.rankGains[i] !== undefined ? `+${exam.rankGains[i]}` : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mb-2 text-xs leading-relaxed text-slate-600">
        <p>評価値 = ステ合計（各3000まで）× 2.1（小数点以下は切り捨て）＋ 最終順位分（1位1,700／2位900／3位500）＋ 試験スコア換算。</p>
        <p className="mt-1">
          中間スコア換算: 〜1万 ×0.11 ／ 〜2万 ×0.08+300 ／ 〜3万 ×0.05+900 ／ 〜4万 ×0.008+2,160 ／
          〜5万 ×0.003+2,360 ／ 〜6万 ×0.002+2,410 ／ 〜20万 ×0.001+2,470（上限2,670）
        </p>
        <p className="mt-1">
          最終スコア換算: 〜30万 ×0.015 ／ 〜50万 ×0.01+1,500 ／ 〜60万 ×0.008+2,500 ／
          〜200万 ×0.001+6,700（上限8,700）
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

/**
 * ゲームのログに出る上昇幅（パラボ込み）の入力欄。
 * 1桁打つたびに逆算→表示し直すと入力が崩れる（今の%で作れない値に丸まる）ので、
 * 打っている途中の文字はそのまま保ち、フォーカスが外れたら「今の%で作れる値」に表示を揃える。
 */
function RiseField({
  value,
  onChange,
}: {
  value: number;
  onChange: (rise: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      type="number"
      min={0}
      value={text ?? value}
      onFocus={() => setText(String(value))}
      onChange={(e) => {
        setText(e.target.value);
        onChange(Math.max(0, Math.round(Number(e.target.value) || 0)));
      }}
      onBlur={() => setText(null)}
      title="ゲームのログの上昇幅をそのまま（パラボ込み）"
      className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-right text-sm tabular-nums text-slate-900 outline-none focus:border-blue-500"
    />
  );
}
