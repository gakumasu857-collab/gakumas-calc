import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  X,
  Trash2,
} from "lucide-react";
import {
  ABILITY_CATEGORIES,
  abilityMax,
  DEFAULT_MAX,
  SET_PLAN_OPTIONS,
  setVisibleInScenario,
  type AbilityCountSet,
} from "@/data/abilityCounts";
import { ABILITY_NAMES, type AbilityName } from "@/data/constants";
import { SUPPORT_CATALOG } from "@/data/supportCardCatalog";
import { useAbilityCounts } from "@/lib/useAbilityCounts";
import { useScenario } from "@/lib/useScenario";
import { useSelectedSupports } from "@/lib/useSelectedSupports";
import Modal from "@/components/Modal";
import ScheduleCalendarView from "@/components/ScheduleCalendarView";
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
 * 操作は「追加」「削除&リセット」「表示の絞り込み」の3ボタン（それぞれモーダル）。
 * ここで編集するのはプロデュースごとのデフォルトの回数。編成後の「この育成での回数」は計算ページ側（adjust）。
 */
export default function AbilityCountManager() {
  const store = useAbilityCounts();
  const { scenario } = useScenario();
  const selectedSupports = useSelectedSupports();
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [activeCell, setActiveCell] = useState<ActiveCell>(null);
  const [onlyFormation, setOnlyFormation] = useState(false);
  const [hideTemplates, setHideTemplates] = useState(false);
  // 計算ページのセーブデータ用セットは既定で隠す（増えても表が広がらないように）
  const [showSaveSets, setShowSaveSets] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [delResetOpen, setDelResetOpen] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const [schedOpen, setSchedOpen] = useState(false);

  // シナリオに合うセットだけ（HIF用/NIA用/初用テンプレ＋ユーザーセット）
  const scenarioSets = store.sets.filter(
    (s) =>
      setVisibleInScenario(s.id, scenario) &&
      (showSaveSets || !store.saveIdOf(s.id)),
  );
  const saveSetCount = store.sets.filter((s) => store.saveIdOf(s.id)).length;
  const visibleSets = scenarioSets.filter(
    (s) => !hideTemplates || store.isUserSet(s.id),
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

  // 「絞り込み中」はセットや行を隠しているときだけ（セーブ用の追加表示は絞り込みではない）
  const filterActive = onlyFormation || hideTemplates;

  return (
    <div>
      {/* このページの位置づけ: プロデュースごとのデフォルトの回数。編成後の実際の回数は計算ページで */}
      <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-slate-700">
        <b className="text-sm text-slate-900">
          ここで決めるのは、プロデュース（発動回数セット）ごとの「デフォルトの回数」です。
        </b>
        <br />
        サポカ編成を決めたあとの実際の回数（前イベ・後イベの上乗せや、この育成だけの調整）は、
        <Link to="/calc" className="font-bold text-blue-700 underline">
          計算ページ
        </Link>
        の「発動回数」ボタンで行います（そこで変えてもここのデフォルトは変わりません）。
        <span className="ml-1 font-bold text-red-500">
          ここにはサポカの前イベ・後イベによる発動分は含めないでください。
        </span>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p>
          {!selectedSet && (
            <b className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-700">
              計算ページで使うプロデュースが未選択です。セット名の上のチェックで選べます（計算ページの「設定欄」でも選べます）。
            </b>
          )}
        </p>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSchedOpen(true)}
            title="このシナリオの育成スケジュール（何週/日に何があるか）を見る"
            className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100"
          >
            <CalendarDays size={13} />
            スケジュール
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            title="セットを新しく作る／既存のセットを複製する"
            className="flex items-center gap-1 rounded-lg border border-blue-600 px-2.5 py-1.5 text-xs font-medium text-blue-600 transition hover:bg-blue-50"
          >
            <Plus size={13} />
            追加
          </button>
          <button
            type="button"
            onClick={() => setDelResetOpen(true)}
            title="セットの削除・初期値へのリセット・全初期化"
            className="flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-500 transition hover:bg-red-50"
          >
            <Trash2 size={13} />
            削除&リセット
          </button>
          <button
            type="button"
            onClick={() => setOtherOpen(true)}
            title="表示の絞り込み（編成中のアビリティのみ・テンプレ非表示）"
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
              filterActive
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-300 text-slate-500 hover:bg-slate-100"
            }`}
          >
            <Settings2 size={13} />
            表示の絞り込み
            {filterActive && "（絞り込み中）"}
          </button>
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
                      計算ページで使用中
                    </span>
                    <div className="flex w-full items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => setEditingSetId(selectedSet.id)}
                        title={`${selectedSet.name} を編集（クリックで発動回数モーダル）`}
                        className="group flex min-w-0 flex-1 items-center justify-center gap-0.5 text-center text-xs font-bold text-blue-800 hover:text-blue-600"
                      >
                        <span className="min-w-0 truncate group-hover:underline">
                          {selectedSet.name}
                        </span>
                        <Pencil
                          size={10}
                          className="shrink-0 text-blue-300 group-hover:text-blue-600"
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => store.selectSet(selectedSet.id)}
                        title="使用をやめる（未選択にする）"
                        className="shrink-0 rounded p-0.5 text-blue-400 hover:bg-blue-200 hover:text-blue-700"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="px-1 py-1 text-center text-[10px] font-semibold leading-tight text-blue-400">
                    計算ページで
                    <br />
                    使用中
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
                      title="計算ページで使うプロデュースにする"
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
              const max = abilityMax(ability, scenario);
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
                      max={max}
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

      {schedOpen && (
        <Modal
          title="育成スケジュール"
          onClose={() => setSchedOpen(false)}
          widthClass="max-w-3xl"
        >
          <ScheduleCalendarView scenario={scenario} />
        </Modal>
      )}

      {addOpen && (
        <AddSetModal
          sets={scenarioSets}
          onCreate={(name, plan) => {
            store.addSet(name, plan);
            setAddOpen(false);
          }}
          onDuplicate={(set) => {
            store.duplicateSet(set);
            setAddOpen(false);
          }}
          onClose={() => setAddOpen(false)}
        />
      )}

      {delResetOpen && (
        <DeleteResetModal
          sets={scenarioSets}
          isUserSet={store.isUserSet}
          onDelete={(ids) => {
            for (const id of ids) store.deleteSet(id);
          }}
          onReset={(ids) => store.resetSets(ids)}
          onResetEverything={() => {
            store.resetEverything();
            setDelResetOpen(false);
          }}
          onClose={() => setDelResetOpen(false)}
        />
      )}

      {otherOpen && (
        <Modal title="表示の絞り込み" onClose={() => setOtherOpen(false)}>
          <div className="flex flex-col gap-3">
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={onlyFormation}
                onChange={(e) => setOnlyFormation(e.target.checked)}
                className="mt-0.5 accent-blue-600"
              />
              <span>
                編成中のアビリティのみ表示
                <span className="block text-xs text-slate-400">
                  計算ページの選択サポカ6枚が持つアビリティ（
                  {formationAbilities.size}種）だけを表に出します。
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={hideTemplates}
                onChange={(e) => setHideTemplates(e.target.checked)}
                className="mt-0.5 accent-blue-600"
              />
              <span>
                テンプレ非表示
                <span className="block text-xs text-slate-400">
                  テンプレセット（スプシ由来）を隠して、自分で追加したセットだけを表示します。
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={showSaveSets}
                onChange={(e) => setShowSaveSets(e.target.checked)}
                className="mt-0.5 accent-blue-600"
              />
              <span>
                セーブデータ用のセットも表示（{saveSetCount}件）
                <span className="block text-xs text-slate-400">
                  計算ページのセーブデータと一緒に保存された発動回数セットです。
                  普段は邪魔にならないよう隠しています。
                </span>
              </span>
            </label>
          </div>
        </Modal>
      )}

      {editingSet && (
        <SetEditModal
          set={editingSet}
          deletable={store.isUserSet(editingSet.id)}
          getCount={store.getCount}
          setCount={store.setCount}
          formationKeys={onlyFormation ? formationAbilities : undefined}
          onDelete={() => store.deleteSet(editingSet.id)}
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

/** 「追加」モーダル: 新規作成 or 既存セットの複製 */
function AddSetModal({
  sets,
  onCreate,
  onDuplicate,
  onClose,
}: {
  sets: AbilityCountSet[];
  onCreate: (name: string, plan: string) => void;
  onDuplicate: (set: AbilityCountSet) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [plan, setPlan] = useState("");
  const [dupSource, setDupSource] = useState(sets[0]?.id ?? "");

  return (
    <Modal title="セットを追加" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-bold text-slate-600">
            新しく作る（回数はすべて0から）
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onCreate(name.trim(), plan)}
              placeholder="セット名"
              className="w-44 rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-500"
            />
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
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
              onClick={() => onCreate(name.trim(), plan)}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500"
            >
              作成
            </button>
          </div>
        </section>

        <section className="flex flex-col gap-2 border-t border-slate-200 pt-3">
          <h3 className="text-xs font-bold text-slate-600">
            既存のセットを複製する（回数・プランをコピー）
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={dupSource}
              onChange={(e) => setDupSource(e.target.value)}
              className="min-w-0 max-w-full rounded-lg border border-slate-300 bg-white px-1.5 py-1.5 text-xs text-slate-700"
            >
              {sets.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.plan ? `【${set.plan}】` : ""}
                  {set.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                const src = sets.find((x) => x.id === dupSource);
                if (src) onDuplicate(src);
              }}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500"
            >
              複製する
            </button>
          </div>
        </section>
      </div>
    </Modal>
  );
}

/** 「削除&リセット」モーダル: セット複数選択 → 削除 or 初期値リセット。全初期化も */
function DeleteResetModal({
  sets,
  isUserSet,
  onDelete,
  onReset,
  onResetEverything,
  onClose,
}: {
  sets: AbilityCountSet[];
  isUserSet: (setId: string) => boolean;
  onDelete: (ids: string[]) => void;
  onReset: (ids: string[]) => void;
  onResetEverything: () => void;
  onClose: () => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const checkedUserSets = [...checked].filter((id) => isUserSet(id));

  const toggle = (id: string, on: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <Modal title="セットの削除&リセット" onClose={onClose}>
      <div className="flex flex-col gap-2">
        <p className="text-xs text-slate-500">
          対象のセットを選んで（複数可）、下のボタンで操作してください。
          テンプレセットは削除できません（リセットのみ）。
        </p>
        <div className="flex max-h-[45vh] flex-col gap-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2">
          {sets.map((set) => (
            <label
              key={set.id}
              className="flex items-center gap-2 text-sm text-slate-700"
            >
              <input
                type="checkbox"
                checked={checked.has(set.id)}
                onChange={(e) => toggle(set.id, e.target.checked)}
                className="accent-blue-600"
              />
              <span className="min-w-0 truncate">
                {set.plan ? `【${set.plan}】` : ""}
                {set.name}
              </span>
              {!isUserSet(set.id) && (
                <span className="shrink-0 rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-400">
                  テンプレ
                </span>
              )}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={checkedUserSets.length === 0}
            onClick={() => {
              if (
                window.confirm(
                  `選択した追加セット${checkedUserSets.length}件を削除します。よろしいですか？`,
                )
              ) {
                onDelete(checkedUserSets);
                setChecked(new Set());
              }
            }}
            className="flex items-center gap-1 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 size={13} />
            選択した{checkedUserSets.length}件を削除
          </button>
          <button
            type="button"
            disabled={checked.size === 0}
            onClick={() => {
              if (
                window.confirm(
                  `選択した${checked.size}件の回数を初期値に戻します。よろしいですか？（テンプレはスプシの初期値、追加セットは全て0に戻ります）`,
                )
              ) {
                onReset([...checked]);
                setChecked(new Set());
              }
            }}
            className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw size={13} />
            選択した{checked.size}件を初期値に戻す
          </button>
        </div>
        <div className="mt-1 border-t border-slate-200 pt-2">
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  "回数の変更・追加したセット・選択をすべて消して初期状態に戻します。よろしいですか？（追加セットも消えます）",
                )
              ) {
                onResetEverything();
              }
            }}
            className="flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-50"
          >
            <RotateCcw size={13} />
            全て初期状態に戻す（追加セットも削除）
          </button>
        </div>
      </div>
    </Modal>
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
  max,
  highlighted,
  count,
  isActive,
  onOpen,
  onClose,
  onChange,
}: {
  /** 最大回数（ラベルの(N回まで)とシナリオのスケジュール回数の小さい方） */
  max: number;
  highlighted: boolean;
  count: number;
  isActive: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChange: (value: number) => void;
}) {
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
