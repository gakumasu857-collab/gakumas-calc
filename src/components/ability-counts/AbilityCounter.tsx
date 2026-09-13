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
  /** この育成だけの調整が入っている（計算ページ） */
  adjusted?: boolean;
  /** 調整中に添えるデフォルトの回数 */
  defaultCount?: number;
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
  onChange,
}: Props) {
  const max = abilityMax(abilityKey, scenario);

  return (
    <div className={`rounded-lg border bg-white p-2 ${adjusted ? "border-amber-300" : "border-slate-200"}`}>
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">
          {ABILITY_NAMES[abilityKey]}
        </span>
        {adjusted && (
          <span
            className="shrink-0 rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-800"
            title={defaultCount !== undefined ? `デフォルトは${defaultCount}回` : "この育成だけの調整"}
          >
            調整中{defaultCount !== undefined ? `（元${defaultCount}）` : ""}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-center gap-1">
        {[-10, -1].map((step) => (
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
        {[+1, +10].map((step) => (
          <StepButton
            key={step}
            step={step}
            disabled={count >= max}
            onClick={() => onChange(count + step)}
          />
        ))}
      </div>
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
