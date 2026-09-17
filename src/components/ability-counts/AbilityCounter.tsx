import { ABILITY_NAMES, type AbilityName } from "@/data/constants";
import { abilityMax } from "@/data/abilityCounts";
import type { ScenarioKey } from "@/data/scenarios";

type Props = {
  abilityKey: AbilityName;
  /** 渡すと上限にシナリオのスケジュール回数（お出かけ等）も反映する */
  scenario?: ScenarioKey;
  count: number;
  /** 編成サポカの前イベ・後イベによる上乗せ回数（表示のみ・緑） */
  extraCount?: number;
  /** 変更が入っている（薄い黄色の背景と「変更」の印。外側に枠を出すと隣とくっつくので出さない） */
  adjusted?: boolean;
  /** 変更しているときに「元◯」として出す、変更前の回数 */
  defaultCount?: number;
  /** 「元◯」のツールチップ（省略時は計算ページ向けの文） */
  defaultHint?: string;
  /** ほかの回数から自動で決まる回数（スキル強化＝A＋M）。押して変えられなくする */
  readOnly?: boolean;
  /** 自動の回数のときの説明 */
  readOnlyNote?: string;
  onChange: (value: number) => void;
};

/** アビリティ1件のカード: 名前 + [-10][-1] 回数/max [+1][+10] */
export default function AbilityCounter({
  abilityKey,
  scenario,
  count,
  extraCount = 0,
  adjusted = false,
  defaultCount,
  defaultHint,
  readOnly = false,
  readOnlyNote,
  onChange,
}: Props) {
  const max = abilityMax(abilityKey, scenario);

  return (
    <div
      className={`rounded-lg border p-2 transition ${
        adjusted ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"
      }`}
      title={
        adjusted && defaultCount !== undefined
          ? (defaultHint ??
            `デフォルトは${defaultCount}回（「上書き保存」でこの値をデフォルトにできます）`)
          : readOnly
            ? readOnlyNote
            : undefined
      }
    >
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">
          {ABILITY_NAMES[abilityKey]}
        </span>
        {adjusted && (
          <span className="shrink-0 rounded bg-amber-400 px-1 text-[10px] font-bold text-amber-950">
            変更{defaultCount !== undefined ? `（元${defaultCount}）` : ""}
          </span>
        )}
        {readOnly && !adjusted && (
          <span className="shrink-0 rounded bg-slate-200 px-1 text-[10px] font-bold text-slate-500">
            自動
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-center gap-1">
        {!readOnly &&
          [-10, -1].map((step) => (
            <StepButton
              key={step}
              step={step}
              disabled={count <= 0}
              onClick={() => onChange(count + step)}
            />
          ))}
        {/* 回数を大きく・上限は小さく薄く */}
        <span className="min-w-14 text-center tabular-nums">
          {extraCount > 0 ? (
            <span
              className="text-lg font-semibold text-emerald-600"
              title={`セット${count}回＋編成サポカのイベントで＋${extraCount}回（上限${max}）`}
            >
              {Math.min(max, count + extraCount)}
            </span>
          ) : (
            <span className="text-lg font-semibold text-slate-800">{count}</span>
          )}
          <span className="ml-0.5 text-[10px] text-slate-400">/{max}</span>
        </span>
        {!readOnly &&
          [+1, +10].map((step) => (
            <StepButton
              key={step}
              step={step}
              disabled={count >= max}
              onClick={() => onChange(count + step)}
            />
          ))}
      </div>
      {readOnly && readOnlyNote && (
        <p className="mt-1 text-center text-[10px] leading-tight text-slate-400">
          {readOnlyNote}
        </p>
      )}
    </div>
  );
}

function StepButton({
  step,
  disabled,
  onClick,
}: {
  step: number;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-9 rounded-md border py-1 text-xs font-semibold transition ${
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
      }`}
    >
      {step > 0 ? `+${step}` : step}
    </button>
  );
}
