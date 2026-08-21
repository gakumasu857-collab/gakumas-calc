import { useState } from "react";
import { CalendarDays, Copy, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";
import ScheduleCalendarView from "@/components/ScheduleCalendarView";
import {
  ABILITY_CATEGORIES,
  SET_PLAN_OPTIONS,
  type AbilityCountSet,
  type CategoryKey,
} from "@/data/abilityCounts";
import type { AbilityName } from "@/data/constants";
import { useScenario } from "@/lib/useScenario";
import AbilityCounter from "./AbilityCounter";

type Props = {
  set: AbilityCountSet;
  /** 開いたときに選択しておく分類 */
  initialCategory?: CategoryKey;
  /** ユーザー追加セットなら削除可能 */
  deletable: boolean;
  getCount: (set: AbilityCountSet, key: AbilityName) => number;
  setCount: (set: AbilityCountSet, key: AbilityName, value: number) => void;
  /** 渡すと「選択サポカのアビリティのみ」フィルターが使える（編成中のアビリティ集合） */
  formationKeys?: Set<AbilityName>;
  /** 編成サポカの前イベ・後イベによる回数上乗せ（アビリティキー→回数。緑表示用） */
  eventExtras?: Partial<Record<AbilityName, number>>;
  onDelete: () => void;
  /** このセットを複製してユーザーセットとして追加 */
  onDuplicate: () => void;
  /** ユーザーセットの名前変更 */
  onRename: (name: string) => void;
  /** ユーザーセットのプラン変更（テンプレは名前から自動決定なので渡さない） */
  onSetPlan?: (plan: string) => void;
  onClose: () => void;
};

/** セット1つの発動回数を編集するモーダル。左=分類、右=選択中分類のアビリティのみ。 */
export default function SetEditModal({
  set,
  initialCategory,
  deletable,
  getCount,
  setCount,
  formationKeys,
  eventExtras,
  onDelete,
  onDuplicate,
  onRename,
  onSetPlan,
  onClose,
}: Props) {
  const [category, setCategory] = useState<CategoryKey>(
    initialCategory ?? ABILITY_CATEGORIES[0].key,
  );
  // 編成フィルターは渡されたときだけ表示（計算ページからはデフォルトON）
  const [onlyFormation, setOnlyFormation] = useState(
    formationKeys !== undefined,
  );
  // 編成サポカの前イベ・後イベによる上乗せ回数（緑表示）を反映するか
  const [withEvents, setWithEvents] = useState(true);
  // スケジュール表（何週/日に何があるか）のモーダル
  const [schedOpen, setSchedOpen] = useState(false);
  const { scenario } = useScenario();
  const current = ABILITY_CATEGORIES.find((c) => c.key === category)!;
  // 「スキル獲得」はワッペン・札の枚数入力に使うので、絞り込み中もどのサポカでも表示する
  const visibleAbilities =
    onlyFormation && formationKeys
      ? current.abilities.filter(
          (key) => key === "skill_ac" || formationKeys.has(key),
        )
      : [...current.abilities];

  return (
    <Modal
      title={`${set.name} の発動回数`}
      onClose={onClose}
      widthClass="max-w-4xl"
    >
      {/* ユーザーセットは名前・プランを変更できる */}
      {deletable ? (
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <label className="flex min-w-52 flex-1 items-center gap-2">
            セット名:
            <input
              type="text"
              defaultValue={set.name}
              onChange={(e) => onRename(e.target.value.trim() || set.name)}
              className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-500"
            />
          </label>
          {onSetPlan && (
            <label
              className="flex items-center gap-2"
              title="試験補助を強めるとき、アイテム評価をこのプラン/スタイル向けのものだけ加点します"
            >
              プラン:
              <select
                value={set.plan}
                onChange={(e) => onSetPlan(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-1.5 py-1.5 text-xs text-slate-700"
              >
                <option value="">なし</option>
                {SET_PLAN_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      ) : (
        <p className="mb-3 text-xs text-slate-400">
          プラン: <b className="text-slate-600">{set.plan || "なし"}</b>
          （テンプレのプランはセット名から自動で決まります。変えたい場合は複製してください）
        </p>
      )}

      {/* 分類を切り替えてもモーダルの大きさが変わらないよう高さを固定 */}
      <div className="flex h-[65vh] flex-col gap-3 sm:h-[28rem] sm:flex-row">
        {/* 左: 分類ボタン（スマホでは横並び折り返し） */}
        <div className="flex shrink-0 flex-row flex-wrap gap-1.5 sm:w-48 sm:flex-col">
          {ABILITY_CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(c.key)}
              className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${
                c.key === category
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {c.label}
            </button>
          ))}

          <div className="flex flex-row flex-wrap gap-1.5 sm:mt-auto sm:flex-col">
            {/* スケジュール表 */}
            <button
              type="button"
              onClick={() => setSchedOpen(true)}
              title="このシナリオの育成スケジュール（何週/日に何があるか）を見る"
              className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
            >
              <CalendarDays size={13} />
              スケジュール
            </button>
            {/* 複製 */}
            <button
              type="button"
              onClick={onDuplicate}
              className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
            >
              <Copy size={13} />
              このセットを複製
            </button>
            {/* ユーザーセットの削除 */}
            {deletable && (
              <button
                type="button"
                onClick={() => {
                  onDelete();
                  onClose();
                }}
                className="flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-500 transition hover:bg-red-50"
              >
                <Trash2 size={13} />
                このセットを削除
              </button>
            )}
          </div>
        </div>

        {/* 右: 選択中の分類のアビリティだけ表示（少ない分類では下が余白になる） */}
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {(formationKeys || eventExtras) && (
            <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1">
              {formationKeys && (
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={onlyFormation}
                    onChange={(e) => setOnlyFormation(e.target.checked)}
                    className="accent-blue-600"
                  />
                  選択サポカのアビリティのみ（全体で{formationKeys.size}種）
                </label>
              )}
              {eventExtras && (
                <label
                  className="flex items-center gap-1.5 text-xs text-slate-600"
                  title="編成サポカ6枚の前イベ・後イベ（スキル獲得・強化・チェンジ等）による回数の上乗せを緑の数字で表示します"
                >
                  <input
                    type="checkbox"
                    checked={withEvents}
                    onChange={(e) => setWithEvents(e.target.checked)}
                    className="accent-emerald-600"
                  />
                  サポカのイベントを反映
                  {withEvents && (
                    <span className="font-bold text-emerald-600">（緑）</span>
                  )}
                </label>
              )}
            </div>
          )}
          <div className="grid min-h-0 flex-1 content-start grid-cols-1 gap-2 overflow-y-auto md:grid-cols-2">
            {visibleAbilities.length === 0 ? (
              <p className="text-xs text-slate-400">
                この分類には編成中のアビリティがありません。
              </p>
            ) : (
              visibleAbilities.map((key) => (
                <AbilityCounter
                  key={key}
                  abilityKey={key}
                  scenario={scenario}
                  count={getCount(set, key)}
                  extraCount={withEvents ? (eventExtras?.[key] ?? 0) : 0}
                  onChange={(value) => setCount(set, key, value)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {schedOpen && (
        <Modal
          title="育成スケジュール"
          onClose={() => setSchedOpen(false)}
          widthClass="max-w-3xl"
        >
          <ScheduleCalendarView scenario={scenario} />
        </Modal>
      )}
    </Modal>
  );
}
