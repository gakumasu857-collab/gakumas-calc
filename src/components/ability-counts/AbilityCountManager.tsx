import { useMemo, useState } from "react";
import { Pencil, Plus, RotateCcw, X } from "lucide-react";
import {
  ABILITY_CATEGORIES,
  abilityMax,
  DEFAULT_MAX,
  SET_PLAN_OPTIONS,
  setVisibleInScenario,
} from "@/data/abilityCounts";
import { ABILITY_NAMES, type AbilityName } from "@/data/constants";
import { SUPPORT_CATALOG } from "@/data/supportCardCatalog";
import { useAbilityCounts } from "@/lib/useAbilityCounts";
import { useScenario } from "@/lib/useScenario";
import { useSelectedSupports } from "@/lib/useSelectedSupports";
import SetEditModal from "./SetEditModal";

/** 列幅(rem): アビリティ名列 / セット列（プランはチップ表示になったぶん少し狭める） */
const NAME_COL_REM = 10;
const SET_COL_REM = 6.5;

/** プランチップの色（セットヘッダー・編集モーダルで使用） */
export const SET_PLAN_CHIP: Record<string, string> = {
  センス: "bg-rose-100 text-rose-700",
  ロジック: "bg-emerald-100 text-emerald-700",
  アノマリー: "bg-violet-100 text-violet-700",
  好調: "bg-rose-100 text-rose-700",
  集中: "bg-rose-100 text-rose-700",
  好印象: "bg-emerald-100 text-emerald-700",
  やる気: "bg-emerald-100 text-emerald-700",
  強気: "bg-violet-100 text-violet-700",
  全力: "bg-violet-100 text-violet-700",
};

/** 表では分類見出しを挟まず全アビリティを並べる（分類はモーダル側だけで使う） */
const ALL_ABILITIES: AbilityName[] = ABILITY_CATEGORIES.flatMap((c) => [
  ...c.abilities,
]);

const CATALOG_BY_ID = new Map(SUPPORT_CATALOG.map((c) => [c.id, c]));

type ActiveCell = {
  setId: string;
  ability: AbilityName;
  /** 参照列（選択中セットのコピー表示）側のセルか */
  ref?: boolean;
} | null;

/**
 * 発動回数ページ全体。
 * 表: 縦=アビリティ全件、横=セット（固定幅・あふれたら横スクロール）。
 * ヘッダーは2段（上段=参照チェックボックス、下段=セット名）。
 * チェックしたセットはアビリティ名の右隣の参照列にコピー表示される。
 */
export default function AbilityCountManager() {
  const store = useAbilityCounts();
  const { scenario } = useScenario();
  const selectedSupports = useSelectedSupports();
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [activeCell, setActiveCell] = useState<ActiveCell>(null);
  const [addingName, setAddingName] = useState<string | null>(null);
  const [addingPlan, setAddingPlan] = useState("");
  const [onlyFormation, setOnlyFormation] = useState(false);

  // シナリオに合うテンプレだけ表示（HIF用/NIA用。ユーザーセットは常に表示）
  const visibleSets = store.sets.filter((s) =>
    setVisibleInScenario(s.id, scenario),
  );
  const selectedSet = store.sets.find((s) => s.id === store.selectedSetId);
  const editingSet = store.sets.find((s) => s.id === editingSetId);
  const totalCols = visibleSets.length + 1; // +1 = 参照列（常設）

  // 編成中（選択サポカ6枠）のカードが持つアビリティの集合
  const formationAbilities = useMemo(() => {
    const keys = new Set<AbilityName>();
    for (const slot of selectedSupports.slots) {
      if (!slot) continue;
      const card = CATALOG_BY_ID.get(slot.id);
      if (card) for (const key of card.abilityKeys) keys.add(key);
    }
    return keys;
  }, [selectedSupports.slots]);

  const visibleAbilities = onlyFormation
    ? ALL_ABILITIES.filter((key) => formationAbilities.has(key))
    : ALL_ABILITIES;

  const submitNewSet = () => {
    if (addingName === null) return;
    store.addSet(addingName.trim(), addingPlan);
    setAddingName(null);
    setAddingPlan("");
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-xs text-slate-500">
          セルクリックで回数を編集、セット名クリックで一括編集。
          <b className="text-slate-600">
            回数にはサポカの前イベ・後イベによる発動分は含めないでください（編成に応じて自動で上乗せされます）。
          </b>
          {!selectedSet && (
            <span className="font-medium text-blue-600">
              {" "}
              参照セット未選択です。セット名の上のチェックで選んでください。
            </span>
          )}
        </p>
        <div className="ml-auto flex items-center gap-1.5">
          {/* 編成中サポカのアビリティだけに絞る */}
          <button
            type="button"
            onClick={() => setOnlyFormation((v) => !v)}
            title="計算ページの選択サポカ6枚が持つアビリティだけを表示します"
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
              onlyFormation
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-300 text-slate-500 hover:bg-slate-100"
            }`}
          >
            編成中のアビリティのみ
            {onlyFormation && `（${visibleAbilities.length}件）`}
          </button>
          {/* 全部消してしまった人向けの救済リセット */}
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  "テンプレセットの回数をすべて初期値に戻します。よろしいですか？（追加したセットは影響を受けません）",
                )
              ) {
                store.resetAllDefaults();
              }
            }}
            className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100"
          >
            <RotateCcw size={13} />
            テンプレを初期値に戻す
          </button>
          {addingName === null ? (
            <button
              type="button"
              onClick={() => setAddingName("")}
              className="flex items-center gap-1 rounded-lg border border-blue-600 px-2.5 py-1.5 text-xs font-medium text-blue-600 transition hover:bg-blue-50"
            >
              <Plus size={13} />
              セット追加
            </button>
          ) : (
            <>
              <input
                type="text"
                autoFocus
                value={addingName}
                onChange={(e) => setAddingName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitNewSet()}
                placeholder="セット名"
                className="w-40 rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-500"
              />
              <select
                value={addingPlan}
                onChange={(e) => setAddingPlan(e.target.value)}
                title="プラン/スタイル（試験補助を強めるときのアイテム評価の判定に使います）"
                className="rounded-lg border border-slate-300 bg-white px-1.5 py-1.5 text-xs text-slate-700"
              >
                <option value="">プランなし</option>
                {SET_PLAN_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={submitNewSet}
                className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-blue-500"
              >
                追加
              </button>
              <button
                type="button"
                onClick={() => setAddingName(null)}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-100"
              >
                キャンセル
              </button>
            </>
          )}
        </div>
      </div>

      {/* 固定幅の表。セットが増えたら右へ伸びて横スクロール。
          下端のセルでもポップオーバーが切れないよう下に余白を確保 */}
      <div className="overflow-x-auto pb-16">
        {/* border-collapse だと固定列の枠線がスクロールで置いていかれるため border-separate を使う */}
        <table
          className="w-full table-fixed border-separate border-spacing-0 border-2 border-l-0 border-slate-500 tabular-nums"
          style={{ minWidth: `${NAME_COL_REM + SET_COL_REM * totalCols}rem` }}
        >
          <colgroup>
            <col style={{ width: `${NAME_COL_REM}rem` }} />
            <col style={{ width: `${SET_COL_REM}rem` }} />
            {visibleSets.map((set) => (
              <col key={set.id} style={{ width: `${SET_COL_REM}rem` }} />
            ))}
          </colgroup>
          <thead>
            {/* 上段: 参照チェックボックス */}
            <tr>
              <th
                rowSpan={2}
                className="sticky left-0 z-10 border-b-2 border-l-2 border-r-2 border-slate-400 border-l-slate-500 bg-slate-100 px-2 text-left text-xs font-bold text-slate-800"
              >
                アビリティ
              </th>
              {/* 参照列ヘッダー（常設・左に固定） */}
              <th
                rowSpan={2}
                className="sticky left-40 z-10 border-b-2 border-r-2 border-slate-400 bg-blue-100 p-0"
              >
                {selectedSet ? (
                  <div className="flex flex-col items-center gap-0.5 px-1 py-1">
                    <span className="text-[9px] font-medium text-blue-500">
                      選択されているセット
                    </span>
                    <div className="flex w-full items-center gap-0.5">
                      <span
                        title={selectedSet.name}
                        className="min-w-0 flex-1 truncate text-center text-xs font-bold text-blue-800"
                      >
                        {selectedSet.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => store.selectSet(selectedSet.id)}
                        title="参照を解除"
                        className="shrink-0 rounded p-0.5 text-blue-400 hover:bg-blue-200 hover:text-blue-700"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="px-1 py-1 text-center text-[10px] font-semibold leading-tight text-blue-400">
                    選択されている
                    <br />
                    セット
                  </div>
                )}
              </th>
              {visibleSets.map((set) => {
                const selected = set.id === store.selectedSetId;
                return (
                  <th
                    key={set.id}
                    className={`border-b border-r border-slate-400 py-1 text-center ${
                      selected ? "bg-blue-100" : "bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => store.selectSet(set.id)}
                      title="このセットを参照対象にする"
                      className="accent-blue-600"
                    />
                  </th>
                );
              })}
            </tr>
            {/* 下段: セット名 */}
            <tr>
              {visibleSets.map((set) => {
                const selected = set.id === store.selectedSetId;
                return (
                  <th
                    key={set.id}
                    className={`border-b-2 border-r border-slate-400 p-0 ${
                      selected ? "bg-blue-50" : "bg-slate-100"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setEditingSetId(set.id)}
                      title={`${set.name} を編集${set.plan ? `（プラン: ${set.plan}）` : ""}`}
                      className="group flex w-full flex-col items-center gap-0.5 px-1 py-1 text-xs font-semibold text-slate-800 hover:text-blue-600"
                    >
                      <span className="flex w-full items-center justify-center gap-0.5">
                        <span className="min-w-0 truncate group-hover:underline">
                          {set.name}
                        </span>
                        <Pencil
                          size={10}
                          className="shrink-0 text-slate-400 group-hover:text-blue-500"
                        />
                      </span>
                      {set.plan && (
                        <span
                          className={`rounded px-1 text-[9px] font-bold ${SET_PLAN_CHIP[set.plan] ?? "bg-slate-100 text-slate-500"}`}
                        >
                          {set.plan}
                        </span>
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleAbilities.map((ability) => {
              const max = abilityMax(ability);
              return (
                <tr key={ability}>
                  {/* アビリティ名（左固定） */}
                  <td className="sticky left-0 z-10 border-b border-l-2 border-r-2 border-b-slate-200 border-l-slate-500 border-r-slate-400 bg-white px-2 py-1.5 text-sm font-medium text-slate-800">
                    {ABILITY_NAMES[ability]}
                  </td>
                  {/* 参照列（選択中セット・直接編集可・左に固定・未選択なら空欄）。
                      ポップオーバーが下の行の固定セルや外側クリックレイヤーに埋まらないよう、
                      開いている間だけ重なり順を上げる */}
                  <td
                    className={`sticky left-40 border-b border-r-2 border-b-slate-200 border-r-slate-400 bg-blue-50 p-0 ${
                      activeCell?.ref && activeCell.ability === ability
                        ? "z-30"
                        : "z-10"
                    }`}
                  >
                    {selectedSet ? (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            activeCell?.ref && activeCell.ability === ability
                              ? setActiveCell(null)
                              : setActiveCell({
                                  setId: selectedSet.id,
                                  ability,
                                  ref: true,
                                })
                          }
                          className={`w-full transition ${
                            activeCell?.ref && activeCell.ability === ability
                              ? "bg-blue-100"
                              : "hover:bg-blue-100"
                          }`}
                        >
                          <CountValue
                            count={store.getCount(selectedSet, ability)}
                            max={max}
                          />
                        </button>
                        {activeCell?.ref && activeCell.ability === ability && (
                          <CountPopover
                            count={store.getCount(selectedSet, ability)}
                            max={max}
                            onChange={(value) =>
                              store.setCount(selectedSet, ability, value)
                            }
                          />
                        )}
                      </>
                    ) : (
                      // 回数セルと同じ高さにして、セット選択の前後で行の高さが変わらないようにする
                      <div className="py-1.5 text-base">&nbsp;</div>
                    )}
                  </td>
                  {visibleSets.map((set) => (
                    <CountCell
                      key={set.id}
                      ability={ability}
                      highlighted={set.id === store.selectedSetId}
                      count={store.getCount(set, ability)}
                      isActive={
                        activeCell?.setId === set.id &&
                        activeCell?.ability === ability &&
                        !activeCell?.ref
                      }
                      onOpen={() =>
                        setActiveCell({ setId: set.id, ability })
                      }
                      onClose={() => setActiveCell(null)}
                      onChange={(value) => store.setCount(set, ability, value)}
                    />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ポップオーバーの外側クリックで閉じる透明レイヤー */}
      {activeCell && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => setActiveCell(null)}
        />
      )}

      {editingSet && (
        <SetEditModal
          set={editingSet}
          deletable={store.isUserSet(editingSet.id)}
          getCount={store.getCount}
          setCount={store.setCount}
          onDelete={() => store.deleteSet(editingSet.id)}
          onDuplicate={() => {
            store.duplicateSet(editingSet);
            setEditingSetId(null);
          }}
          onRename={(name) => store.renameSet(editingSet.id, name)}
          onSetPlan={
            store.isUserSet(editingSet.id)
              ? (plan) => store.setPlan(editingSet.id, plan)
              : undefined
          }
          onClose={() => setEditingSetId(null)}
        />
      )}
    </div>
  );
}

/** 回数の表示（回数を主役に、上限は右下に薄く。値による色分けはしない） */
function CountValue({ count, max }: { count: number; max: number }) {
  return (
    <div className="relative w-full py-1.5 text-center text-base font-semibold text-slate-900">
      {count}
      {max !== DEFAULT_MAX && (
        <span className="absolute bottom-0.5 right-1 text-[8px] font-normal text-slate-300">
          {max}
        </span>
      )}
    </div>
  );
}

/** 回数編集のポップオーバー（±1/±10） */
function CountPopover({
  count,
  max,
  onChange,
}: {
  count: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="absolute left-1/2 top-full z-30 mt-1 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-slate-300 bg-white p-1.5 shadow-lg">
      {[-10, -1].map((step) => (
        <StepButton
          key={step}
          step={step}
          disabled={count <= 0}
          onClick={() => onChange(count + step)}
        />
      ))}
      <span className="min-w-12 text-center tabular-nums">
        <span className="text-lg font-semibold text-slate-800">{count}</span>
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
  );
}

function CountCell({
  ability,
  highlighted,
  count,
  isActive,
  onOpen,
  onClose,
  onChange,
}: {
  ability: AbilityName;
  highlighted: boolean;
  count: number;
  isActive: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChange: (value: number) => void;
}) {
  const max = abilityMax(ability);

  return (
    <td
      className={`relative border-b border-r border-slate-200 p-0 ${
        highlighted ? "bg-blue-50/60" : "bg-white"
      }`}
    >
      <button
        type="button"
        onClick={isActive ? onClose : onOpen}
        className={`w-full transition ${isActive ? "bg-blue-100" : "hover:bg-blue-50"}`}
      >
        <CountValue count={count} max={max} />
      </button>

      {/* 編集ポップオーバー */}
      {isActive && <CountPopover count={count} max={max} onChange={onChange} />}
    </td>
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
