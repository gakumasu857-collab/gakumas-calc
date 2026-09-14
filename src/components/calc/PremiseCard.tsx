import { useState } from "react";
import { ChevronDown, Pencil } from "lucide-react";
import { FINAL_ROUNDS } from "@/data/schedule";
import {
  hatsuExamCapScore,
  NIA_FINAL_KIND_LABELS,
  NIA_FINAL_KINDS,
  SCENARIO_LABELS,
  type ScenarioKey,
} from "@/data/scenarios";
import { Field } from "@/components/calc/CalcCard";
import OwnershipField from "@/components/calc/OwnershipField";
import SetPickerField from "@/components/calc/SetPickerField";
import Hint from "@/components/Hint";
import NumberField from "@/components/NumberField";
import { BTN_SECONDARY, BTN_SECONDARY_LG, TYPE_CHIP, TYPE_SHORT } from "@/components/ui";
import { hifBonusValues, isHifBonusMax } from "@/data/hifBonus";
import { isNiaChallengeMax, niaChallengeTotal, normalizeNiaChallenge } from "@/data/niaChallenge";
import { GLOSSARY } from "@/lib/glossary";
import { readOwnershipAck, readOwnershipVisited } from "@/lib/ownershipAck";
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

/** 欄のラベル（番号の横）。欄の値も同じ text-sm にそろえる */
const LABEL = "text-sm font-bold text-slate-800";

/**
 * 「設定欄」（育成の前提）カード。
 * 青い見出し帯＋番号つきの5つの欄（シナリオ・アイドル・プロデュース・メモリー・所持状況）
 * ＋シナリオ別の本戦の点数。未設定の欄は黄色、設定済みは番号が青。
 * - アイドルの欄の右に特訓・才能開花のボタン（押すとモーダル）
 * - 所持状況はほかと同じ形の欄（プルダウンで既定＝全完凸／保存してある所持状況を切り替え、
 *   一番下から所持状況ページへ）。一度も決めていなければ黄色
 * 1〜4がそろうと、すぐ下の探索ボタンが押せる（所持状況は無くても探索できる）。
 */
export default function PremiseCard({
  r,
  onOpenScenario,
  onOpenIdol,
  onOpenMemory,
  onOpenIdolTraining,
  onOpenHifBonus,
  onOpenNiaChallenge,
}: {
  r: CalcResult;
  onOpenScenario: () => void;
  onOpenIdol: () => void;
  onOpenMemory: () => void;
  /** 特訓・才能開花のモーダルを開く（Pアイドルを選んだあと） */
  onOpenIdolTraining: () => void;
  /** H.I.F.ボーナスの調整モーダルを開く（H.I.F.のとき） */
  onOpenHifBonus: () => void;
  /** チャレンジPアイテムの獲得ボーナスのモーダルを開く（N.I.A.のとき） */
  onOpenNiaChallenge: () => void;
}) {
  const { settings } = r.calc;
  const memoryCount = r.memoryStore.count;
  const own = r.ownership;
  const owned = useOwnedSaves();
  // 所持状況を一度でも決めたか（既定のままでよいと選んだ／自分の所持状況を使っている／所持状況ページを開いた）
  const [ack, setAck] = useState(() => readOwnershipAck() || readOwnershipVisited());
  const ownershipDecided = ack || owned.activeId !== BUILTIN_ID;
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
            aside={
              done.idol ? (
                // 特訓・才能開花は欄の右のボタンから（評価値の横のPアイドル画像の歯車と同じ設定）
                <button
                  type="button"
                  onClick={onOpenIdolTraining}
                  title="特訓・才能開花を変更"
                  className={`${BTN_SECONDARY_LG} h-10 ${own ? "" : "text-red-600"}`}
                >
                  <Pencil size={12} />
                  {own ? `特訓${own.kunren}・開花${own.kaika}` : "未所持"}
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
          <PremiseField no={3} label="プロデュース" hint={GLOSSARY.pattern} done={done.set}>
            <SetPickerField r={r} />
          </PremiseField>
          {/* 4. メモリー（値は1行に収める。狭ければ「…」で切り、2行に折り返さない） */}
          <PremiseField no={4} label="メモリー" hint={GLOSSARY.memory} done={done.memory} onClick={onOpenMemory}>
            {memoryCount === 0 ? (
              <Unset />
            ) : (
              <span className="min-w-0 flex-1 truncate">
                <span className="mr-1.5">{memoryCount}枚</span>
                {TYPE_KEYS.map((t) => (
                  <span
                    key={t}
                    className={`mr-1.5 inline-block rounded px-1.5 py-0.5 align-middle text-xs font-semibold ${TYPE_CHIP[t]}`}
                  >
                    {TYPE_SHORT[t]} {r.perType[t].memFixed} / {r.perType[t].memPct}%
                  </span>
                ))}
              </span>
            )}
          </PremiseField>
          {/* 5. 所持状況（探索はここに登録したサポカから編成する。既定は全サポカ完凸） */}
          <PremiseField no={5} label="所持状況" hint={GLOSSARY.ownership} done={ownershipDecided}>
            <OwnershipField r={r} decided={ownershipDecided} onDecided={() => setAck(true)} />
          </PremiseField>
        </div>

        {/* 本戦・試験の点数（シナリオ別） */}
        <ScenarioScoreCard
          r={r}
          onOpenHifBonus={onOpenHifBonus}
          onOpenNiaChallenge={onOpenNiaChallenge}
        />
      </div>
    </section>
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
  done,
  onClick,
  aside,
  children,
}: {
  no: number;
  label: string;
  hint?: string;
  done: boolean;
  onClick?: () => void;
  /** 欄の右に添えるもの（特訓・才能開花のボタンなど。狭ければ下に回る） */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-1.5">
        <NoBadge no={no} done={done} />
        <span className={LABEL}>{label}</span>
        {hint && <Hint text={hint} />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onClick ? (
          <button
            type="button"
            onClick={onClick}
            className={`flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 text-left text-sm text-slate-900 transition ${
              done
                ? "border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/40"
                : "border-amber-400 bg-amber-50 hover:bg-amber-100"
            }`}
          >
            {children}
            <ChevronDown size={15} className="shrink-0 text-slate-400" />
          </button>
        ) : (
          <div className="min-w-0 flex-1">{children}</div>
        )}
        {aside}
      </div>
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
function ScenarioScoreCard({
  r,
  onOpenHifBonus,
  onOpenNiaChallenge,
}: {
  r: CalcResult;
  onOpenHifBonus: () => void;
  /** チャレンジPアイテムの獲得ボーナスのモーダルを開く（N.I.A.のとき） */
  onOpenNiaChallenge: () => void;
}) {
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
        <HifBonusRow r={r} onOpen={onOpenHifBonus} />
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
        <NiaFinalKindRow r={r} />
        <NiaChallengeRow r={r} onOpen={onOpenNiaChallenge} />
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
              max={hatsuExamCapScore(0)}
              sliderMax={hatsuExamCapScore(0)}
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
              max={hatsuExamCapScore(1)}
              sliderMax={hatsuExamCapScore(1)}
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

/** H.I.F.ボーナス（既定は全部最大）の要約と「調整」 */
function HifBonusRow({ r, onOpen }: { r: CalcResult; onOpen: () => void }) {
  const b = hifBonusValues(r.calc.settings.hifBonus);
  const max = isHifBonusMax(r.calc.settings.hifBonus);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2 text-xs text-slate-600">
      <span className="font-bold text-slate-700">H.I.F.ボーナス</span>
      <span>
        {max
          ? "全部最大"
          : `固定Lv Vo${b.levels.fixed.vocal}・Da${b.levels.fixed.dance}・Vi${b.levels.fixed.visual}／パラボLv Vo${b.levels.pct.vocal}・Da${b.levels.pct.dance}・Vi${b.levels.pct.visual}／SP率 Lv${b.levels.spRate}／本戦上限 Lv${b.levels.finalCap}（${b.statCap}）`}
      </span>
      <button type="button" onClick={onOpen} className={BTN_SECONDARY}>
        調整
      </button>
    </div>
  );
}

/** 最終オーディションの種類（FINALE／QUARTET。スコア→ステの式と上限が変わる） */
function NiaFinalKindRow({ r }: { r: CalcResult }) {
  const nia = r.niaSchedule;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2 text-xs text-slate-600">
      <span className="font-bold text-slate-700">最終オーディション</span>
      <span className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
        {NIA_FINAL_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => nia.setFinalKind(k)}
            className={`rounded-md px-2.5 py-1 text-xs font-bold transition ${
              nia.finalKind === k ? "bg-violet-600 text-white" : "text-slate-500 hover:bg-slate-200"
            }`}
          >
            {NIA_FINAL_KIND_LABELS[k]}
          </button>
        ))}
      </span>
      <span className="text-slate-400">（スコアからステへの換算と上限が変わる）</span>
    </div>
  );
}

/** チャレンジPアイテムの獲得ボーナス（N.I.A.。既定は各枠の最大）の要約と「調整」 */
function NiaChallengeRow({ r, onOpen }: { r: CalcResult; onOpen: () => void }) {
  const c = normalizeNiaChallenge(r.calc.settings.niaChallenge);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2 text-xs text-slate-600">
      <span className="font-bold text-slate-700">チャレンジPアイテム</span>
      <span>
        獲得ボーナス {c.map((v) => (v === 0 ? "無" : `${v}%`)).join("＋")}＝
        <b className="text-slate-800">+{niaChallengeTotal(c)}%</b>
        {isNiaChallengeMax(c) ? "（全部最大）" : ""}
        <span className="text-slate-400">（オーディションのステ上昇に掛かる）</span>
      </span>
      <button type="button" onClick={onOpen} className={BTN_SECONDARY}>
        調整
      </button>
    </div>
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
