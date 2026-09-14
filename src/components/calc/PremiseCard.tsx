import { useState } from "react";
import { ArrowRight, ChevronDown, Info, Pencil } from "lucide-react";
import { Link } from "react-router-dom";
import { FINAL_ROUNDS } from "@/data/schedule";
import { SCENARIO_LABELS, type ScenarioKey } from "@/data/scenarios";
import { Field } from "@/components/calc/CalcCard";
import SetPickerField from "@/components/calc/SetPickerField";
import Hint from "@/components/Hint";
import NumberField from "@/components/NumberField";
import { BTN_PRIMARY, BTN_SECONDARY_LG, TYPE_CHIP, TYPE_SHORT } from "@/components/ui";
import { GLOSSARY } from "@/lib/glossary";
import { readOwnershipAck, readOwnershipVisited, writeOwnershipAck } from "@/lib/ownershipAck";
import type { useCalcResult } from "@/lib/useCalcResult";
import { TYPE_KEYS } from "@/lib/useCalcSettings";
import { BUILTIN_ID, useOwnedSaves } from "@/lib/useOwnedSaves";

type CalcResult = ReturnType<typeof useCalcResult>;

/** シナリオごとの色（欄のミニ■用。NIAは紫） */
const SCENARIO_COLOR: Record<ScenarioKey, string> = {
  hif: "bg-sky-500",
  niaMaster: "bg-violet-500",
  hatsuLegend: "bg-amber-500",
};

/** 欄のラベル（番号の横）。細かい文字を増やさないため、説明は ⓘ かヘルプに寄せる */
const LABEL = "text-sm font-bold text-slate-800";

/**
 * 「設定欄」（育成の前提）カード。
 * 青い見出し帯＋番号つきの5つの欄（シナリオ・アイドル・プロデュース・メモリー・所持状況）
 * ＋シナリオ別の本戦の点数。未設定の欄は黄色、設定済みは番号が青。
 * - アイドルの欄の下に特訓・才能開花（1つのボタン。押すとモーダル）
 * - 所持状況は5つ目の欄。既定の全完凸のままなら「自分の所持状況を入力」か「完凸のままでOK」
 * 1〜4がそろうと、すぐ下の探索ボタンが押せる（所持状況は無くても探索できる）。
 */
export default function PremiseCard({
  r,
  onOpenScenario,
  onOpenIdol,
  onOpenMemory,
  onOpenIdolTraining,
}: {
  r: CalcResult;
  onOpenScenario: () => void;
  onOpenIdol: () => void;
  onOpenMemory: () => void;
  /** 特訓・才能開花のモーダルを開く（Pアイドルを選んだあと） */
  onOpenIdolTraining: () => void;
}) {
  const { settings } = r.calc;
  const memoryCount = r.memoryStore.count;
  const own = r.ownership;
  const done = {
    scenario: r.scenarioStore.chosen,
    idol: !!(settings.pIdol && r.pMaster),
    set: !!r.selectedSet,
    memory: memoryCount > 0,
  };

  return (
    <section className="overflow-hidden rounded-xl border-2 border-blue-600 bg-white shadow-sm">
      {/* 見出し帯 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-blue-600 px-4 py-2.5 text-white">
        <h2 className="flex items-center gap-1 text-base font-bold">
          設定欄
          <Hint
            text={GLOSSARY.premise}
            className="[&>button]:text-blue-200 [&>button:hover]:text-white"
          />
        </h2>
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
          <PremiseField
            no={2}
            label="アイドル・Pアイドル"
            done={done.idol}
            onClick={onOpenIdol}
            below={
              done.idol ? (
                // 特訓・才能開花はここから（評価値の横のPアイドル画像の歯車と同じ設定）
                <button
                  type="button"
                  onClick={onOpenIdolTraining}
                  title="特訓・才能開花を変更"
                  className={`${BTN_SECONDARY_LG} mt-1.5 ${own ? "" : "text-red-600"}`}
                >
                  <Pencil size={12} />
                  {own ? `特訓 ${own.kunren} ／ 才能開花 ${own.kaika}` : "未所持（特訓・才能開花を設定）"}
                </button>
              ) : null
            }
          >
            {settings.pIdol && r.pMaster ? (
              <span className="min-w-0 flex-1 truncate">
                {settings.idol} / {r.pMaster.cardName}
              </span>
            ) : (
              <Unset text={settings.idol ? `${settings.idol}（Pアイドルを選ぶ）` : undefined} />
            )}
          </PremiseField>
          <PremiseField no={3} label="プロデュース" hintLink="/help#produce" done={done.set}>
            <SetPickerField r={r} />
          </PremiseField>
          <PremiseField no={4} label="メモリー" hint={GLOSSARY.memory} done={done.memory} onClick={onOpenMemory}>
            {memoryCount === 0 ? (
              <Unset />
            ) : (
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                <span className="text-sm text-slate-500">{memoryCount}枚</span>
                {TYPE_KEYS.map((t) => (
                  <span
                    key={t}
                    className={`rounded px-1.5 py-0.5 text-xs font-semibold ${TYPE_CHIP[t]}`}
                  >
                    {TYPE_SHORT[t]} {r.perType[t].memFixed} / {r.perType[t].memPct}%
                  </span>
                ))}
              </span>
            )}
          </PremiseField>

          {/* 5. 所持状況（探索はここに登録したサポカから編成する。既定は全サポカ完凸） */}
          <div className="min-w-0 sm:col-span-2">
            <OwnershipRow />
          </div>
        </div>

        {/* 本戦・試験の点数（シナリオ別） */}
        <ScenarioScoreCard r={r} />
      </div>
    </section>
  );
}

/**
 * 所持状況の欄。使っている所持状況（既定＝全サポカ完凸／自分の所持状況）を見せる。
 * 既定のままで一度も決めていなければ黄色にして、「自分の所持状況を入力」と「完凸のままでOK」を並べる
 * （押すと以後は通常表示）。
 */
function OwnershipRow() {
  const owned = useOwnedSaves();
  const [ack, setAck] = useState(() => readOwnershipAck() || readOwnershipVisited());
  const builtin = owned.activeId === BUILTIN_ID;
  const activeName = owned.saves.find((s) => s.id === owned.activeId)?.name;
  const done = ack || !builtin;
  return (
    <>
      <div className="mb-1 flex items-center gap-1.5">
        <NoBadge no={5} done={done} />
        <span className={LABEL}>所持状況</span>
        <Hint text={GLOSSARY.ownership} />
      </div>
      <div
        className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-base text-slate-900 ${
          done ? "border-slate-300 bg-white" : "border-amber-400 bg-amber-50"
        }`}
      >
        <span className="min-w-0 flex-1">
          {builtin ? (
            <>
              <b>全サポカ完凸</b>
              <span className="text-slate-500">（既定）</span>
            </>
          ) : (
            <>
              「<b>{activeName ?? "自分の所持状況"}</b>」
            </>
          )}
        </span>
        {done ? (
          <Link to="/support" className={BTN_SECONDARY_LG}>
            {builtin ? "自分の所持状況を入力" : "所持状況を変える"}
            <ArrowRight size={14} />
          </Link>
        ) : (
          <>
            <Link to="/support" className={BTN_PRIMARY}>
              自分の所持状況を入力
              <ArrowRight size={14} />
            </Link>
            <button
              type="button"
              onClick={() => {
                writeOwnershipAck();
                setAck(true);
              }}
              className={BTN_SECONDARY_LG}
            >
              完凸のままでOK
            </button>
          </>
        )}
      </div>
    </>
  );
}

/** 番号バッジ（設定済み＝青、未設定＝黄） */
function NoBadge({ no, done }: { no: number; done: boolean }) {
  return (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${
        done ? "bg-blue-600 text-white" : "bg-amber-400 text-amber-950"
      }`}
    >
      {no}
    </span>
  );
}

/** 番号つきの欄。onClick があればボタン、無ければ children をそのまま置く（自前の選択欄用） */
function PremiseField({
  no,
  label,
  hint,
  hintLink,
  done,
  onClick,
  below,
  children,
}: {
  no: number;
  label: string;
  hint?: string;
  /** ⓘ をヘルプページへのリンクにする（例 "/help#produce"） */
  hintLink?: string;
  done: boolean;
  onClick?: () => void;
  /** 欄の下に添えるもの（特訓・才能開花など） */
  below?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-1.5">
        <NoBadge no={no} done={done} />
        <span className={LABEL}>{label}</span>
        {hint && <Hint text={hint} />}
        {hintLink && (
          <Link
            to={hintLink}
            title="説明を見る（ヘルプページ）"
            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-400 transition hover:text-blue-600"
          >
            <Info size={14} />
          </Link>
        )}
      </div>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className={`flex h-11 w-full items-center gap-2 rounded-lg border px-3 text-left text-base text-slate-900 transition ${
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
      {below}
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
      <p className="mb-1.5 text-sm font-bold text-slate-800">
        {title}
        {hint && <span className="ml-1.5 text-xs font-normal text-slate-400">{hint}</span>}
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
