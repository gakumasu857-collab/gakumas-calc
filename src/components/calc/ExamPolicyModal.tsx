import { useState } from "react";
import Modal from "@/components/Modal";
import { EXAMS } from "@/data/schedule";
import type { ExamPolicy } from "@/lib/autoOptimize";
import type { useCalcResult } from "@/lib/useCalcResult";
import { sameExamAt } from "@/lib/useSchedule";
import { TYPE_KEYS, TYPE_LABELS, type TypeKey } from "@/lib/useCalcSettings";

type CalcResult = ReturnType<typeof useCalcResult>;

/** 探索の範囲（全自動＝サポカ編成も探す／踏み方だけ） */
type SearchScope = "full" | "plan";

const TYPE_CHIP: Record<TypeKey, string> = {
  vocal: "bg-red-100 text-red-700",
  dance: "bg-blue-100 text-blue-700",
  visual: "bg-yellow-100 text-yellow-700",
};

/**
 * 探索（全自動・踏み方だけ）の前に挟む、選抜の点数配分の確認（H.I.Fだけ）。
 *
 * 実際の試験では思った通りに寄せられないことがあるので、選抜の点数配分を手で直してから
 * 探索し直すと、その配分が探索の結果で上書きされてしまう。手で変えた配分が残っているとき
 * （useSchedule の examTouched＝変える前の配分の控え examBaseline がある）は、探索の前に「このまま固定して探索する」か
 * 「探索で決め直す」かを選んでもらう。確認は「探索の条件」で OFF にできる（OFF＝いつも探索が決め直す）。
 *
 * ask(scope, run): 確認が要らなければすぐ run(方針) を呼ぶ。要るときはモーダルを出し、選んだ方針で run を呼ぶ。
 * modal は呼び出し側で描画する（踏み方エディタの中でも使うので、それぞれの画面に置く）。
 */
export function useExamGuard(r: CalcResult) {
  const [pending, setPending] = useState<{
    scope: SearchScope;
    run: (policy: ExamPolicy) => void;
  } | null>(null);
  const { settings } = r.calc;
  /** 探索が点数配分を決めるときの方針（「極振りで探索する」が ON なら極振りだけ） */
  const searchPolicy: ExamPolicy = settings.examAllIn ? "single" : "free";

  const ask = (scope: SearchScope, run: (policy: ExamPolicy) => void) => {
    if (r.scenario !== "hif") return run("free");
    if (settings.examConfirm && r.schedule.examTouched) setPending({ scope, run });
    else run(searchPolicy);
  };

  const modal = pending ? (
    <ExamPolicyModal
      r={r}
      scope={pending.scope}
      searchPolicy={searchPolicy}
      onPick={(policy) => {
        const { run } = pending;
        setPending(null);
        run(policy);
      }}
      onClose={() => setPending(null)}
    />
  ) : null;

  return { ask, modal };
}

function ExamPolicyModal({
  r,
  scope,
  searchPolicy,
  onPick,
  onClose,
}: {
  r: CalcResult;
  scope: SearchScope;
  searchPolicy: ExamPolicy;
  onPick: (policy: ExamPolicy) => void;
  onClose: () => void;
}) {
  const { examScores, examStats, examBaseline } = r.schedule;
  /** 手で変える前（最後に探索が書いた配分か初期値）と違う選抜か */
  const changedAt = (i: number) =>
    !!examBaseline && !sameExamAt(examBaseline, { examScores, examStats }, i);
  return (
    <Modal title="選抜の点数配分を手で変えています" onClose={onClose} widthClass="max-w-md">
      <p className="text-sm leading-relaxed text-slate-700">
        選抜の点数配分が、手で変えたままになっています。今回の探索でどう扱うか選んでください。
      </p>

      {/* 今の点数配分（ステ入力の選抜は、入力したパラボ抜きのステ） */}
      <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="text-[11px] font-bold text-slate-500">今の点数配分</p>
        <ul className="mt-1 flex flex-col gap-1 text-xs tabular-nums text-slate-700">
          {EXAMS.map((exam, i) => {
            const stats = examStats[i];
            const values = stats ?? examScores[i];
            return (
              <li key={exam.name} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="w-10 shrink-0 font-bold">{exam.name}</span>
                {TYPE_KEYS.map((t) => (
                  <span key={t} className="flex items-center gap-1">
                    <span className={`rounded px-1 py-0.5 text-[10px] font-bold ${TYPE_CHIP[t]}`}>
                      {TYPE_LABELS[t].slice(0, 2)}
                    </span>
                    {values[t].toLocaleString()}
                  </span>
                ))}
                <span className="text-[10px] text-slate-400">{stats ? "（ステ入力）" : "（スコア）"}</span>
                {changedAt(i) && (
                  <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-bold text-amber-700">
                    変更
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => onPick("fixed")}
          className="rounded-lg bg-blue-600 px-3 py-2 text-left text-white transition hover:bg-blue-500"
        >
          <span className="block text-sm font-bold">このままの点数配分で探索する</span>
          <span className="block text-xs opacity-90">
            点数配分は固定して、
            {scope === "full" ? "サポカ編成・レッスン・授業" : "レッスン・授業"}
            だけ探索します
          </span>
        </button>
        <button
          type="button"
          onClick={() => onPick(searchPolicy)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-slate-700 transition hover:bg-slate-100"
        >
          <span className="block text-sm font-bold">点数配分も探索で決め直す</span>
          <span className="block text-xs text-slate-500">
            今の点数配分は探索の結果で上書きされます
            {searchPolicy === "single" ? "（選抜は3つとも極振りで探索）" : ""}
          </span>
        </button>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
        この確認は「探索の条件」→「選抜の点数配分を手で変えていたら、探索の前に確認する」でOFFにできます（OFFのときは、いつも探索が決め直します）。
      </p>
    </Modal>
  );
}
