import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronDown,
  FolderOpen,
  ImageDown,
  Save,
  Settings,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { setVisibleInScenario } from "@/data/abilityCounts";
import { FINAL_ROUNDS } from "@/data/schedule";
import { SCENARIO_LABELS, type ScenarioKey } from "@/data/scenarios";
import { SUPPORT_CARD_DB } from "@/data/supportCardsDb";
import { SUPPORT_CATALOG } from "@/data/supportCardCatalog";
import AbilityCountDrawer from "@/components/calc/AbilityCountDrawer";
import PlanEditDrawer from "@/components/calc/PlanEditDrawer";
import {
  IdolPickerModal,
  ScenarioPickerModal,
  TheorySettingsModal,
} from "@/components/calc/SettingPickers";
import SupportPickerModal from "@/components/calc/SupportPickerModal";
import {
  AcquireToggle,
  PostEventButtons,
  PreAssign,
  StatEventToggle,
} from "@/components/EventControls";
import NumberField from "@/components/NumberField";
import ScoreDetailModal from "@/components/ScoreDetailModal";
import { runFullOptimize } from "@/lib/autoOptimize";
import { imageUrl } from "@/lib/config";
import { exportSheetImage } from "@/components/calc/ExportSheet";
import {
  examStyleTags,
  findBestFormation,
  planAllows,
  scoreOwnedCards,
  scoreRentalCandidates,
  sumEventContrib,
  typeCountsFromRatio,
} from "@/lib/formation";
import { buildAutoOptimizeInput } from "@/lib/buildOptimizeInput";
import { IDOL_RANKS } from "@/lib/pIdol";
import { produceRank } from "@/lib/produceRank";
import {
  preEventAutoActivations,
  preEventMax,
  preEventMaxLabel,
  preEventStatRelevant,
} from "@/lib/sheetScore";
import { useCalcResult, type SelectedMember } from "@/lib/useCalcResult";
import { useCardFlags } from "@/lib/useCardFlags";
import {
  TYPE_KEYS,
  TYPE_LABELS,
  type TypeKey,
} from "@/lib/useCalcSettings";

const CARD_BY_ID = new Map(SUPPORT_CARD_DB.map((c) => [c.id, c]));
const CARD_PLAN_BY_ID = new Map(SUPPORT_CARD_DB.map((c) => [c.id, c.plan]));
const SUPPORT_IMAGE_BY_ID = new Map(
  SUPPORT_CATALOG.map((c) => [c.id, c.image]),
);
const TYPE_JA: Record<TypeKey, "Vo" | "Da" | "Vi"> = {
  vocal: "Vo",
  dance: "Da",
  visual: "Vi",
};
const TYPE_CHIP: Record<TypeKey, string> = {
  vocal: "bg-red-100 text-red-700",
  dance: "bg-blue-100 text-blue-700",
  visual: "bg-yellow-100 text-yellow-700",
};
const TYPE_TEXT: Record<TypeKey, string> = {
  vocal: "text-red-600",
  dance: "text-blue-600",
  visual: "text-yellow-600",
};
/** シナリオごとの色と短縮名（設定ボタンのミニ■用。NIAは紫） */
const SCENARIO_STYLE: Record<ScenarioKey, { short: string; bg: string }> = {
  hif: { short: "H.I.F.", bg: "bg-sky-500" },
  niaMaster: { short: "N.I.A.", bg: "bg-violet-500" },
  hatsuLegend: { short: "初", bg: "bg-amber-500" },
};

/**
 * 計算シートページ。
 * 現在のステ・評価値は「選択サポカ」6枠を参照する（理想編成の自動採用ではない）。
 * 評価値 = Σmin(3200, 現在のステ)×2 + floor(合計スター性×7.5) + 本戦評価値 − 2000
 */
export default function CalcPage() {
  const r = useCalcResult();
  const flags = useCardFlags();
  const { calc, selected } = r;
  const { settings } = calc;

  const [saveName, setSaveName] = useState("");
  const [selectedSaveId, setSelectedSaveId] = useState("");
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [idealMsg, setIdealMsg] = useState<string | null>(null);
  const [idealBusy, setIdealBusy] = useState(false);
  const [detail, setDetail] = useState<SelectedMember | null>(null);
  const [optBusy, setOptBusy] = useState(false);
  const [optMsg, setOptMsg] = useState<string | null>(null);
  // 全自動最適化がイベント予算に合わせて提案した前イベ/後イベ設定（未反映）。
  // ユーザーが「反映する」を押して初めてサポカ設定へ書き込む。
  const [pendingOps, setPendingOps] = useState<
    { id: string; pre?: number; acquire?: false; post?: 0 }[] | null
  >(null);
  // 取得制限を反映した理論評価値（提案中だけ評価値ボックスに一時表示する）
  const [previewRating, setPreviewRating] = useState<number | null>(null);
  const [scenarioPickerOpen, setScenarioPickerOpen] = useState(false);
  const [idolPickerOpen, setIdolPickerOpen] = useState(false);
  const [theoryOpen, setTheoryOpen] = useState(false);

  const selectedSave = calc.saves.find((s) => s.id === selectedSaveId);
  // 評価値は「サポカ6枚が編成済み」かつ「育成（発動回数セット）を選択済み」のときだけ表示
  const canShowRating =
    r.members.every((m) => m !== null) && !!r.selectedSet;

  /**
   * 理想編成を計算して選択サポカへ一括設定。
   * 条件設定（取得回数・編成割合・SP・最低/最高ステ・試験補助・ステージアイテム）は
   * 全自動最適化（理論評価値）と同じものを引き継ぐ。
   */
  const applyIdealFormation = () => {
    setIdealBusy(true);
    setIdealMsg(null);
    // 「計算中…」を先に描画させてから重い探索を回す
    setTimeout(() => {
      try {
        const opts = {
          flags,
          plan: r.plan,
          noStageItems: settings.noStageItems,
        };
        const owned = scoreOwnedCards(r.getLevel, r.ctx, r.roles.typeRole, opts);
        const rentals = scoreRentalCandidates(r.ctx, r.roles.typeRole, opts);
        // ベースはサポカ抜きの現在ステ（レッスン・メモリー・Pアイドル込み）。上限溢れを考慮して選ぶ。
        // NIAでは札（スキルカード獲得→ファン投票数）の価値もステ換算で加点する
        const best = findBestFormation(owned, rentals, r.baseStats, {
          pinned: flags.pinned,
          spMin: settings.spMin,
          cap: r.statCap,
          maxTargets: {
            vocal: Math.min(r.statCap, settings.maxStats.vocal || r.statCap),
            dance: Math.min(r.statCap, settings.maxStats.dance || r.statCap),
            visual: Math.min(r.statCap, settings.maxStats.visual || r.statCap),
          },
          eventBudget: settings.eventBudget.enabled
            ? { pre: settings.eventBudget.pre, post: settings.eventBudget.post }
            : undefined,
          extraScore: r.niaFudaExtra,
          examAssist: settings.examAssist,
          examStyleTags: examStyleTags(r.selectedSet?.name ?? null),
          typeCounts: settings.typeRatio.enabled
            ? typeCountsFromRatio({
                vocal: settings.typeRatio.vocal,
                dance: settings.typeRatio.dance,
                visual: settings.typeRatio.visual,
              })
            : undefined,
          minStat: TYPE_KEYS.some((t) => settings.minStats[t] > 0)
            ? {
                req: settings.minStats,
                priority: [...TYPE_KEYS].sort(
                  (a, b) => r.typeRanks[a] - r.typeRanks[b],
                ),
              }
            : undefined,
        });
        if (!best) {
          setIdealMsg(
            "編成を組めません（プラン制限内の所持サポカが不足しています）",
          );
          return;
        }
        selected.setAll(best.picks.map((p) => ({ id: p.id, rental: p.rental })));
        setIdealMsg(
          best.spShortfall > 0
            ? `SPレッスン率の条件をあと${best.spShortfall}枚分満たせませんでした`
            : null,
        );
      } finally {
        setIdealBusy(false);
      }
    }, 30);
  };

  /**
   * 全自動最適化: レッスン（営業・授業）の踏み方×サポカ編成をまとめて探索して、
   * 評価値が一番高かった組み合わせを踏み方・選択サポカへ反映する。
   */
  const runAutoOptimize = () => {
    setOptBusy(true);
    setOptMsg(null);
    // 「計算中…」を先に描画させてから重い探索を回す
    setTimeout(() => {
      try {
        const res = runFullOptimize(
          buildAutoOptimizeInput(r, flags, settings),
        );
        if (!res) {
          setOptMsg(
            "編成を組めません（プラン制限内の所持サポカが不足しています）",
          );
          return;
        }
        if (res.hif)
          r.schedule.setPlan(
            res.hif.lessons,
            res.hif.classTypes,
            res.hif.examScores,
          );
        if (res.nia) r.niaSchedule.setPlan(res.nia.lessons, res.nia.sales);
        if (res.hatsu)
          r.hatsuSchedule.setPlan(res.hatsu.lessons, res.hatsu.classTypes);
        selected.setAll(res.slots);
        // イベント予算で発動しないことにした前イベ・後イベは「提案」として保持し、
        // 自動ではサポカ設定に反映しない（下のボタンを押して初めて反映）。
        const ops = res.eventOps ?? null;
        const hasOps = !!ops && ops.length > 0;
        setPendingOps(hasOps ? ops : null);
        // 取得制限つきの理論評価値を評価値ボックスに一時表示（サポカ設定は未変更）
        setPreviewRating(hasOps ? res.rating : null);
        const sec = (res.elapsedMs / 1000).toFixed(1);
        setOptMsg(
          `理論評価値 ${res.rating.toLocaleString()} の組み合わせを踏み方・選択サポカに反映しました（${res.evaluated.toLocaleString()}通りを探索・${sec}秒）` +
            (hasOps
              ? `。評価値ボックスには前イベ/後イベの取得制限を反映した値を表示しています（下のボタンでサポカ設定にも反映できます）`
              : "") +
            (res.spShortfall > 0
              ? `。SPレッスン率の条件はあと${res.spShortfall}枚分満たせませんでした`
              : ""),
        );
      } finally {
        setOptBusy(false);
      }
    }, 30);
  };

  /** 提案された前イベ/後イベの取得制限をサポカ設定（イベント回数）へ反映する */
  const applyPendingOps = () => {
    if (!pendingOps) return;
    for (const op of pendingOps) {
      if (op.acquire === false) r.events.setAcquire(op.id, false);
      if (op.pre !== undefined) r.events.set(op.id, "pre", op.pre);
      if (op.post !== undefined) r.events.set(op.id, "post", op.post);
    }
    setPendingOps(null);
    setPreviewRating(null);
    setOptMsg("前イベ/後イベの取得制限をサポカ設定に反映しました。");
  };

  /**
   * アイドル切替時、踏み方・試験のタイプ割当を審査基準に合わせて入れ替える
   * （旧アイドルでランクNだったタイプの入力を、新アイドルでランクNのタイプへ移す。
   *   例: 広→リーリヤ なら Voの踏み方→Vi、Da→Da、Vi→Vo）。
   */
  const remapSchedulesForIdol = (newIdol: string) => {
    const oldRanks = IDOL_RANKS[settings.idol];
    const newRanks = IDOL_RANKS[newIdol];
    if (!oldRanks || !newRanks) return;
    const rankToNewType = {} as Record<number, TypeKey>;
    for (const type of TYPE_KEYS) rankToNewType[newRanks[type]] = type;
    const map = {} as Record<TypeKey, TypeKey>;
    for (const type of TYPE_KEYS) {
      map[type] = rankToNewType[oldRanks[type]] ?? type;
    }
    // ランクが欠けている等で全単射にならない場合は入れ替えない
    if (new Set(Object.values(map)).size === TYPE_KEYS.length) {
      r.schedule.remapTypes(map);
      r.niaSchedule.remapTypes(map);
      r.hatsuSchedule.remapTypes(map);
    }
  };

  /** アイドルとPアイドルをまとめて設定（アイドルが変わるなら踏み方を入れ替え） */
  const applyIdolAndPIdol = (idol: string, pIdolCardName: string) => {
    if (idol !== settings.idol) remapSchedulesForIdol(idol);
    calc.update({ idol, pIdol: pIdolCardName });
  };

  return (
    <div className="grid gap-4 pl-9 sm:pl-10 lg:grid-cols-[360px_1fr] lg:items-start lg:pl-0">
      {/* ===== 入力（デスクトップでは右） ===== */}
      <div className="flex min-w-0 flex-col gap-4 lg:order-2">
        {/* 設定 */}
        <Card title="設定">
          <div className="flex flex-col gap-3 sm:flex-row">
            {/* Pアイドルの画像と情報（画像クリック=Pアイドル選択・歯車=特訓/開花） */}
            <div className="flex shrink-0 items-start gap-3">
              <PIdolImageEditor
                r={r}
                onOpenPicker={() => setIdolPickerOpen(true)}
              />
              <div className="flex flex-col gap-1 text-sm sm:hidden">
                <PIdolInfo r={r} />
              </div>
            </div>
            {/* 入力欄 */}
            <div className="min-w-0 flex-1">
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="育成シナリオ">
                  <button
                    type="button"
                    onClick={() => setScenarioPickerOpen(true)}
                    className={`${INPUT} flex w-full items-center gap-2 text-left`}
                  >
                    <span
                      className={`h-4 w-4 shrink-0 rounded ${SCENARIO_STYLE[r.scenario].bg}`}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {SCENARIO_LABELS[r.scenario]}
                    </span>
                    <ChevronDown size={14} className="shrink-0 text-slate-400" />
                  </button>
                </Field>
                <Field label="アイドル・Pアイドル">
                  <button
                    type="button"
                    onClick={() => setIdolPickerOpen(true)}
                    className={`${INPUT} flex w-full items-center justify-between gap-2 text-left`}
                  >
                    <span className="truncate">
                      {settings.idol}
                      {r.pMaster ? ` / ${r.pMaster.cardName}` : ""}
                    </span>
                    <ChevronDown size={14} className="shrink-0 text-slate-400" />
                  </button>
                </Field>
                <Field label="育成（発動回数セット）">
                  <select
                    value={r.ability.selectedSetId ?? ""}
                    onChange={(e) => {
                      if (e.target.value !== r.ability.selectedSetId)
                        r.ability.selectSet(e.target.value);
                    }}
                    className={INPUT}
                  >
                    <option value="">未選択</option>
                    {r.ability.sets
                      .filter((set) =>
                        setVisibleInScenario(set.id, r.scenario),
                      )
                      .map((set) => (
                        <option key={set.id} value={set.id}>
                          {set.name}
                        </option>
                      ))}
                  </select>
                </Field>
                {r.scenario === "hif" && (
                  <Field label="HIFワッペン発動回数">
                    <NumberField
                      value={settings.wappenCount}
                      onChange={(v) => calc.update({ wappenCount: v })}
                      max={20}
                      sliderMax={20}
                      className="w-full"
                    />
                  </Field>
                )}
              </div>
              <div className="mt-2 hidden text-sm sm:block">
                <PIdolInfo r={r} />
              </div>
            </div>
          </div>

          {/* メモリー（メモリーページのスロットを使用）。未設定は目立つ警告にする */}
          <div
            className={`mt-3 flex flex-wrap items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm ${
              r.memoryStore.selected.length === 0
                ? "border border-amber-300 bg-amber-50 text-amber-800"
                : "bg-slate-50 text-slate-600"
            }`}
          >
            <span className="font-semibold">
              メモリー
              {r.memoryStore.selected.length > 0 &&
                `（${r.memoryStore.selected.length}枚）`}
              :
            </span>
            {r.memoryStore.selected.length === 0 ? (
              <span>
                未設定です。実際の育成に合わせて設定しないと評価値が不正確になります。
              </span>
            ) : (
              TYPE_KEYS.map((t) => (
                <span key={t} className={`rounded px-1.5 py-0.5 ${TYPE_CHIP[t]}`}>
                  {TYPE_JA[t]} {r.perType[t].memFixed} / {r.perType[t].memPct}%
                </span>
              ))
            )}
            <Link
              to="/memory"
              className={`ml-auto text-xs underline ${
                r.memoryStore.selected.length === 0
                  ? "font-bold text-amber-700"
                  : "text-blue-600"
              }`}
            >
              {r.memoryStore.selected.length === 0
                ? "メモリーを設定する →"
                : "メモリーページで編集"}
            </Link>
          </div>
        </Card>

        {/* 本戦・試験の点数（設定の下・全自動最適化の上） */}
        <ScenarioScoreCard r={r} />

        {/* 全自動最適化 */}
        <Card
          title="全自動最適化"
          hint="シナリオ・名前・Pアイドル・育成セット・メモリーを選んでから押す"
        >
          {/* 求めるボタンの右隣に設定ボタン */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={runAutoOptimize}
              disabled={optBusy}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-wait disabled:opacity-60"
            >
              <Sparkles size={15} />
              {optBusy ? "計算中…" : "理論評価値を求める（編成＋踏み方を自動探索）"}
            </button>
            <button
              type="button"
              onClick={() => setTheoryOpen(true)}
              className={SMALL_BTN}
            >
              <Settings size={13} />
              条件設定
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            取得回数
            {settings.eventBudget.enabled
              ? `（前${settings.eventBudget.pre}枚/後${settings.eventBudget.post}回）`
              : "＝制限なし"}{" "}
            ／ 編成割合
            {settings.typeRatio.enabled
              ? `（${settings.typeRatio.vocal}:${settings.typeRatio.dance}:${settings.typeRatio.visual}）`
              : "＝自由"}{" "}
            ／ SP
            {TYPE_KEYS.some((t) => settings.spMin[t] > 0)
              ? `（${TYPE_JA.vocal}${settings.spMin.vocal}/${TYPE_JA.dance}${settings.spMin.dance}/${TYPE_JA.visual}${settings.spMin.visual}）`
              : "＝条件なし"}{" "}
            ／ 最低ステ
            {TYPE_KEYS.some((t) => settings.minStats[t] > 0)
              ? `（${TYPE_JA.vocal}${settings.minStats.vocal}/${TYPE_JA.dance}${settings.minStats.dance}/${TYPE_JA.visual}${settings.minStats.visual}）`
              : "＝条件なし"}{" "}
            ／ 最高ステ
            {TYPE_KEYS.some((t) => settings.maxStats[t] < 3200)
              ? `（${TYPE_JA.vocal}${settings.maxStats.vocal}/${TYPE_JA.dance}${settings.maxStats.dance}/${TYPE_JA.visual}${settings.maxStats.visual}）`
              : "＝制限なし"}{" "}
            ／ 試験補助{settings.examAssist ? "＝強め" : "＝標準"}
          </p>
          {optMsg && (
            <p className="mt-2 text-xs font-semibold text-blue-600">{optMsg}</p>
          )}
          {pendingOps && (
            <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-slate-600">
              <p className="font-semibold text-amber-700">
                予算に合わせた前イベ/後イベの取得制限（提案・{pendingOps.length}枚）
              </p>
              <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                {pendingOps.map((op) => (
                  <li key={op.id}>
                    <span className="text-slate-500">
                      {CARD_BY_ID.get(op.id)?.name ?? op.id}
                    </span>
                    {op.acquire === false && (
                      <span className="ml-1 font-semibold text-red-600">
                        取得OFF
                      </span>
                    )}
                    {op.pre !== undefined && (
                      <span className="ml-1 font-semibold text-red-600">
                        前イベ{op.pre}回
                      </span>
                    )}
                    {op.post === 0 && (
                      <span className="ml-1 font-semibold text-red-600">
                        後イベ✕
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={applyPendingOps}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-amber-500"
                >
                  サポカ設定に反映する
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingOps(null);
                    setPreviewRating(null);
                  }}
                  className={SMALL_BTN}
                >
                  反映しない
                </button>
              </div>
            </div>
          )}
        </Card>

        {/* 選択サポカ */}
        <Card
          title="選択サポカ"
          hint="現在のステ・評価値はこの6枚で計算"
          action={
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={applyIdealFormation}
                disabled={idealBusy}
                className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-blue-500 disabled:opacity-60"
              >
                <Sparkles size={13} />
                {idealBusy ? "計算中…" : "理想編成を計算して設定"}
              </button>
              <button
                type="button"
                onClick={() => setTheoryOpen(true)}
                title="理論評価値と共通の条件設定（取得回数・編成割合・SP・最低/最高ステ・試験補助など）"
                className={SMALL_BTN}
              >
                <Settings2 size={13} />
                条件設定
              </button>
              <button
                type="button"
                onClick={() => selected.clearAll()}
                className={SMALL_BTN}
              >
                全て外す
              </button>
            </div>
          }
        >
          {idealMsg && <p className="mb-2 text-xs text-red-500">{idealMsg}</p>}
          {r.members.filter((m) => m?.rental).length >= 2 && (
            <p className="mb-2 text-xs font-semibold text-amber-600">
              ⚠ レンタルが
              {r.members.filter((m) => m?.rental).length}
              枚選ばれています。ゲームで借りられるレンタルは1育成につき1枚です。
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {selected.slots.map((slot, i) => (
              <SupportSlot
                key={i}
                member={r.members[i]}
                plan={r.plan}
                ownedLevel={r.members[i] ? r.getLevel(r.members[i]!.id) : 0}
                flags={flags}
                onOpen={() => setPickerSlot(i)}
                onDetail={() => setDetail(r.members[i])}
                onSetLevel={(level) => {
                  const m = r.members[i];
                  if (m) r.setLevel(m.id, level);
                }}
              />
            ))}
          </div>
          {/* 選択中カードの前イベ・後イベ回数（サポカ設定とは独立した計算ページ専用） */}
          <EventCountEditor r={r} />
          <p className="mt-2 text-[11px] text-slate-400">
            枠をクリックして手動で選択できます。理想編成の条件（BAN・固定・レンタルNG）は
            <Link to="/card-scores" className="text-blue-600 underline">
              点数表
            </Link>
            、プラン制限はPアイドルのプラン（共通＋{r.plan ?? "全プラン"}）。
          </p>
        </Card>

        {/* セーブデータ・画像出力 */}
        <Card
          title="セーブデータ"
          action={
            <span className="flex items-center gap-1.5">
              <input
                type="text"
                value={settings.userName}
                onChange={(e) => calc.update({ userName: e.target.value })}
                placeholder="ユーザー名（画像に載る）"
                maxLength={20}
                className="w-40 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={() => void exportSheetImage(r, flags.pinned)}
                title="今の計算シートの内容（評価値・ステ・サポカ・レッスン・発動回数など）を画像で保存します"
                className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-blue-500"
              >
                <ImageDown size={13} />
                画像で保存
              </button>
            </span>
          }
        >
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="セーブ名（空欄なら 名前＋Pアイドル＋日付）"
                className={`${INPUT} w-72`}
              />
              <button
                type="button"
                onClick={() => {
                  calc.saveNew(saveName);
                  setSaveName("");
                }}
                className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-blue-500"
              >
                <Save size={13} />
                新しく保存
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                value={selectedSaveId}
                onChange={(e) => setSelectedSaveId(e.target.value)}
                className={`${INPUT} w-72`}
              >
                <option value="">セーブデータを選択</option>
                {calc.saves.map((save) => (
                  <option key={save.id} value={save.id}>
                    {save.name}（{save.savedAt}）
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!selectedSave}
                onClick={() => selectedSave && calc.loadSave(selectedSave)}
                className={SMALL_BTN}
              >
                <FolderOpen size={13} />
                読み込む
              </button>
              <button
                type="button"
                disabled={!selectedSave}
                onClick={() => selectedSave && calc.overwrite(selectedSave.id)}
                className={SMALL_BTN}
              >
                <Save size={13} />
                上書き保存
              </button>
              <button
                type="button"
                disabled={!selectedSave}
                onClick={() => {
                  if (
                    selectedSave &&
                    window.confirm(`「${selectedSave.name}」を削除しますか？`)
                  ) {
                    calc.deleteSave(selectedSave.id);
                    setSelectedSaveId("");
                  }
                }}
                className={`${SMALL_BTN} hover:bg-red-50! hover:text-red-600!`}
              >
                <Trash2 size={13} />
                削除
              </button>
            </div>
          </div>
        </Card>
      </div>

      {/* ===== 結果（デスクトップでは左・スクロールに追従） ===== */}
      <div className="flex flex-col gap-4 lg:order-1 lg:sticky lg:top-14 lg:self-start">
        {/* 評価値（提案中は取得制限を反映した理論値を一時表示） */}
        <div
          className={`rounded-xl border-2 bg-white p-4 text-center ${
            !canShowRating
              ? "border-slate-300"
              : previewRating !== null
                ? "border-amber-500"
                : "border-blue-600"
          }`}
        >
          <p className="text-xs font-semibold text-slate-500">
            評価値
            {canShowRating && previewRating !== null && (
              <span className="ml-1 text-amber-600">（取得制限を反映）</span>
            )}
          </p>
          {!canShowRating ? (
            <p className="mt-2 text-xs text-slate-400">
              サポカ6枚を編成し、育成（発動回数セット）を選ぶと表示されます。
            </p>
          ) : (
            <>
              <div className="mt-1 flex items-baseline justify-center gap-2">
                <p
                  className={`text-4xl font-bold tabular-nums ${
                    previewRating !== null ? "text-amber-600" : "text-blue-600"
                  }`}
                >
                  {(previewRating ?? r.rating).toLocaleString()}
                </p>
                <span
                  className={`rounded-md px-2 py-0.5 text-lg font-black text-white ${
                    previewRating !== null ? "bg-amber-500" : "bg-blue-600"
                  }`}
                >
                  {produceRank(previewRating ?? r.rating)}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-slate-400">
                {r.scenario === "niaMaster"
                  ? `= floor(Σmin(${r.statCap}, ステ)×2.3) + ファン投票数換算`
                  : r.scenario === "hatsuLegend"
                    ? `= floor(Σmin(${r.statCap}, ステ)×2.1) + 最終順位分 + 試験スコア換算`
                    : `= Σmin(${r.statCap}, ステ)×2 + floor(スター性×7.5) + 本戦評価値 − 2000`}
              </p>
            </>
          )}
        </div>

        {/* 現在のステ */}
        <Card title="現在のステ" hint={`選択サポカ込み・上限${r.statCap}`}>
          <table className="w-full text-sm tabular-nums">
            <tbody className="divide-y divide-slate-100">
              {TYPE_KEYS.map((type) => {
                const p = r.perType[type];
                const over = p.current > r.statCap;
                return (
                  <tr key={type}>
                    <td className="py-1.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-bold ${TYPE_CHIP[type]}`}
                      >
                        {TYPE_LABELS[type]}
                      </span>
                    </td>
                    <td
                      className={`py-1.5 text-right text-2xl font-bold ${over ? "text-red-500" : "text-slate-800"}`}
                    >
                      {Math.round(p.current).toLocaleString()}
                    </td>
                    <td className="py-1.5 text-right text-xs text-slate-400">
                      あと {Math.round(r.statCap - p.current).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td className="py-1.5 text-xs font-semibold text-slate-500">
                  合計（上限適用後）
                </td>
                <td className="py-1.5 text-right text-2xl font-bold text-blue-600">
                  {Math.round(r.cappedSum).toLocaleString()}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
          {r.scenario === "hif" && (
            <p className="mt-1 text-sm text-slate-500">
              合計スター性: <b className="text-violet-600">{r.totalStar}</b>
              <span className="ml-1 text-[10px] text-slate-400">
                （ワッペン{r.starParts.wappen}＋レッスン{r.starParts.lesson}
                ＋選抜{r.starParts.exam}＋本戦{r.starParts.final}）
              </span>
            </p>
          )}
          {/* この育成で得られるPポイント・体力（サポカ・前イベ・メモリー込み） */}
          <p className="mt-1 text-sm text-slate-500">
            Pポイント:{" "}
            <b className="text-cyan-700">
              {Math.round(r.resources.pTotal).toLocaleString()}
            </b>
            <span className="ml-1 text-[10px] text-slate-400">
              （レッスン{r.resources.pLesson}＋メモリー{r.resources.pMemory}
              ＋サポカ{Math.round(r.resources.pCards)}）
            </span>
            <span className="ml-3">
              体力:{" "}
              <b className="text-emerald-700">{Math.round(r.resources.hpTotal)}</b>
              <span className="ml-1 text-[10px] text-slate-400">
                （Pアイドル{r.resources.hpIdol}
                {r.resources.hpCards > 0 && `＋サポカ${r.resources.hpCards}`}）
              </span>
            </span>
          </p>
        </Card>

        {/* プロデュース開始時のステ */}
        <Card
          title="プロデュース開始時のステ"
          hint="メモリー＋サポカ初期値＋Pアイドル"
        >
          <div className="grid grid-cols-3 gap-2">
            {TYPE_KEYS.map((type) => (
              <div
                key={type}
                className="rounded-lg bg-slate-50 px-2 py-2 text-center"
              >
                <p className={`text-xs font-bold ${TYPE_TEXT[type]}`}>
                  {TYPE_LABELS[type]}
                </p>
                <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-800">
                  {Math.round(r.perType[type].startFixed)}
                </p>
                <p className="text-xs tabular-nums text-slate-500">
                  ＋{r.perType[type].startPct}%
                </p>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            上段=固定値、下段=パラメータボーナス%（メモリー＋サポカ＋Pアイドル＋10%）。審査基準:{" "}
            {TYPE_KEYS.map((t) => `${TYPE_JA[t]} ${r.ranks?.[t] ?? "—"}`).join(" / ")}
          </p>
        </Card>
      </div>

      {/* カードの最終ステータス詳細（イベント補正込み） */}
      {detail &&
        r.roles.typeRole[detail.type] &&
        CARD_BY_ID.get(detail.id) && (
          <ScoreDetailModal
            card={CARD_BY_ID.get(detail.id)!}
            level={detail.level}
            role={r.roles.typeRole[detail.type]!}
            ctx={r.ctx}
            extraCounts={sumEventContrib(
              r.members.filter((m): m is SelectedMember => m !== null),
            )}
            rental={detail.rental}
            onClose={() => setDetail(null)}
          />
        )}

      {/* サポカ選択モーダル */}
      {pickerSlot !== null && (
        <SupportPickerModal
          slotIndex={pickerSlot}
          usedIds={
            new Set(
              selected.slots
                .filter((s, i) => s && i !== pickerSlot)
                .map((s) => s!.id),
            )
          }
          ctx={r.ctx}
          typeRole={r.roles.typeRole}
          plan={r.plan}
          rentalNg={flags.rentalNg}
          getLevel={r.getLevel}
          onPick={(entry) => {
            selected.setSlot(pickerSlot, entry);
            setPickerSlot(null);
          }}
          onClose={() => setPickerSlot(null)}
        />
      )}

      {/* 理論評価値の設定モーダル */}
      {theoryOpen && (
        <TheorySettingsModal
          settings={settings}
          onUpdate={calc.update}
          onClose={() => setTheoryOpen(false)}
        />
      )}

      {/* シナリオ選択モーダル（色付き■3つ） */}
      {scenarioPickerOpen && (
        <ScenarioPickerModal
          current={r.scenario}
          onPick={(key) => r.scenarioStore.setScenario(key)}
          onClose={() => setScenarioPickerOpen(false)}
        />
      )}

      {/* アイドル・Pアイドル選択モーダル */}
      {idolPickerOpen && (
        <IdolPickerModal
          currentIdol={settings.idol}
          currentPIdol={r.pMaster?.cardName ?? ""}
          onPick={applyIdolAndPIdol}
          onClose={() => setIdolPickerOpen(false)}
        />
      )}

      {/* 左端タブから開く発動回数・レッスンのエディタ */}
      <AbilityCountDrawer r={r} />
      <PlanEditDrawer r={r} />
    </div>
  );
}

/** シナリオ別の本戦・試験スコア入力（評価値の上に置く） */
function ScenarioScoreCard({ r }: { r: ReturnType<typeof useCalcResult> }) {
  const { calc } = r;
  const { settings } = calc;
  if (r.scenario === "hif") {
    return (
      <Card title="本戦ラウンド点数" hint="ボーナス前の点数を入力">
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
      </Card>
    );
  }
  if (r.scenario === "niaMaster") {
    return (
      <Card
        title="ファン投票数"
        hint="営業・オーディション・札から自動集計（入力はレッスンページ）"
      >
        <div className="flex flex-wrap items-center gap-1.5 text-xs tabular-nums text-slate-600">
          <VoteChip label="営業" value={r.scenarioValues.votesSales ?? 0} />
          <VoteChip
            label="1次・2次"
            value={r.scenarioValues.votesAuditions ?? 0}
          />
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
          札 = 発動回数セットの「スキル獲得」{r.scenarioValues.setFuda ?? 0}枚
          ＋サポカ分 {r.scenarioValues.supportFuda ?? 0}
          枚（編成のスキル獲得から自動）。2枚ごとに3,000票、余りの1枚は無効。
        </p>
      </Card>
    );
  }
  return (
    <Card title="試験スコア・順位" hint="レッスンページと共有">
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
    </Card>
  );
}

/**
 * 選択サポカ6枚の前イベ・後イベエディタ（計算ページ専用ストア＝サポカ設定とは独立）。
 * 全カードをグリッドで揃えて表示し、対象外の項目は「—」。
 */
function EventCountEditor({ r }: { r: ReturnType<typeof useCalcResult> }) {
  const rows = r.members
    .map((member) => {
      if (!member) return null;
      const card = CARD_BY_ID.get(member.id);
      if (!card) return null;
      return { card, role: r.roles.typeRole[member.type] };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
  if (rows.length === 0) return null;

  const th = "px-2 py-1 text-left text-[10px] font-semibold text-slate-400";
  const td = "px-2 py-1.5 align-middle";

  return (
    <div className="mt-2 overflow-x-auto rounded-lg bg-slate-50 px-1 py-1.5">
      <table className="w-full min-w-max text-xs text-slate-700">
        <thead>
          <tr className="border-b border-slate-200">
            <th className={th}>カード</th>
            <th
              className={th}
              title="ステイベ（パラメータイベント）が発動したか。1育成に1回だけランダムで起こります"
            >
              ステイベ
            </th>
            <th className={th} title="取得しない場合は前イベ発動0回扱い">
              前イベ
            </th>
            <th className={th} title="前イベの発動回数（取得時は自動計算）">
              回数
            </th>
            <th
              className={th}
              title="前イベの強化・削除の割り振り。Mの枚数を決めると残りは自動でA"
            >
              割り振り
            </th>
            <th className={th} title="後イベの発動回数（強化はM/Aの割合も指定）">
              後イベ
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200/70">
          {rows.map(({ card, role }) => {
            const pre = preEventStatRelevant(card);
            const override = r.events.get(card.id);
            const auto = role
              ? preEventAutoActivations(card, role, r.ctx)
              : 0;
            const acquired = override?.acquire ?? true;
            // 取得しない指定なら発動0回扱い
            const preCount = acquired ? (override?.pre ?? auto) : 0;
            const preImageUrl = imageUrl(card.extras["前イベ画像URL"] ?? "");
            return (
              <tr key={card.id}>
                {/* カード */}
                <td className={`${td} min-w-44`}>
                  <span className="flex items-center gap-1.5">
                    <CardThumb name={card.name} image={card.imageUrl} id={card.id} />
                    <span className="max-w-36 truncate font-medium" title={card.name}>
                      {card.name}
                    </span>
                  </span>
                </td>
                {/* ステイベ（パラメータイベント）の発動有無 */}
                <td className={td}>
                  <StatEventToggle
                    card={card}
                    override={override}
                    events={r.events}
                  />
                </td>
                {/* 前イベ（獲得アイテム/スキルの画像＋取得トグル） */}
                <td className={td}>
                  <span className="flex h-8 items-center gap-1.5">
                    {preImageUrl ? (
                      <img
                        src={preImageUrl}
                        alt=""
                        loading="lazy"
                        className="h-8 w-8 shrink-0 rounded object-contain"
                      />
                    ) : (
                      <span className="inline-block h-8 w-8 shrink-0" />
                    )}
                    <AcquireToggle card={card} override={override} events={r.events} />
                  </span>
                </td>
                {/* 前イベ回数。スキルは取得した時点で1回確定なので固定表示 */}
                <td className={td}>
                  {!pre || !role ? (
                    <span className="text-slate-300">—</span>
                  ) : card.preEventType === "スキル" ? (
                    // スキルは取得した時点で1回確定なので表示しない
                    <span className="text-slate-300">—</span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <NumberField
                        value={preCount}
                        onChange={(v) =>
                          r.events.set(card.id, "pre", v === auto ? null : v)
                        }
                        max={preEventMax(card)}
                        disabled={!acquired}
                        className="w-14"
                      />
                      <span className="text-slate-400">/{preEventMaxLabel(card)}</span>
                    </span>
                  )}
                </td>
                {/* 前イベの強化・削除の割り振り（M枚数→残りA） */}
                <td className={td}>
                  <PreAssign
                    card={card}
                    override={override}
                    events={r.events}
                    preCount={preCount}
                  />
                </td>
                {/* 後イベ（強化=M/A/✕ボタン、チェンジ等=発動トグル） */}
                <td className={td}>
                  <PostEventButtons card={card} override={override} events={r.events} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-2 pt-1 text-[10px] text-slate-400">
        計算ページ専用の設定です（サポカ設定ページとは別に保存され、互いに影響しません）。前イベは取得/未取得の2択（回数は自動計算）。後イベは強化・削除ならM/A/✕、それ以外は〇/✕で指定できます。
      </p>
    </div>
  );
}

/** 編成サポカのサムネイル（前イベエディタ用） */
function CardThumb({
  id,
  name,
  image,
}: {
  id: string;
  name: string;
  image: string;
}) {
  const url = imageUrl(SUPPORT_IMAGE_BY_ID.get(id) ?? image);
  if (!url) return <span className="inline-block h-7 w-14 shrink-0 rounded bg-slate-200" />;
  return (
    <img
      src={url}
      alt={name}
      loading="lazy"
      className="h-7 w-auto max-w-none shrink-0 rounded"
    />
  );
}

/** Pアイドルの画像（クリックで特訓・才能開花のポップオーバーを開く） */
function PIdolImageEditor({
  r,
  onOpenPicker,
}: {
  r: ReturnType<typeof useCalcResult>;
  onOpenPicker: () => void;
}) {
  const [open, setOpen] = useState(false);
  const key = r.pMaster?.key;
  const url = r.pMaster ? imageUrl(r.pMaster.url) : "";
  const own = r.ownership;
  const btn = (on: boolean) =>
    `h-7 min-w-7 rounded-md px-1 text-xs font-bold transition ${
      on ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
    }`;
  return (
    <div className="relative">
      {/* 画像クリック=Pアイドル選択（サポカと同じ操作感） */}
      <button
        type="button"
        onClick={onOpenPicker}
        title="クリックでPアイドルを選択"
        className="block"
      >
        {url ? (
          <img
            src={url}
            alt={r.pMaster?.cardName ?? ""}
            className="h-28 w-28 rounded-xl border border-slate-200 object-cover shadow-sm transition hover:brightness-95"
          />
        ) : (
          <div className="flex h-28 w-28 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-400">
            Pアイドル
          </div>
        )}
      </button>
      {/* 歯車=特訓・才能開花の設定（サポカの凸設定と同じ位置） */}
      {key && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title="特訓・才能開花を設定"
          className="absolute right-1 top-1 z-10 rounded-full bg-black/60 p-1 text-white transition hover:bg-blue-600"
        >
          <Settings size={13} />
        </button>
      )}
      {/* 特訓・開花の現在値（クリックでも設定を開ける） */}
      {key && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title="クリックで特訓・才能開花を設定"
          className="mt-1 block w-28 text-center text-[11px] text-slate-600 underline decoration-slate-300 decoration-dotted underline-offset-2 hover:text-blue-600"
        >
          {own ? (
            <>
              特訓{own.kunren}・開花{own.kaika}
            </>
          ) : (
            <span className="text-red-500">未所持</span>
          )}
        </button>
      )}
      {open && key && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-30 mt-1 w-80 rounded-lg border border-slate-300 bg-white p-2.5 shadow-lg">
            <p className="mb-1 text-[10px] font-semibold text-slate-400">
              特訓（未=未所持）
            </p>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => r.pIdols.setUnowned(key)}
                className={btn(!own)}
              >
                未
              </button>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => r.pIdols.setOwnership(key, { kunren: n })}
                  className={btn(!!own && own.kunren >= n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="mb-1 mt-2 text-[10px] font-semibold text-slate-400">
              才能開花
            </p>
            <div className="flex flex-wrap gap-1">
              {[0, 1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => r.pIdols.setOwnership(key, { kaika: n })}
                  className={btn(!!own && own.kaika >= n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Pアイドルの状態表示（プラン・おすすめ効果。特訓/開花は画像下に表示） */
function PIdolInfo({ r }: { r: ReturnType<typeof useCalcResult> }) {
  if (!r.pMaster) return null;
  return (
    <div className="text-xs text-slate-600">
      <p>
        <b className="text-slate-800">{r.pMaster.plan}</b> / おすすめ効果:{" "}
        {r.pMaster.effect}
      </p>
      {!r.ownership && (
        <p className="mt-0.5 text-red-500">
          未所持（特訓0・開花0として計算）
        </p>
      )}
    </div>
  );
}

/** 選択サポカの1枠。画像クリック=入れ替え、凸バッジクリック=凸数の変更 */
function SupportSlot({
  member,
  plan,
  ownedLevel,
  flags,
  onOpen,
  onDetail,
  onSetLevel,
}: {
  member: SelectedMember | null;
  plan: string | null;
  /** 自分が所持している凸（レンタルでも所持凸を編集できるように渡す） */
  ownedLevel: number;
  flags: ReturnType<typeof useCardFlags>;
  onOpen: () => void;
  onDetail: () => void;
  onSetLevel: (level: number) => void;
}) {
  const [cfgOpen, setCfgOpen] = useState(false);
  if (!member) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="flex aspect-video w-full flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-slate-300 text-xs font-semibold text-slate-400 transition hover:border-blue-400 hover:text-blue-500"
      >
        ＋ 選ぶ
      </button>
    );
  }
  const url = imageUrl(member.image);
  const planNg = !planAllows(CARD_PLAN_BY_ID.get(member.id) ?? "", plan);
  // レンタルは計算上は完凸だが、ポップオーバーでは自分の所持凸を編集する
  const editLevel = member.rental ? ownedLevel : member.level;
  return (
    <div className="group relative">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
          {url ? (
            <img
              src={url}
              alt={member.name}
              title={member.name}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center p-1 text-center text-[10px] text-slate-500">
              {member.name}
            </div>
          )}
          {planNg && (
            <span className="absolute bottom-1 left-1 rounded bg-red-600/90 px-1 py-0.5 text-[9px] font-bold text-white">
              プラン外
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-1">
          <span
            className="min-w-0 truncate text-[10px] text-slate-600"
            title={member.name}
          >
            {member.name}
          </span>
        </div>
      </button>
      {/* 凸バッジ（表示のみ。設定は右上の歯車から）＋レンタル・固定の印 */}
      <span className="absolute left-1 top-1 z-10 rounded bg-black/60 px-1 py-0.5 text-[9px] font-bold text-white">
        {member.level}凸
        {member.rental && <span className="ml-0.5 text-amber-300">レンタル</span>}
        {flags.pinned.has(member.id) && (
          <span className="ml-0.5 text-sky-300">📌固定</span>
        )}
      </span>
      {/* 歯車（クリックで凸・BAN・固定・レンタルNGの設定ポップオーバー） */}
      <button
        type="button"
        onClick={() => setCfgOpen((v) => !v)}
        title="凸・BAN・固定・レンタルNGを設定"
        className="absolute right-1 top-1 z-10 rounded-full bg-black/60 p-1 text-white transition hover:bg-blue-600"
      >
        <Settings size={13} />
      </button>
      {cfgOpen && (
        <>
          <div
            className="fixed inset-0 z-20"
            onClick={() => setCfgOpen(false)}
          />
          <div className="absolute right-1 top-7 z-30 w-44 rounded-lg border border-slate-300 bg-white p-2 shadow-lg">
            <p className="mb-1 text-[9px] font-semibold text-slate-400">
              {member.rental ? "所持凸（計算はレンタル=完凸）" : "凸"}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSetLevel(-1)}
                title="未所持"
                className={`h-7 min-w-7 rounded-md px-1 text-xs font-bold transition ${
                  editLevel < 0
                    ? "bg-slate-600 text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                未
              </button>
              {[0, 1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onSetLevel(n)}
                  className={`h-7 w-7 rounded-md text-xs font-bold transition ${
                    editLevel >= n
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-col gap-1 border-t border-slate-100 pt-2">
              <FlagToggle
                label="BAN（編成から除外）"
                active={flags.banned.has(member.id)}
                on="border-red-500 bg-red-500 text-white"
                off="border-slate-300 text-slate-500 hover:bg-red-50"
                onClick={() => flags.toggle(member.id, "ban")}
              />
              <FlagToggle
                label="固定（必ず編成）"
                active={flags.pinned.has(member.id)}
                on="border-blue-500 bg-blue-500 text-white"
                off="border-slate-300 text-slate-500 hover:bg-blue-50"
                onClick={() => flags.toggle(member.id, "pin")}
              />
              <FlagToggle
                label="レンタルNG"
                active={flags.rentalNg.has(member.id)}
                on="border-violet-500 bg-violet-500 text-white"
                off="border-slate-300 text-slate-500 hover:bg-violet-50"
                onClick={() => flags.toggle(member.id, "rentalNg")}
              />
            </div>
          </div>
        </>
      )}
      <button
        type="button"
        onClick={onDetail}
        className="absolute bottom-0 right-0 text-xs font-bold tabular-nums text-blue-600 underline decoration-blue-300 decoration-dotted underline-offset-2 hover:text-blue-500"
        title={`クリックで内訳を表示（基本 ${Math.round(member.points)} ＋ イベント相互作用 ${Math.round(member.synergy)}）`}
      >
        +{Math.round(member.points + member.synergy)}
      </button>
    </div>
  );
}

/** 設定ポップオーバー内のフラグ切替（BAN/固定/レンタルNG） */
function FlagToggle({
  label,
  active,
  on,
  off,
  onClick,
}: {
  label: string;
  active: boolean;
  on: string;
  off: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-left text-[11px] font-semibold transition ${
        active ? on : off
      }`}
    >
      <span
        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${
          active ? "border-white/70" : "border-slate-300"
        }`}
      >
        {active && "✓"}
      </span>
      {label}
    </button>
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

const INPUT =
  "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500";

const SMALL_BTN =
  "flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40";

function Card({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        {hint && (
          <span className="text-xs font-normal text-slate-400">{hint}</span>
        )}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-500">
      {label}
      {children}
    </label>
  );
}
