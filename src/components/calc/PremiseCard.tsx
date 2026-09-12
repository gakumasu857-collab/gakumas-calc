import { ChevronDown, ListOrdered } from "lucide-react";
import { FINAL_ROUNDS } from "@/data/schedule";
import { SCENARIO_LABELS, type ScenarioKey } from "@/data/scenarios";
import { Field } from "@/components/calc/CalcCard";
import SetPickerField from "@/components/calc/SetPickerField";
import Hint from "@/components/Hint";
import NumberField from "@/components/NumberField";
import { BTN_SECONDARY, TYPE_CHIP, TYPE_SHORT } from "@/components/ui";
import { GLOSSARY } from "@/lib/glossary";
import type { useCalcResult } from "@/lib/useCalcResult";
import { TYPE_KEYS } from "@/lib/useCalcSettings";

type CalcResult = ReturnType<typeof useCalcResult>;

/** シナリオごとの色（欄のミニ■用。NIAは紫） */
const SCENARIO_COLOR: Record<ScenarioKey, string> = {
  hif: "bg-sky-500",
  niaMaster: "bg-violet-500",
  hatsuLegend: "bg-amber-500",
};

/**
 * 「まず、育成の前提を設定」カード。
 * 青い見出し帯（手順1・あと何つ）＋番号つきの4つの欄（シナリオ・アイドル・プロデュース・メモリー）
 * ＋シナリオ別の本戦の点数。説明文は置かず、プロデュースだけ「発動回数を調整」のボタンを欄の下に出す。
 * 未設定の欄は黄色、設定済みは番号が青。4つそろうと帯に「そろいました」と出て、すぐ下の探索ボタンへつなぐ。
 */
export default function PremiseCard({
  r,
  onOpenScenario,
  onOpenIdol,
  onOpenMemory,
  onOpenCounts,
}: {
  r: CalcResult;
  onOpenScenario: () => void;
  onOpenIdol: () => void;
  onOpenMemory: () => void;
  /** 発動回数の調整モーダルを開く（プロデュースを選んだあと） */
  onOpenCounts: () => void;
}) {
  const { settings } = r.calc;
  const memoryCount = r.memoryStore.selected.length;
  const done = {
    scenario: r.scenarioStore.chosen,
    idol: !!(settings.pIdol && r.pMaster),
    set: !!r.selectedSet,
    memory: memoryCount > 0,
  };
  const doneCount = Object.values(done).filter(Boolean).length;
  const all = doneCount === 4;

  return (
    <section className="overflow-hidden rounded-xl border-2 border-blue-600 bg-white shadow-sm">
      {/* 見出し帯 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-blue-600 px-4 py-2.5 text-white">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-sm font-black text-blue-700">
          1
        </span>
        <h2 className="flex items-center gap-1 text-base font-bold">
          まず、育成の前提を設定
          <Hint
            text={GLOSSARY.premise}
            className="[&>button]:text-blue-200 [&>button:hover]:text-white"
          />
        </h2>
        <span className="text-xs text-blue-100">
          4つ選ぶと、すぐ下のボタンで理想の編成と踏み方が求められます
        </span>
        <span
          className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-bold ${
            all ? "bg-white text-blue-700" : "bg-blue-800/60 text-white"
          }`}
        >
          {all ? "✓ そろいました" : `あと${4 - doneCount}つ`}
        </span>
      </div>

      <div className="p-4">
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          <PremiseField no={1} label="育成シナリオ" done={done.scenario} onClick={onOpenScenario}>
            {r.scenarioStore.chosen ? (
              <>
                <span className={`h-3.5 w-3.5 shrink-0 rounded ${SCENARIO_COLOR[r.scenario]}`} />
                <span className="min-w-0 flex-1 truncate">{SCENARIO_LABELS[r.scenario]}</span>
              </>
            ) : (
              <Unset />
            )}
          </PremiseField>
          <PremiseField no={2} label="アイドル・Pアイドル" done={done.idol} onClick={onOpenIdol}>
            {settings.pIdol && r.pMaster ? (
              <span className="min-w-0 flex-1 truncate">
                {settings.idol} / {r.pMaster.cardName}
              </span>
            ) : (
              <Unset text={settings.idol ? `${settings.idol}（Pアイドルを選ぶ）` : undefined} />
            )}
          </PremiseField>
          <PremiseField no={3} label="プロデュース" hint={GLOSSARY.pattern} done={done.set}>
            <SetPickerField r={r} />
            {r.selectedSet ? (
              // 選んだら、その下で発動回数を調整できることを示す
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <button type="button" onClick={onOpenCounts} className={BTN_SECONDARY}>
                  <ListOrdered size={13} />
                  アビリティの発動回数を調整
                </button>
                <span className="text-[11px] text-slate-500">回数はここで変えられます</span>
              </div>
            ) : (
              <p className="mt-1 text-[11px] leading-snug text-slate-500">
                サポカのアビリティが何回発動するかのテンプレです（Pアイドルのプランで使えるものだけ出ます）。
                選ぶと、回数を調整するボタンが出ます。
              </p>
            )}
          </PremiseField>
          <PremiseField no={4} label="メモリー" hint={GLOSSARY.memory} done={done.memory} onClick={onOpenMemory}>
            {memoryCount === 0 ? (
              <Unset />
            ) : (
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-500">{memoryCount}枚</span>
                {TYPE_KEYS.map((t) => (
                  <span
                    key={t}
                    className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${TYPE_CHIP[t]}`}
                  >
                    {TYPE_SHORT[t]} {r.perType[t].memFixed} / {r.perType[t].memPct}%
                  </span>
                ))}
              </span>
            )}
          </PremiseField>
        </div>

        {/* 本戦・試験の点数（シナリオ別） */}
        <ScenarioScoreCard r={r} />
      </div>
    </section>
  );
}

/** 番号つきの欄。onClick があればボタン、無ければ children をそのまま置く（自前の選択欄用） */
function PremiseField({
  no,
  label,
  hint,
  done,
  onClick,
  children,
}: {
  no: number;
  label: string;
  hint?: string;
  done: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-1.5">
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${
            done ? "bg-blue-600 text-white" : "bg-amber-400 text-amber-950"
          }`}
        >
          {no}
        </span>
        <span className="text-xs font-bold text-slate-700">{label}</span>
        {hint && <Hint text={hint} />}
      </div>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className={`flex h-10 w-full items-center gap-2 rounded-lg border px-3 text-left text-sm text-slate-900 transition ${
            done
              ? "border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/40"
              : "border-amber-400 bg-amber-50 hover:bg-amber-100"
          }`}
        >
          {children}
          <ChevronDown size={15} className="shrink-0 text-slate-400" />
        </button>
      ) : (
        children
      )}
    </div>
  );
}

function Unset({ text }: { text?: string }) {
  return (
    <span className="min-w-0 flex-1 truncate font-bold text-amber-700">
      {text ?? "選んでください"}
    </span>
  );
}

/** 設定ブロック内の小見出しつきサブセクション */
function SettingSub({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
      <p className="mb-1.5 text-xs font-bold text-slate-700">
        {title}
        {hint && <span className="ml-1.5 text-[11px] font-normal text-slate-400">{hint}</span>}
      </p>
      {children}
    </div>
  );
}

/** シナリオ別の本戦・試験スコア入力 */
function ScenarioScoreCard({ r }: { r: CalcResult }) {
  const { calc } = r;
  const { settings } = calc;
  if (r.scenario === "hif") {
    return (
      <SettingSub title="本戦ラウンド点数" hint="ボーナス前の点数を入力">
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["ラウンド1", settings.round1, (v: number) => calc.update({ round1: v }), 0],
              ["ラウンド2", settings.round2, (v: number) => calc.update({ round2: v }), 1],
            ] as const
          ).map(([label, value, onChange, i]) => (
            <Field key={label} label={label}>
              <div className="flex items-center gap-2">
                <NumberField
                  value={value}
                  onChange={onChange}
                  max={FINAL_ROUNDS[i].maxScore}
                  className="w-32"
                />
                <span className="text-xs text-slate-500">
                  → 評価値 {r.roundValues[i].toLocaleString()} / ★
                  {FINAL_ROUNDS[i].star}
                </span>
              </div>
            </Field>
          ))}
        </div>
      </SettingSub>
    );
  }
  if (r.scenario === "niaMaster") {
    return (
      <SettingSub
        title="ファン投票数"
        hint="営業・オーディション・札から自動集計（入力は踏み方の編集から）"
      >
        <div className="flex flex-wrap items-center gap-1.5 text-xs tabular-nums text-slate-600">
          <VoteChip label="営業" value={r.scenarioValues.votesSales ?? 0} />
          <VoteChip label="1次・2次" value={r.scenarioValues.votesAuditions ?? 0} />
          <VoteChip label="最終" value={r.scenarioValues.votesFinale ?? 0} />
          <VoteChip
            label={`札${r.scenarioValues.totalFuda ?? 0}枚`}
            value={r.scenarioValues.votesFuda ?? 0}
          />
          <span className="font-bold text-slate-800">
            = 合計 {(r.scenarioValues.totalVotes ?? 0).toLocaleString()}
          </span>
          <span className="text-slate-500">
            → 評価値換算{" "}
            <b className="text-blue-600">
              {(r.scenarioValues.fanValue ?? 0).toLocaleString()}
            </b>
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          札 = プロデュースの「スキル獲得」{r.scenarioValues.setFuda ?? 0}枚
          ＋サポカ分 {r.scenarioValues.supportFuda ?? 0}
          枚（編成のスキル獲得から自動）。2枚ごとに3,000票、余りの1枚は無効。
        </p>
      </SettingSub>
    );
  }
  return (
    <SettingSub title="試験スコア・順位" hint="踏み方の編集と共有">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="中間試験スコア">
          <div className="flex items-center gap-2">
            <NumberField
              value={r.hatsuSchedule.midScore}
              onChange={(v) => r.hatsuSchedule.update({ midScore: v })}
              sliderMax={250000}
              className="w-32"
            />
            <span className="text-xs text-slate-500">
              → 評価値 {(r.scenarioValues.midValue ?? 0).toLocaleString()}
            </span>
          </div>
        </Field>
        <Field label="最終試験スコア">
          <div className="flex items-center gap-2">
            <NumberField
              value={r.hatsuSchedule.finalScore}
              onChange={(v) => r.hatsuSchedule.update({ finalScore: v })}
              sliderMax={2000000}
              className="w-32"
            />
            <span className="text-xs text-slate-500">
              → 評価値{" "}
              {(r.scenarioValues.finalValue ?? 0).toLocaleString()} ／ 順位分{" "}
              {(r.scenarioValues.rankValue ?? 0).toLocaleString()}
            </span>
          </div>
        </Field>
      </div>
    </SettingSub>
  );
}

/** ファン投票数の内訳チップ */
function VoteChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded bg-slate-100 px-1.5 py-0.5">
      {label} <b className="text-slate-700">{value.toLocaleString()}</b>
    </span>
  );
}
