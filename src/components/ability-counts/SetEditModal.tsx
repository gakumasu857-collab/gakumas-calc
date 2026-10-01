import { useState } from "react";
import { CalendarDays, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";
import ScheduleCalendarView from "@/components/ScheduleCalendarView";
import {
  ABILITY_CATEGORIES,
  abilityAppliesTo,
  autoCountNote,
  isAutoCountKey,
  SET_PLAN_OPTIONS,
  type AbilityCountSet,
  type CategoryKey,
} from "@/data/abilityCounts";
import type { AbilityName } from "@/data/constants";
import {
  isChoiceAbilityKey,
  type ChoiceEvent,
  type ScheduleChoices,
} from "@/data/scheduleCalendar";
import { useScenario } from "@/lib/useScenario";
import AbilityCounter from "./AbilityCounter";
import ScheduleChoiceGrid from "./ScheduleChoiceGrid";

type Props = {
  set: AbilityCountSet;
  /**
   * default: プロデュース設定ページ（このセットのデフォルトの回数を編集）
   * run: 計算ページ（この育成だけの回数。デフォルトは変えない）
   */
  mode?: "default" | "run";
  /**
   * 変更前の回数（「元◯」の表示用）。
   * run＝プロデュースのデフォルト、default＝スプレッドシート由来の最初の回数（自分で追加したセットは null）
   */
  defaultCount?: (set: AbilityCountSet, key: AbilityName) => number | null;
  /** 変更が入っているか（run＝この育成だけの調整、default＝最初の回数からの変更） */
  isAdjusted?: (set: AbilityCountSet, key: AbilityName) => boolean;
  /** run のとき: 調整の件数 */
  adjustedCount?: number;
  /** run のとき: 調整をすべて消してデフォルトに戻す */
  onResetAdjust?: () => void;
  /** run のとき: 調整した回数をこのセットのデフォルトにする（上書き保存） */
  onCommitAdjust?: () => void;
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
  /** ユーザーセットの名前変更 */
  onRename: (name: string) => void;
  /** ユーザーセットのプラン変更（テンプレは名前から自動決定なので渡さない） */
  onSetPlan?: (plan: string) => void;
  onClose: () => void;
  /**
   * スケジュールの選択（週・日ごとに1つ）。渡すと「スケジュール」分類が正方形カードの選択UIになり、
   * お出かけ・相談・活動支給・特別指導・休むの回数はカードで決まる（数のカウンターは出さない）
   */
  choices?: ScheduleChoices;
  onPickChoice?: (rowId: string, event: ChoiceEvent | null) => void;
  /** 保存されていた回数がスケジュールに入りきらなかった分（あれば注意書きを出す） */
  choiceNote?: { event: ChoiceEvent; from: number; to: number }[];
  /** run のとき: この育成だけ変えた週（黄色い枠） */
  choiceAdjustedRowIds?: ReadonlySet<string>;
  /** 出し方（計算ページからは左の引き出し） */
  side?: "center" | "left";
};

/** セット1つの発動回数を編集するモーダル。左=分類、右=選択中分類のアビリティのみ。 */
export default function SetEditModal({
  set,
  mode = "default",
  defaultCount,
  isAdjusted,
  adjustedCount = 0,
  onResetAdjust,
  onCommitAdjust,
  initialCategory,
  deletable,
  getCount,
  setCount,
  formationKeys,
  eventExtras,
  onDelete,
  onRename,
  onSetPlan,
  onClose,
  choices,
  onPickChoice,
  choiceNote,
  choiceAdjustedRowIds,
  side,
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
  // スケジュール分類は、選択カードで決まるアビリティ（お出かけ・相談・活動支給・特別指導・休む）を
  // カウンターでは出さない（カードで1つ選ぶと回数が決まるため）
  const showChoiceGrid = category === "schedule" && !!choices;
  // 「スキル獲得」はワッペン・札の枚数入力に使うので、絞り込み中もどのサポカでも表示する。
  // 「Pポイント営業」（N.I.A だけ）もサポカのアビリティではないので、絞り込み中も表示する
  const visibleAbilities = (
    onlyFormation && formationKeys
      ? current.abilities.filter(
          (key) => key === "skill_ac" || key === "p_sale" || formationKeys.has(key),
        )
      : [...current.abilities]
  )
    .filter((key) => !(showChoiceGrid && isChoiceAbilityKey(key)))
    .filter((key) => abilityAppliesTo(key, scenario));

  return (
    <Modal
      title={
        mode === "run"
          ? `${set.name} の発動回数`
          : `${set.name} の発動回数（デフォルト）`
      }
      onClose={onClose}
      widthClass={side === "left" ? "max-w-3xl" : "max-w-4xl"}
      side={side}
      fill
    >
      {/* 計算ページから開いたとき: なぜ回数が並んでいるのかを先に言う
          （「ステータスはここから変えられます」で開くと差し入れ・ドリンク交換などが出てくるため） */}
      {mode === "run" && (
        <p className="mb-2 shrink-0 text-xs leading-relaxed text-slate-600">
          サポカで上がるステータスは、<b>サポカのアビリティが何回発動するか</b>
          で決まります（例: 差し入れのときに上がるサポカは、差し入れの回数ぶん上がります）。ここで、その回数を実際の育成に合わせて変えられます。
        </p>
      )}
      {/* デフォルト（プロデュース設定ページ）と、この育成での回数（計算ページ）の違いを明示する */}
      {mode === "run" ? (
        <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-slate-700">
          <span>
            <b>今の評価値に適応されている回数</b>です。ここでの変更を次回以降の探索に適用する場合は「上書き保存」
          </span>
          <span className="flex items-center gap-2">
            {onCommitAdjust && (
              <button
                type="button"
                disabled={adjustedCount === 0}
                onClick={onCommitAdjust}
                title="ここで変えた回数（黄色い枠）をこのプロデュースのデフォルトにします（前イベ・後イベの上乗せ分は含めません）"
                className="rounded-md bg-blue-600 px-2.5 py-1 font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                上書き保存{adjustedCount > 0 ? `（${adjustedCount}件）` : ""}
              </button>
            )}
            {adjustedCount > 0 && onResetAdjust && (
              <button
                type="button"
                onClick={onResetAdjust}
                className="rounded-md border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-600 hover:bg-slate-100"
              >
                すべてデフォルトに戻す
              </button>
            )}
          </span>
          {/* 上書き保存に入るのは素の回数だけ（緑＝サポカのイベントによる上乗せは入らない） */}
          <span className="w-full text-[11px] leading-relaxed text-slate-600">
            上書き保存されるのは<b>プロデュースの回数だけ</b>です。
            <b className="text-emerald-700">緑の数字（サポカのイベントによる上乗せ）</b>
            は含まずに保存します。
          </span>
        </div>
      ) : (
        <div className="mb-3 shrink-0 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-slate-700">
          <b>このプロデュース（セット）のデフォルトの回数</b>です。サポカ編成を決めたあとの、この育成だけの調整は計算ページ左端の「プロデュース」タブで（そこで変えても、「上書き保存」を押さない限りここは変わりません）。
        </div>
      )}
      {/* ユーザーセットは名前・プランを変更できる */}
      {deletable ? (
        <div className="mb-3 flex shrink-0 flex-wrap items-center gap-3 text-xs text-slate-500">
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
        <p className="mb-3 shrink-0 text-xs text-slate-400">
          プラン: <b className="text-slate-600">{set.plan || "なし"}</b>
          （テンプレのプランはセット名から自動で決まります）
        </p>
      )}

      {/* モーダルの高さは固定（Modal の fill）。この枠が残りの高さを使い、右側だけがスクロールする
          （枠の高さを決め打ちすると、上の帯の分だけモーダル全体がスクロールしてしまうため） */}
      {/* 低い画面（スマホ・横向き）では最小の高さを保ち、足りない分はモーダル本体がスクロールする
          （最小を持たせないと右のカードが細い帯になり、左のボタンが右の下に回り込んで押せなくなる） */}
      <div className="flex min-h-[22rem] flex-1 flex-col gap-3 sm:min-h-[18rem] sm:flex-row">
        {/* 左: 分類ボタン（スマホでは横並び折り返し。PC幅では列の中で縦に収め、あふれたら列の中だけスクロール） */}
        <div className="flex shrink-0 flex-row flex-wrap gap-1.5 sm:w-48 sm:flex-col sm:flex-nowrap sm:overflow-y-auto">
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

          {/* 分類ではないボタン（スケジュール表・削除）。スマホでは分類ボタンの次の行に区切り線を入れて分ける
              （分類の「スケジュール」と同じ行に並ぶと見分けがつかないため）。PCでは列の一番下 */}
          <div className="flex w-full flex-row flex-wrap gap-1.5 border-t border-dashed border-slate-300 pt-1.5 sm:mt-auto sm:w-auto sm:flex-col sm:border-t-0 sm:pt-0">
            {/* スケジュール表 */}
            <button
              type="button"
              onClick={() => setSchedOpen(true)}
              title="このシナリオの育成スケジュール（何週/日に何があるか）を見る"
              className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
            >
              <CalendarDays size={13} />
              スケジュール表を見る
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
            {/* スケジュール: 週（日）ごとに1つ選ぶ正方形カード。選んだ回数がそのまま発動回数になる */}
            {showChoiceGrid && choices && (
              <div className="md:col-span-2">
                <ScheduleChoiceGrid
                  scenario={scenario}
                  choices={choices}
                  onPick={onPickChoice}
                  adjustedRowIds={choiceAdjustedRowIds}
                  note={choiceNote}
                />
                <p className="mt-2 border-t border-slate-200 pt-2 text-xs font-bold text-slate-600">
                  そのほかのスケジュールの回数
                </p>
              </div>
            )}
            {visibleAbilities.length === 0 && !showChoiceGrid ? (
              <p className="text-xs text-slate-400">
                この分類には編成中のアビリティがありません。
              </p>
            ) : (
              visibleAbilities.map((key) => {
                const before = defaultCount?.(set, key) ?? undefined;
                return (
                  <AbilityCounter
                    key={key}
                    abilityKey={key}
                    scenario={scenario}
                    count={getCount(set, key)}
                    extraCount={withEvents ? (eventExtras?.[key] ?? 0) : 0}
                    adjusted={isAdjusted ? isAdjusted(set, key) : false}
                    defaultCount={before}
                    defaultHint={
                      before === undefined
                        ? undefined
                        : mode === "run"
                          ? `デフォルトは${before}回（「上書き保存」でこの値をデフォルトにできます）`
                          : `最初の回数は${before}回です`
                    }
                    readOnly={isAutoCountKey(key)}
                    readOnlyNote={autoCountNote(key)}
                    onChange={(value) => setCount(set, key, value)}
                  />
                );
              })
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
