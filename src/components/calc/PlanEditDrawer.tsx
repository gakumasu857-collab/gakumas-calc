/**
 * 計算ページの左端タブ「レッスン等の踏み方」（か踏み方チップ）から開く、レッスン・授業（営業）・選抜エディタ。
 * レッスンページと同じストアを共有していて、どちらで編集しても同期する。
 * シナリオごとに内容が変わる:
 * - H.I.F: 公開レッスン（メイン＋サブ＋SP）・授業・選抜スコア
 * - N.I.A: 自主レッスン（単タイプ＋SP）・営業（営業先/成功度）・オーディション
 * - 初: レジェンドレッスン（単タイプ＋SP＋パーフェクト）・授業・試験
 */
import { useState, type ReactNode } from "react";
import { Info, Sparkles } from "lucide-react";
import Modal from "@/components/Modal";
import NumberField from "@/components/NumberField";
import { TYPE_SHORT } from "@/components/ui";
import ScheduleCalendarView from "@/components/ScheduleCalendarView";
import { affectionLabel, AFFECTION_DEFAULT, starWithAffection } from "@/data/affection";
import {
  CLASSES,
  distributeExam,
  EXAM_STAR_SEGMENTS,
  EXAMS,
  examBaseFromRise,
  examRiseWithParabo,
  examStar,
  examStarCapScore,
  FINAL_ROUNDS,
  LESSON_KIND_LABELS,
  LESSONS,
  starFromObserved,
} from "@/data/schedule";
import {
  HATSU_CLASSES,
  HATSU_EXAMS,
  HATSU_FINAL_BRACKETS,
  HATSU_LESSONS,
  HATSU_MID_BRACKETS,
  NIA_FAN_BRACKETS,
  NIA_AUDITION_CAPS,
  NIA_AUDITION_VOTE_MAX,
  NIA_FINAL_CAPS,
  NIA_FINAL_KIND_LABELS,
  NIA_FINAL_KINDS,
  niaAuditionCap,
  niaFinalStatCapScore,
  niaFinalVotesCapScore,
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
import {
  niaAuditionBaseFromRise,
  niaAuditionRise,
  niaChallengeTotal,
  normalizeNiaChallenge,
} from "@/data/niaChallenge";
import { missingCalcInputs, notReadyTitle } from "@/lib/optimizeReady";
import type { useCalcResult } from "@/lib/useCalcResult";
import { useOptimizePlan } from "@/lib/useOptimizePlan";
import { useExamGuard } from "@/components/calc/ExamPolicyModal";
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
  // 選抜の点数配分を手で変えていたら、探索の前に「このまま固定／探索で決め直す」を聞く（H.I.F）
  const examGuard = useExamGuard(r);
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
              onClick={() => examGuard.ask("plan", (policy) => optimizePlan(undefined, policy))}
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
          </div>
          {optMsg && (
            <p className="mb-2 text-xs font-semibold text-blue-600">{optMsg}</p>
          )}
          {/* モーダルを開いたままでも最終ステ・評価値を追えるライブサマリー */}
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm tabular-nums">
            <span className="w-full text-xs font-bold text-slate-500 sm:w-auto">
              最終ステータス
            </span>
            {/* スマホでは3列のグリッド（Visual が2行目に落ちない）、PCでは横並び */}
            <div className="grid w-full grid-cols-3 gap-x-2 sm:flex sm:w-auto sm:flex-wrap sm:gap-x-4">
              {TYPE_KEYS.map((t) => (
                <span key={t} className="flex flex-col leading-tight sm:block sm:leading-normal">
                  <span className="whitespace-nowrap">
                    <span className={`text-xs font-bold ${TYPE_STYLE[t].head}`}>
                      {TYPE_LABELS[t]}
                    </span>{" "}
                    <b className="text-slate-800">
                      {Math.round(r.perType[t].current).toLocaleString()}
                    </b>
                  </span>
                  {/* パラボ%は薄い括弧書きだと読めないので、白いチップで見せる */}
                  <span
                    title="このタイプに掛かるパラメータボーナスの合計（メモリー・Pアイドル・サポカ）"
                    className="mt-0.5 inline-flex w-fit items-center gap-1 rounded bg-white px-1.5 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-300 sm:ml-1.5 sm:mt-0"
                  >
                    パラボ
                    <b className={`text-sm ${TYPE_STYLE[t].head}`}>{r.perType[t].startPct}%</b>
                  </span>
                </span>
              ))}
            </div>
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
            <HelpModal
              scenario={r.scenario}
              affection={r.calc.settings.affection}
              onClose={() => setHelpOpen(false)}
            />
          )}
        </Modal>
      )}
      {/* 探索の前の確認（このエディタの上に重ねて出す） */}
      {examGuard.modal}
    </>
  );
}

/** H.I.F: 公開レッスン（メイン＋サブ切替＋SP）・授業・選抜スコア */
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
          title="全レッスンを踏まない"
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
        >
          レッスン全休み
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
                      title={`サブレッスン: ${TYPE_LABELS[pick.sub]}（出現率${Math.round(subAppearProb(type, pick.sub, r.typeRanks) * 100)}%・クリックで切替）`}
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
          ゲームのログに出る上昇幅（パラボ込み）をそのまま入力。今の編成のパラボで元のステに逆算します。
        </p>
        <div className="flex flex-col divide-y divide-slate-200">
          {EXAMS.map((exam, i) => {
            const scores = schedule.examScores[i];
            const stats = schedule.examStats[i];
            const total = TYPE_KEYS.reduce((sum, t) => sum + scores[t], 0);
            /** ステ入力のときのパラボ抜きのステの合計。上昇基準値（選抜1なら140）を超えることは実際には無い */
            const statSum = stats ? TYPE_KEYS.reduce((sum, t) => sum + stats[t], 0) : 0;
            const statOver = stats ? Math.max(0, statSum - exam.base) : 0;
            /** スター性が上限に達するスコア（入力もここで止める） */
            const capScore = examStarCapScore(i);
            /** 極振り: スター性が上限に達するスコアを1タイプに全部（今の合計ではなく上限） */
            const allIn = (type: TypeKey) => {
              const next: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
              next[type] = capScore;
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
              <div key={exam.name} className="flex flex-col gap-1.5 py-2">
                {/* 見出し行: 名前・入力の切り替え（スコア／ステ）・スコアとスター性 */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="w-12 shrink-0 text-sm font-medium text-slate-800">
                    {exam.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
                    {modeBtn("score", "スコア")}
                    {modeBtn("stat", "ステ")}
                  </span>
                  {stats ? (
                    /* スコアはスター性の計算にだけ使う。ログの「1位スコア」をそのまま */
                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      スコア
                      <NumberField
                        value={total}
                        onChange={(v) => schedule.setExamTotalScore(i, v)}
                        max={capScore}
                        sliderMax={capScore}
                        className="w-24"
                      />
                      <span className="text-violet-600">★{examStar(i, total)}</span>
                      {total >= capScore && <CapBadge label="★上限" />}
                    </label>
                  ) : (
                    <span className="ml-auto flex items-center gap-1 text-xs tabular-nums text-slate-500">
                      総スコア <b className="text-slate-800">{total.toLocaleString()}</b>
                      <span className="text-violet-600">★{examStar(i, total)}</span>
                      {total >= capScore && <CapBadge label="★上限" />}
                    </span>
                  )}
                </div>
                {stats ? (
                  <>
                    {/* 上の段: パラボ込みのステ（ゲームのログの値）。入れると今の編成のパラボ%でパラボ抜きのステに逆算して保存 */}
                    <TypeFieldGrid label="パラボ込みのステ">
                      {TYPE_KEYS.map((type) => {
                        const pct = r.paraboDetail[type].totalPct;
                        return (
                          <TypeCell key={type} type={type}>
                            <RiseField
                              value={examRiseWithParabo(stats[type], pct)}
                              onChange={(rise) =>
                                schedule.setExamStat(i, type, examBaseFromRise(rise, pct))
                              }
                              className="w-full sm:w-20"
                            />
                            <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
                              +{pct}%
                            </span>
                          </TypeCell>
                        );
                      })}
                    </TypeFieldGrid>
                    {/* 下の段: パラボ抜きのステ（計算に使う値）。直接打ち込んでもよい */}
                    <TypeFieldGrid
                      label="パラボ抜きのステ"
                      after={
                        <span className="text-xs tabular-nums text-slate-500">
                          合計{" "}
                          <b className={statOver > 0 ? "text-red-600" : "text-slate-800"}>
                            {statSum}
                          </b>
                          <span className={statOver > 0 ? "font-bold text-red-600" : "text-slate-400"}>
                            （合計最大 {exam.base}）
                          </span>
                        </span>
                      }
                    >
                      {TYPE_KEYS.map((type) => (
                        <TypeCell key={type} type={type}>
                          <NumberField
                            value={stats[type]}
                            onChange={(v) => schedule.setExamStat(i, type, v)}
                            max={999}
                            sliderMax={exam.base}
                            className="w-full sm:w-20"
                          />
                        </TypeCell>
                      ))}
                    </TypeFieldGrid>
                    {/* 合計が上昇基準値を超えていたら注意（実際の選抜では合計が最大を超えない＝どこか打ち間違い） */}
                    {statOver > 0 && (
                      <p
                        role="alert"
                        className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold leading-relaxed text-red-700"
                      >
                        ⚠ パラボ抜きのステの合計が {statSum} で、{exam.name}の合計最大 {exam.base} を{" "}
                        {statOver} 超えています。実際より高いステで計算されるので、3タイプの値を見直してください。
                      </p>
                    )}
                    <span className="text-[11px] leading-relaxed text-slate-400">
                      上の段にパラボ込みの値（ゲーム内ログにある上昇幅）を入れると、今の編成のパラボ%で下の段（計算に使う値）を逆算します。編成を変えると上の段の表示も変わります。
                    </span>
                  </>
                ) : (
                  <>
                    <TypeFieldGrid
                      after={
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          極振り:
                          {TYPE_KEYS.map((type) => (
                            <button
                              key={type}
                              type="button"
                              onClick={() => allIn(type)}
                              title={`★上限のスコア（${capScore.toLocaleString()}）を全部${TYPE_LABELS[type]}に`}
                              className={`rounded-md px-1.5 py-1 text-xs font-bold transition disabled:opacity-40 ${TYPE_STYLE[type].chip} hover:brightness-95`}
                            >
                              {TYPE_LABELS[type].slice(0, 2)}
                            </button>
                          ))}
                        </span>
                      }
                    >
                      {TYPE_KEYS.map((type) => (
                        <TypeCell key={type} type={type}>
                          <NumberField
                            value={scores[type]}
                            onChange={(v) => schedule.setExamScore(i, type, v)}
                            max={capScore}
                            sliderMax={capScore}
                            className="w-full sm:w-24"
                          />
                        </TypeCell>
                      ))}
                    </TypeFieldGrid>
                    {/* この配分での上昇量 */}
                    {total > 0 && (
                      <span className="text-[11px] tabular-nums text-slate-500">
                        →{" "}
                        {(() => {
                          const dist = distributeExam(i, scores, TYPE_KEYS);
                          return TYPE_KEYS.map((t) => (
                            <span key={t} className="mr-2">
                              <b className={TYPE_STYLE[t].head}>{TYPE_LABELS[t]}</b> +
                              {Math.round(dist[t])}
                            </span>
                          ));
                        })()}
                        <span className="text-slate-400">※パラメータボーナスは別途上乗せ</span>
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

/** N.I.A: 自主レッスン・営業・オーディション（1次2次＋最終） */
function NiaEditor({ r }: { r: CalcResult }) {
  const nia = r.niaSchedule;
  const tag: NiaTag = r.ranks?.tag === "特化" ? "skew" : "flat";
  const capOf = (auditionIndex: number, type: TypeKey) =>
    niaAuditionCap(tag, auditionIndex, r.typeRanks[type], nia.finalKind);
  const challengePct = niaChallengeTotal(normalizeNiaChallenge(r.calc.settings.niaChallenge));
  /** 1次・2次・最終の素点（上限クランプ済み。最終はステ入力かスコアからの導出） */
  const zero: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
  const base = [0, 1, 2].map((i) => r.niaAuditionBase[i] ?? zero);
  /** 最終のスコアから導出した素点（「ステ」に切り替えたときの初期値） */
  const finalDerived = Object.fromEntries(
    TYPE_KEYS.map((t) => [t, niaFinaleStat(tag, r.typeRanks[t], nia.finalScores[t], nia.finalKind)]),
  ) as Record<TypeKey, number>;
  // ステ入力のときは投票数用の合計、スコア入力のときはタイプ別スコアの合計
  const finalTotal =
    nia.finalTotalScore ?? TYPE_KEYS.reduce((s, t) => s + nia.finalScores[t], 0);
  const modeBtn = (mode: "score" | "stat", label: string) => (
    <button
      type="button"
      onClick={() => nia.setFinalMode(mode, finalDerived)}
      className={`rounded-md px-2 py-0.5 text-[11px] font-bold transition ${
        (nia.finalStats ? "stat" : "score") === mode
          ? "bg-blue-600 text-white"
          : "text-slate-500 hover:bg-slate-200"
      }`}
    >
      {label}
    </button>
  );
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

      {/* オーディション（1次・2次は素点、最終はスコアか素点。素点はパラボ込みのステ（ログの値）からも逆算） */}
      <Section title="オーディション（1次・2次はステを入力 / 最終はスコアかステ）">
        <p className="mb-1 text-[11px] leading-relaxed text-slate-500">
          「パラボ込みの上昇ステ」にゲームのログの値をそのまま入れると、今の編成のパラボ%と
          チャレンジPアイテムの獲得ボーナス（設定欄で調整。今は合計+{challengePct}%）で元の素点に逆算します。
          素点を直接打ち込んでもOK。最終は「スコア」（流行順位別の式で換算）と「ステ」を切り替えられます。
        </p>
        <div className="flex flex-col divide-y divide-slate-200">
          {NIA_AUDITIONS.map((audition, i) => (
            <div
              key={audition.name}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2"
            >
              <span className="w-12 shrink-0 text-sm font-medium text-slate-800">
                {audition.name}
              </span>
              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                投票
                <NumberField
                  value={nia.auditionVotes[i]}
                  onChange={(v) => nia.setAuditionVotes(i, v)}
                  max={NIA_AUDITION_VOTE_MAX[i]}
                  sliderMax={NIA_AUDITION_VOTE_MAX[i]}
                  className="w-20"
                />
                <span className="text-slate-400">/{NIA_AUDITION_VOTE_MAX[i].toLocaleString()}</span>
              </label>
              <AuditionStatRows
                r={r}
                challengePct={challengePct}
                stats={base[i]}
                capOf={(type) => capOf(i, type)}
                onChange={(type, v) => nia.setAudition(i, type, v)}
              />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
            <span className="w-12 shrink-0 text-sm font-medium text-slate-800">最終</span>
            {/* 入力の切り替え（スコア／ステ） */}
            <span className="flex shrink-0 items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
              {modeBtn("score", "スコア")}
              {modeBtn("stat", "ステ")}
            </span>
            {/* 最終オーディションの種類（FINALE／QUARTET。スコア→ステの式と上限が変わる） */}
            <span className="flex shrink-0 items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
              {NIA_FINAL_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => nia.setFinalKind(k)}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-bold transition ${
                    nia.finalKind === k
                      ? "bg-violet-600 text-white"
                      : "text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {NIA_FINAL_KIND_LABELS[k]}
                </button>
              ))}
            </span>
            {nia.finalStats ? (
              <>
                {/* スコアは投票数の導出にだけ使う。ログの合計スコアをそのまま */}
                <label className="flex items-center gap-1 text-xs text-slate-500">
                  スコア
                  <NumberField
                    value={finalTotal}
                    onChange={(v) => nia.setFinalTotalScore(v)}
                    max={niaFinalVotesCapScore(nia.finalKind)}
                    sliderMax={niaFinalVotesCapScore(nia.finalKind)}
                    className="w-24"
                  />
                  <span className="text-slate-400">（投票数の計算にだけ使う）</span>
                </label>
                <AuditionStatRows
                  r={r}
                  challengePct={challengePct}
                  stats={base[2]}
                  capOf={(type) => capOf(2, type)}
                  onChange={(type, v) => nia.setFinalStat(type, v)}
                />
              </>
            ) : (
              <>
                <TypeFieldGrid>
                  {TYPE_KEYS.map((type) => (
                    <TypeCell key={type} type={type}>
                      <NumberField
                        value={nia.finalScores[type]}
                        onChange={(v) => nia.setFinalScore(type, v)}
                        max={niaFinalVotesCapScore(nia.finalKind)}
                        sliderMax={niaFinalVotesCapScore(nia.finalKind)}
                        className="w-full sm:w-24"
                      />
                      {nia.finalScores[type] >=
                        niaFinalStatCapScore(tag, r.typeRanks[type], nia.finalKind) && (
                        <CapBadge label="ステ上限" />
                      )}
                    </TypeCell>
                  ))}
                </TypeFieldGrid>
                <span className="w-full text-[11px] text-slate-500">
                  スコアから導出した素点:{" "}
                  {TYPE_KEYS.map((type) => (
                    <span key={type} className="mr-2">
                      <span className={`font-bold ${TYPE_STYLE[type].head}`}>
                        {TYPE_LABELS[type]}
                      </span>
                      +{base[2][type]}
                    </span>
                  ))}
                  <span className="text-slate-400">
                    （獲得ボーナス+{challengePct}%とパラボは別途上乗せ）
                  </span>
                </span>
              </>
            )}
            <span className="w-full text-[11px] text-slate-500">
              投票 +{niaFinaleVotes(finalTotal, nia.finalKind).toLocaleString()}（合計スコア{" "}
              {finalTotal.toLocaleString()} から）
              {finalTotal >= niaFinalVotesCapScore(nia.finalKind) && (
                <>
                  {" "}
                  <CapBadge label="投票上限" />
                </>
              )}
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
  affection,
}: {
  onClose: () => void;
  scenario: ScenarioKey;
  affection: number;
}) {
  return (
    <Modal title="数値表・計算式" onClose={onClose} widthClass="max-w-3xl">
      <NumbersTables scenario={scenario} affection={affection} />
    </Modal>
  );
}

/** レッスン・授業・試験の数値表本体（ヘルプモーダルからも使う）。シナリオ別 */
export function NumbersTables({
  scenario = "hif",
  affection = AFFECTION_DEFAULT,
}: {
  scenario?: ScenarioKey;
  /** 親愛度Lv（スター性の表示に効く） */
  affection?: number;
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
        <HifNumbers affection={affection} />
      )}
    </>
  );
}

/** 数値の表示（3桁区切り・小数は丸めない） */
const fmtNum = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 6 });

/**
 * 区分ごとの式を表で見せる部品（区分線形の式は文章にすると読みづらいため）。
 * 1列目は左寄せ、残りは中央寄せ。
 */
function PieceTable({
  headers,
  rows,
  caption,
}: {
  headers: string[];
  rows: (string | number)[][];
  caption?: string;
}) {
  return (
    <div className="mb-3 overflow-x-auto">
      <table className="w-full border-collapse text-xs tabular-nums">
        {caption && (
          <caption className="mb-1 text-left text-[11px] text-slate-500">{caption}</caption>
        )}
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} className={NUM_TH}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i}>
              {cells.map((c, j) => (
                <td key={j} className={j === 0 ? NUM_TD : NUM_TDC}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 式の切片の表示（0 なら出さない、負なら −） */
const intercept = (c: number) =>
  c === 0 ? "" : c > 0 ? ` ＋ ${fmtNum(c)}` : ` − ${fmtNum(-c)}`;

/** [上限, 倍率, 固定値] の換算表 → 表の行（範囲・式「X×倍率＋切片」・その区間の上限での値） */
function bracketRows(
  brackets: readonly (readonly [number, number, number])[],
): (string | number)[][] {
  let from = 0;
  return brackets.map(([cap, rate, fixed]) => {
    const range =
      cap === Infinity ? `${fmtNum(from)}〜` : `${fmtNum(from)}〜${fmtNum(cap)}`;
    const formula = `X×${rate}${intercept(fixed)}`;
    const end = cap === Infinity ? "—" : fmtNum(Math.floor(cap * rate + fixed));
    from = cap;
    return [range, formula, end];
  });
}

function HifNumbers({ affection }: { affection: number }) {
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
                {starFromObserved(lesson.star[0], affection)} /{" "}
                {starFromObserved(lesson.star[1], affection)}
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

      <h3 className="mb-1 text-xs font-bold text-slate-700">本戦のスター性</h3>
      <PieceTable
        caption={`区間に入った分だけ倍率が掛かり、累計がスター性になります（上限あり）。「${affectionLabel(affection)}」は今の親愛度での値（切り捨て）。`}
        headers={["ラウンド", "スコア", "倍率", "素の累計", affectionLabel(affection)]}
        rows={FINAL_ROUNDS.flatMap((round, ri) => {
          let from = 0;
          let acc = 0;
          return round.starBands.map(([to, rate]) => {
            acc += (to - from) * rate;
            const row = [
              ri === 0 ? (from === 0 ? "ラウンド1" : "") : from === 0 ? "ラウンド2" : "",
              `${fmtNum(from)}〜${fmtNum(to)}`,
              `×${rate}`,
              `${fmtNum(Math.round(acc))}${acc >= round.starMax ? "（上限）" : ""}`,
              fmtNum(starWithAffection(Math.min(acc, round.starMax), affection)),
            ];
            from = to;
            return row;
          });
        })}
      />

      <h3 className="mb-1 text-xs font-bold text-slate-700">本戦の点数評価値</h3>
      <PieceTable
        caption="X＝そのラウンドのスコア。区間ごとに「X×倍率＋切片」（小数点以下は切り捨て）。"
        headers={["ラウンド", "スコア", "式", "区間の上限での値"]}
        rows={FINAL_ROUNDS.flatMap((round, ri) =>
          round.brackets.map(([cap, base, rate, add], bi) => [
            bi === 0 ? `ラウンド${ri + 1}` : "",
            `〜${fmtNum(cap)}`,
            // ベース＋(X−下限)×倍率 を X×倍率＋(ベース−下限×倍率) に直して見せる（値は同じ）
            `X×${rate}${intercept(add - base * rate)}`,
            fmtNum(add + Math.floor((cap - base) * rate)),
          ]),
        )}
      />

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
              <td className={tdC}>{starWithAffection(exam.starCap, affection)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mb-3 text-xs leading-relaxed text-slate-600">
        分配: スコア昇順に 下位=配分×スコア比（切り捨て）+固定÷3（端数は繰り越し）、
        中位=（繰り越し+配分×スコア比）（切り捨て）+固定÷3、上位=基準値−下位−中位。
      </p>

      <h3 className="mb-1 text-xs font-bold text-slate-700">選抜のスター性</h3>
      <PieceTable
        caption={`合計スコアの区間ごとに、両端のスター性を直線でつなぎます（小数は切り捨て）。表は「${affectionLabel(affection)}」での値。`}
        headers={["選抜", "合計スコア", "スター性"]}
        rows={EXAM_STAR_SEGMENTS.flatMap((segs, i) =>
          segs.map((seg, si) => [
            si === 0 ? EXAMS[i].name : "",
            seg.to === Infinity ? `${fmtNum(seg.from)}〜` : `${fmtNum(seg.from)}〜${fmtNum(seg.to)}`,
            seg.to === Infinity
              ? `${starFromObserved(seg.star[0], affection)}（上限）`
              : `${starFromObserved(seg.star[0], affection)} → ${starFromObserved(seg.star[1], affection)}`,
          ]),
        )}
      />
      <p className="mb-2 text-xs text-slate-400">
        ※ 合計スコアが低く上昇基準値が上限に達しない場合の式は暫定版のため未実装（常に上限到達として計算）。
      </p>
    </>
  );
}

const NUM_TH = "border border-slate-300 bg-slate-100 px-2 py-1";
const NUM_TD = "border border-slate-200 px-2 py-1";
const NUM_TDC = `${NUM_TD} text-center`;

/** N.I.A（マスター）の数値表と計算式 */
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
          {(["flat", "skew"] as const).flatMap((tag) => [
            ...NIA_AUDITION_CAPS[tag].map((caps, i) => (
              <tr key={tag + i}>
                <td className={NUM_TD}>{i === 0 ? (tag === "flat" ? "バランス" : "特化") : ""}</td>
                <td className={NUM_TDC}>{["1次", "2次", "最終 FINALE"][i]}</td>
                {caps.map((c, j) => (
                  <td key={j} className={NUM_TDC}>{c}</td>
                ))}
              </tr>
            )),
            <tr key={tag + "quartet"}>
              <td className={NUM_TD}></td>
              <td className={NUM_TDC}>最終 QUARTET</td>
              {NIA_FINAL_CAPS.quartet[tag].map((c, j) => (
                <td key={j} className={NUM_TDC}>{c}</td>
              ))}
            </tr>,
          ])}
        </tbody>
      </table>
      <p className="mb-2 text-xs text-slate-600">
        評価値 = ステ合計（各2600まで）× 2.3（小数点以下は切り捨て）＋ ファン投票数換算。
      </p>
      <h3 className="mb-1 text-xs font-bold text-slate-700">ファン投票数→評価値</h3>
      <PieceTable
        caption="X＝ファン投票数。区間ごとに「X×倍率＋切片」（小数点以下は切り捨て）。"
        headers={["投票数", "式", "区間の上限での値"]}
        rows={bracketRows(NIA_FAN_BRACKETS)}
      />
      <div className="mb-2 text-xs leading-relaxed text-slate-600">
        <p>札（スキルカード獲得）2枚ごとに+3,000票（端数の1枚は無効）。</p>
        <p className="mt-1">
          最終オーディションはスコアからステ素点（流行順位別の式）と投票数を自動導出（「ステ」に切り替えて素点を直接入れることもできる）。
        </p>
        <p className="mt-1">
          オーディションの素点にはチャレンジPアイテムの獲得ボーナス（3枠の合計%。設定欄の「チャレンジPアイテム」で調整）が掛かり、その上にパラボが掛かる
          （素点 → 素点＋切り捨て(素点×獲得ボーナス) → パラボ）。
        </p>
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
      <p className="mb-2 text-xs text-slate-600">
        評価値 = ステ合計（各3000まで）× 2.1（小数点以下は切り捨て）＋
        最終順位分（1位1,700／2位900／3位500）＋ 試験スコア換算。
      </p>
      <h3 className="mb-1 text-xs font-bold text-slate-700">中間試験のスコア→評価値</h3>
      <PieceTable
        caption="X＝中間試験のスコア。区間ごとに「X×倍率＋切片」（小数点以下は切り捨て）。"
        headers={["スコア", "式", "区間の上限での値"]}
        rows={bracketRows(HATSU_MID_BRACKETS)}
      />
      <h3 className="mb-1 text-xs font-bold text-slate-700">最終試験のスコア→評価値</h3>
      <PieceTable
        caption="X＝最終試験のスコア。区間ごとに「X×倍率＋切片」（小数点以下は切り捨て）。"
        headers={["スコア", "式", "区間の上限での値"]}
        rows={bracketRows(HATSU_FINAL_BRACKETS)}
      />
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
        <span key={g.label} className="flex w-full items-center gap-1 sm:w-auto">
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
 * タイプ別の入力3つの並び。スマホでは3列のグリッド（タイプ名を上に）、PC（sm以上）では横1列。
 * label は行の見出し（スマホでは上に1行、PCでは左に固定幅）。after は右に添えるもの（合計・極振りなど）。
 */
function TypeFieldGrid({
  label,
  after,
  children,
}: {
  label?: ReactNode;
  after?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1">
      {label && (
        <span className="w-full text-[11px] font-bold text-slate-600 sm:w-44 sm:shrink-0">{label}</span>
      )}
      <div className="grid w-full grid-cols-3 gap-x-2 gap-y-1 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-x-3">
        {children}
      </div>
      {after}
    </div>
  );
}

/** TypeFieldGrid の1マス（タイプ名＋入力）。short でタイプ名を Vo/Da/Vi に */
function TypeCell({
  type,
  short,
  children,
}: {
  type: TypeKey;
  short?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-0.5 text-xs text-slate-500 sm:flex-row sm:items-center sm:gap-1">
      <span className={`font-bold ${TYPE_STYLE[type].head}`}>
        {short ? TYPE_SHORT[type] : TYPE_LABELS[type]}
      </span>
      <span className="flex min-w-0 items-center gap-1">{children}</span>
    </label>
  );
}

/** 入力がそれ以上増えても結果が変わらないときの印（ステ上限・★上限・投票上限） */
function CapBadge({ label }: { label: string }) {
  return (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
      {label}
    </span>
  );
}

/**
 * N.I.Aのオーディションの素点入力（2段）。
 * 上の段はパラボ込みのステ（ゲームのログの値。獲得ボーナス＋パラボ込み）。入れると今の編成のパラボ%と
 * チャレンジPアイテムの獲得ボーナス%で素点に逆算して保存する。
 * 下の段はパラボ抜きのステ＝素点そのもの（計算に使う値。上限＝流行順位別の上限）。
 */
function AuditionStatRows({
  r,
  challengePct,
  stats,
  capOf,
  onChange,
}: {
  r: CalcResult;
  challengePct: number;
  stats: Record<TypeKey, number>;
  capOf: (type: TypeKey) => number;
  onChange: (type: TypeKey, base: number) => void;
}) {
  return (
    <>
      <TypeFieldGrid
        label={
          <span
            title={`ゲームのログの上昇幅をそのまま。獲得ボーナス+${challengePct}%と今の編成のパラボ%（右の数字）で素点に逆算します`}
          >
            パラボ込みのステ（獲得+{challengePct}%込み）
          </span>
        }
      >
        {TYPE_KEYS.map((type) => {
          const pct = r.paraboDetail[type].totalPct;
          return (
            <TypeCell key={type} type={type} short>
              <RiseField
                value={niaAuditionRise(stats[type], challengePct, pct)}
                onChange={(rise) =>
                  onChange(
                    type,
                    Math.min(capOf(type), niaAuditionBaseFromRise(rise, challengePct, pct)),
                  )
                }
                className="w-full sm:w-20"
              />
              <span className="shrink-0 text-[10px] tabular-nums text-slate-400" title="今の編成のパラボ%">
                +{pct}%
              </span>
            </TypeCell>
          );
        })}
      </TypeFieldGrid>
      <TypeFieldGrid label="パラボ抜きのステ（素点）">
        {TYPE_KEYS.map((type) => (
          <TypeCell key={type} type={type} short>
            <NumberField
              value={stats[type]}
              onChange={(v) => onChange(type, v)}
              max={capOf(type)}
              className="w-full sm:w-16"
            />
            <span className="shrink-0 text-slate-400">/{capOf(type)}</span>
          </TypeCell>
        ))}
      </TypeFieldGrid>
    </>
  );
}

/**
 * パラボ込みのステ（ゲームのログに出る上昇幅）の入力欄。
 * 1桁打つたびに逆算→表示し直すと入力が崩れる（今の%で作れない値に丸まる）ので、
 * 打っている途中の文字はそのまま保ち、フォーカスが外れたら「今の%で作れる値」に表示を揃える。
 */
function RiseField({
  value,
  onChange,
  className = "w-20",
}: {
  value: number;
  onChange: (rise: number) => void;
  className?: string;
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
      className={`${className} rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-right text-sm tabular-nums text-slate-900 outline-none focus:border-blue-500`}
    />
  );
}
