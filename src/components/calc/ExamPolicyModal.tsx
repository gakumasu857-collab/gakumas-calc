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
 * （useSchedule の examTouched＝変える前の配分の控え examBaseline がある）は、探索の前に「探索で決め直す」か
 * 「このまま固定して探索する」かを選んでもらう。確認は最初だけでよいので「次回以降表示しない」を付けてあり、
 * チェックして選ぶと確認が OFF になって、選んだほうが「確認を挟まないときの扱い」（examKeepManual）に入る。
 * あとは「条件設定」で変える。
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
    // 手で変えていなければ、いつも探索が決める
    if (!r.schedule.examTouched) return run(searchPolicy);
    if (settings.examConfirm) setPending({ scope, run });
    // 確認を挟まない設定: 「条件設定」で選んだ扱いに従う
    else run(settings.examKeepManual ? "fixed" : searchPolicy);
  };

  const modal = pending ? (
    <ExamPolicyModal
      r={r}
      scope={pending.scope}
      searchPolicy={searchPolicy}
      onPick={(policy, dontAskAgain) => {
        const { run } = pending;
        setPending(null);
        // 「次回以降表示しない」: 確認を OFF にして、今回選んだほうを次からの扱いにする
        if (dontAskAgain)
          r.calc.update({ examConfirm: false, examKeepManual: policy === "fixed" });
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
  /** dontAskAgain＝「次回以降表示しない」にチェックして選んだ */
  onPick: (policy: ExamPolicy, dontAskAgain: boolean) => void;
  onClose: () => void;
}) {
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const { examScores, examStats, examBaseline } = r.schedule;
  /** 手で変える前（最後に探索が書いた配分か初期値）と違う選抜か */
  const changedAt = (i: number) =>
    !!examBaseline && !sameExamAt(examBaseline, { examScores, examStats }, i);
  return (
    <Modal title="選抜の点数配分が変更されています" onClose={onClose} widthClass="max-w-md">
      <p className="text-sm leading-relaxed text-slate-700">
        今回の探索でどう扱うか選択してください。
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

      {/* 色の意味（オーナー指定）: 探索の配分にする＝青（主）、手で変えた配分を反映する＝白 */}
      <div className="mt-3 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => onPick(searchPolicy, dontAskAgain)}
          className="rounded-lg bg-blue-600 px-3 py-2 text-left text-white transition hover:bg-blue-500"
        >
          <span className="block text-sm font-bold">点数配分も探索で決め直す</span>
          <span className="block text-xs opacity-90">
            今の点数配分は探索の結果で上書きされます
            {searchPolicy === "single" ? "（選抜試験の点数は全て1つのタイプに分配）" : ""}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onPick("fixed", dontAskAgain)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-slate-700 transition hover:bg-slate-100"
        >
          <span className="block text-sm font-bold">今の点数配分のまま探索する</span>
          <span className="block text-xs text-slate-500">
            点数配分は固定して、
            {scope === "full" ? "サポカ編成・レッスン・授業" : "レッスン・授業"}
            だけ探索します
          </span>
        </button>
      </div>
      {/* 確認は最初だけでよい: チェックして選ぶと、次からは選んだほうで探索する（「条件設定」で変えられる） */}
      <label className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-slate-600">
        <input
          type="checkbox"
          checked={dontAskAgain}
          onChange={(e) => setDontAskAgain(e.target.checked)}
          className="mt-0.5 accent-blue-600"
        />
        <span>
          次回以降表示しない
          <span className="block text-[11px] text-slate-400">
            「条件設定」→「選抜の点数配分設定をそのままにするかどうかの確認を挟む」で変えられます。
          </span>
        </span>
      </label>
    </Modal>
  );
}
