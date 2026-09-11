import { useEffect, useState } from "react";
import {
  ChevronDown,
  HelpCircle,
  ImageDown,
  Save,
  Settings,
  Table2,
} from "lucide-react";
import { setVisibleInScenario } from "@/data/abilityCounts";
import { FINAL_ROUNDS } from "@/data/schedule";
import { SCENARIO_LABELS, type ScenarioKey } from "@/data/scenarios";
import { SUPPORT_CARD_DB } from "@/data/supportCardsDb";
import { SUPPORT_CATALOG } from "@/data/supportCardCatalog";
import AbilityCountDrawer from "@/components/calc/AbilityCountDrawer";
import ActionPanel from "@/components/calc/ActionPanel";
import { Card, Field } from "@/components/calc/CalcCard";
import CalcHelpModal from "@/components/calc/CalcHelpModal";
import MemoryPickerModal from "@/components/calc/MemoryPickerModal";
import MobileActionBar from "@/components/calc/MobileActionBar";
import OptimizeResultCard, {
  type ConditionStatus,
  type OptimizeOutcome,
  type PlanSummary,
} from "@/components/calc/OptimizeResultCard";
import OwnershipConfirmModal from "@/components/calc/OwnershipConfirmModal";
import ParaboTableModal from "@/components/calc/ParaboTableModal";
import PlanEditDrawer from "@/components/calc/PlanEditDrawer";
import PlanSummaryCard from "@/components/calc/PlanSummaryCard";
import SaveDataPanel from "@/components/calc/SaveDataPanel";
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
import Hint from "@/components/Hint";
import Modal from "@/components/Modal";
import NumberField from "@/components/NumberField";
import ScoreDetailModal from "@/components/ScoreDetailModal";
import { BTN_PRIMARY, BTN_SECONDARY, CHIP_NG, CHIP_OK, NOTE } from "@/components/ui";
import { runFullOptimize, type AutoOptimizeResult } from "@/lib/autoOptimize";
import { buildSnapshot } from "@/lib/calcSaveIO";
import { imageUrl } from "@/lib/config";
import { exportSheetImage } from "@/components/calc/ExportSheet";
import {
  examStyleTags,
  findBestFormation,
  planAllows,
  scoreOwnedCards,
  scoreRentalCandidates,
  sumEventContrib,
  typeConstraintFromRatio,
} from "@/lib/formation";
import { GLOSSARY } from "@/lib/glossary";
import {
  ownershipCustomized,
  readOwnershipAck,
  writeOwnershipAck,
} from "@/lib/ownershipAck";
import { buildAutoOptimizeInput, resolveSpMin } from "@/lib/buildOptimizeInput";
import {
  missingCalcInputs,
  notReadyTitle as notReadyTitleOf,
} from "@/lib/optimizeReady";
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
import { useOptimizePlan } from "@/lib/useOptimizePlan";
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
 * 最終ステータス・評価値は「選択サポカ」6枠を参照する（理想編成の自動採用ではない）。
 * 評価値 = Σmin(3200, 最終ステ)×2 + floor(合計スター性×7.5) + 本戦評価値 − 2000
 */
export default function CalcPage() {
  const r = useCalcResult();
  const flags = useCardFlags();
  const { calc, selected } = r;
  const { settings } = calc;

  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [idealBusy, setIdealBusy] = useState(false);
  const [detail, setDetail] = useState<SelectedMember | null>(null);
  const [optBusy, setOptBusy] = useState(false);
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
  const [helpOpen, setHelpOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [paraboOpen, setParaboOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [countsOpen, setCountsOpen] = useState(false);
  /** 初回の探索前の所持状況の確認モーダル */
  const [ownConfirmOpen, setOwnConfirmOpen] = useState(false);
  /** 直近の探索の結果（結果カードに構造化して出す。文章の状態は持たない） */
  const [outcome, setOutcome] = useState<OptimizeOutcome | null>(null);
  /** 「今の編成のまま踏み方だけ」（分割メニュー） */
  const planOpt = useOptimizePlan(r);
  // 探索の結果が出たら結果カードへスクロール（押す場所と結果が離れていても見える）
  useEffect(() => {
    if (outcome && (outcome.kind === "applied" || outcome.kind === "kept")) {
      document
        .getElementById("opt-result")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [outcome]);

  // 評価値は「サポカ6枚が編成済み」かつ「育成（発動回数セット）を選択済み」のときだけ表示
  const canShowRating =
    r.members.every((m) => m !== null) && !!r.selectedSet;

  // 最適化（理想編成・サポカ編成・踏み方）は、計算の前提がそろうまで押せない。
  // 足りない項目はボタンの下に出す（判定は踏み方ドロワーと共通）。
  const missingInputs = missingCalcInputs(r);
  const optimizeReady = missingInputs.length === 0;
  const notReadyTitle = notReadyTitleOf(missingInputs);

  /**
   * 理想編成を計算して選択サポカへ一括設定。
   * 条件設定（取得回数・編成割合・SP・最低/最高ステ・試験補助・ステージアイテム）は
   * 全自動最適化（理論評価値）と同じものを引き継ぐ。
   */
  const applyIdealFormation = () => {
    setIdealBusy(true);
    setOutcome(null);
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
          spMin: resolveSpMin(r, settings),
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
          examStyleTags: examStyleTags(r.selectedSet?.plan ?? null),
          // 割合の合計が6以上=固定/按分、6未満=最低枚数（残り枠は自由）
          ...(settings.typeRatio.enabled
            ? typeConstraintFromRatio({
                vocal: settings.typeRatio.vocal,
                dance: settings.typeRatio.dance,
                visual: settings.typeRatio.visual,
              })
            : {}),
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
          setOutcome({
            kind: "error",
            message: "編成を組めません（プラン制限内の所持サポカが不足しています）",
          });
          return;
        }
        selected.setAll(best.picks.map((p) => ({ id: p.id, rental: p.rental })));
        setOutcome({
          kind: "info",
          message:
            `今の踏み方でサポカ編成を組み直しました（合計ステ ${Math.round(best.score).toLocaleString()}）` +
            (best.spShortfall > 0
              ? `。SPレッスン率の条件はあと${best.spShortfall}枚分満たせませんでした`
              : ""),
        });
      } finally {
        setIdealBusy(false);
      }
    }, 30);
  };

  /**
   * 今の編成（選択サポカ）が現在の条件設定を満たしているか。
   * 満たしているのに探索結果が今の評価値を下回る場合は、結果を反映せず現状維持する
   * （設定を厳しくした直後などは今の編成が条件外なので、下がっても置き換える）。
   */
  const currentMeetsConditions = (): boolean => {
    const members = r.members.filter((m): m is SelectedMember => m !== null);
    if (members.length < 6) return false;
    if (members.filter((m) => m.rental).length > 1) return false;
    for (const m of members) {
      const db = CARD_BY_ID.get(m.id);
      if (!db) return false;
      if (!planAllows(db.plan, r.plan)) return false;
      if (flags.pinned.has(m.id)) continue; // 固定は条件を貫通
      if (flags.banned.has(m.id)) return false;
      if (
        settings.noStageItems &&
        (db.stageItem || db.preEventType === "スキル")
      )
        return false;
    }
    {
      const resolved = resolveSpMin(r, settings);
      for (const t of TYPE_KEYS) {
        const need = resolved[t] ?? 0;
        // 全SPレッスン率（トレーナー等）は全タイプの1枚として数える
        if (
          need > 0 &&
          members.filter((m) => m.spTypes.includes(t)).length < need
        )
          return false;
      }
    }
    if (settings.typeRatio.enabled) {
      const counts: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
      for (const m of members) if (!m.assist) counts[m.type]++;
      const ratioSum = TYPE_KEYS.reduce(
        (sum, t) => sum + settings.typeRatio[t],
        0,
      );
      for (const t of TYPE_KEYS) {
        const want = settings.typeRatio[t];
        // 合計6以上=枚数固定、6未満=最低枚数
        if (ratioSum >= 6 ? counts[t] !== want : counts[t] < want) return false;
      }
    }
    // 最低ステ・最高ステ: 今の最終ステが条件から外れていれば「条件を満たしていない」
    // （条件外の今の編成が評価値だけ高くても、条件を満たす探索結果で置き換える）
    for (const t of TYPE_KEYS) {
      const stat = r.perType[t].capped;
      const min = settings.minStats[t];
      if (min > 0 && stat < min) return false;
      const max = settings.maxStats[t];
      if (max > 0 && max < r.statCap && stat > max) return false;
    }
    return true;
  };

  /**
   * 全自動最適化: レッスン（営業・授業）の踏み方×サポカ編成をまとめて探索して、
   * 評価値が一番高かった組み合わせを踏み方・選択サポカへ反映する。
   */
  /**
   * 探索の診断ログ。セーブデータ形式の状態（設定・踏み方・メモリー・発動回数・編成・所持）と
   * 押す前の評価値、探索結果（編成・踏み方・軸比較・フェーズ別スコア）をまとめる。
   */
  const buildDiagLog = (
    res: AutoOptimizeResult,
    before: number | null,
    beforeOk: boolean,
    applied: boolean,
  ): string =>
    JSON.stringify({
      version: 1,
      at: new Date().toISOString(),
      scenario: r.scenario,
      settings,
      flags: {
        pinned: [...flags.pinned],
        banned: [...flags.banned],
        rentalNg: [...flags.rentalNg],
      },
      snapshot: buildSnapshot(r),
      current: {
        rating: before,
        meetsConditions: beforeOk,
        slots: r.selected.slots,
      },
      result: {
        applied,
        rating: res.rating,
        slots: res.slots,
        hif: res.hif ?? null,
        nia: res.nia ?? null,
        hatsu: res.hatsu ?? null,
        axisReport: res.axisReport ?? null,
        spShortfall: res.spShortfall,
        evaluated: res.evaluated,
        elapsedMs: Math.round(res.elapsedMs),
        phaseScores: res.debug?.phaseScores ?? null,
        eventOps: res.eventOps ?? null,
      },
    });

  /** サポカID列のタイプ枚数（アシストはどのタイプにも数えない） */
  const typeCountsOfIds = (ids: string[]): Record<TypeKey, number> => {
    const counts: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
    const map: Record<string, TypeKey> = {
      Vocal: "vocal",
      Dance: "dance",
      Visual: "visual",
    };
    for (const id of ids) {
      const t = map[CARD_BY_ID.get(id)?.cardType ?? ""];
      if (t) counts[t]++;
    }
    return counts;
  };

  /** タイプ割合条件の達成（合計6=固定、6未満=最低枚数） */
  const ratioStatus = (ids: string[]): ConditionStatus => {
    const counts = typeCountsOfIds(ids);
    const ratio = settings.typeRatio;
    const sum = TYPE_KEYS.reduce((s, t) => s + ratio[t], 0);
    const ok = TYPE_KEYS.every((t) =>
      sum >= 6 ? counts[t] === ratio[t] : counts[t] >= ratio[t],
    );
    return {
      label: "タイプ割合",
      ok,
      detail: `Vo${counts.vocal} Da${counts.dance} Vi${counts.visual}`,
    };
  };

  /** 今の編成・ステでの条件の達成状況（結果列のチップ用。条件を設定していない項目は出さない） */
  const currentConditions = (): ConditionStatus[] => {
    const out: ConditionStatus[] = [];
    const members = r.members.filter((m): m is SelectedMember => m !== null);
    if (members.length < 6) return out;
    if (settings.spTop.first > 0 || settings.spTop.second > 0) {
      const resolved = resolveSpMin(r, settings);
      let short = 0;
      for (const t of TYPE_KEYS) {
        short += Math.max(
          0,
          (resolved[t] ?? 0) - members.filter((m) => m.spTypes.includes(t)).length,
        );
      }
      out.push({
        label: "SP率持ち",
        ok: short === 0,
        detail: short > 0 ? `あと${short}枚` : undefined,
      });
    }
    if (settings.typeRatio.enabled) out.push(ratioStatus(members.map((m) => m.id)));
    if (TYPE_KEYS.some((t) => settings.minStats[t] > 0)) {
      const bad = TYPE_KEYS.filter(
        (t) => settings.minStats[t] > 0 && r.perType[t].capped < settings.minStats[t],
      );
      out.push({
        label: "最低ステ",
        ok: bad.length === 0,
        detail: bad.length ? bad.map((t) => TYPE_JA[t]).join("・") + "未達" : undefined,
      });
    }
    if (
      TYPE_KEYS.some((t) => settings.maxStats[t] > 0 && settings.maxStats[t] < r.statCap)
    ) {
      const bad = TYPE_KEYS.filter(
        (t) =>
          settings.maxStats[t] > 0 &&
          settings.maxStats[t] < r.statCap &&
          r.perType[t].capped > settings.maxStats[t],
      );
      out.push({
        label: "最高ステ",
        ok: bad.length === 0,
        detail: bad.length ? bad.map((t) => TYPE_JA[t]).join("・") + "超過" : undefined,
      });
    }
    return out;
  };

  /** 探索結果での条件の達成状況（採用結果の未達は axisReport の採用軸に入っている） */
  const resultConditions = (res: AutoOptimizeResult): ConditionStatus[] => {
    const out: ConditionStatus[] = [];
    const issues = res.axisReport?.find((a) => a.chosen)?.issues ?? [];
    if (settings.spTop.first > 0 || settings.spTop.second > 0) {
      out.push({
        label: "SP率持ち",
        ok: res.spShortfall === 0,
        detail: res.spShortfall > 0 ? `あと${res.spShortfall}枚` : undefined,
      });
    }
    if (settings.typeRatio.enabled) out.push(ratioStatus(res.slots.map((s) => s.id)));
    if (TYPE_KEYS.some((t) => settings.minStats[t] > 0)) {
      const bad = issues.filter((i) => i.startsWith("最低ステ"));
      out.push({
        label: "最低ステ",
        ok: bad.length === 0,
        detail: bad.length ? bad.join("・") : undefined,
      });
    }
    if (
      TYPE_KEYS.some((t) => settings.maxStats[t] > 0 && settings.maxStats[t] < r.statCap)
    ) {
      const bad = issues.filter((i) => i.startsWith("最高ステ"));
      out.push({
        label: "最高ステ",
        ok: bad.length === 0,
        detail: bad.length ? bad.join("・") : undefined,
      });
    }
    return out;
  };

  /** 探索結果の踏み方を要約（結果カードのチップ用） */
  const planSummaryOf = (res: AutoOptimizeResult): PlanSummary | undefined => {
    if (res.hif) {
      return {
        lessons: res.hif.lessons.map((l) => ({ type: l.main, sub: l.sub, sp: l.sp })),
        classes: res.hif.classTypes,
      };
    }
    if (res.nia) {
      return {
        lessons: res.nia.lessons.map((l) => ({ type: l.main, sp: l.sp })),
        sales: res.nia.sales.map((s) => s.type),
      };
    }
    if (res.hatsu) {
      return {
        lessons: res.hatsu.lessons.map((l) => ({ type: l.main, sp: l.sp })),
        classes: res.hatsu.classTypes,
      };
    }
    return undefined;
  };

  /**
   * 全自動最適化: レッスン（営業・授業）の踏み方×サポカ編成をまとめて探索して、
   * 評価値が一番高かった組み合わせを踏み方・選択サポカへ反映する。
   * 結果は文章ではなく OptimizeOutcome に分けて持ち、結果カードで見せる。
   */
  const runAutoOptimize = () => {
    setOptBusy(true);
    setOutcome(null);
    // 押す前の評価値（表示できているときだけ比較対象にする）と条件適合を控える。
    // 試験補助強めON中は探索の目的関数が「評価値＋補助加点」になり、最適編成の
    // 表示評価値が下がるのはむしろ正常なので、劣化ガードは効かせない
    const before = canShowRating && !settings.examAssist ? r.rating : null;
    const beforeOk = before !== null && currentMeetsConditions();
    const beforeSlots = r.selected.slots.filter(
      (s): s is NonNullable<typeof s> => s !== null,
    );
    // 「計算中…」を先に描画させてから重い探索を回す
    setTimeout(() => {
      try {
        const res = runFullOptimize(buildAutoOptimizeInput(r, flags, settings));
        if (!res) {
          setOutcome({
            kind: "error",
            message: "編成を組めません（プラン制限内の所持サポカが不足しています）",
          });
          return;
        }
        const base: OptimizeOutcome = {
          kind: "applied",
          before,
          after: res.rating,
          elapsedMs: res.elapsedMs,
          evaluated: res.evaluated,
          axisReport: res.axisReport,
          conditions: resultConditions(res),
          plan: planSummaryOf(res),
        };
        // 今の編成が条件を満たしていて、探索結果がそれを下回るなら反映しない
        if (before !== null && beforeOk && res.rating < before) {
          setOutcome({
            ...base,
            kind: "kept",
            diagLog: buildDiagLog(res, before, beforeOk, false),
          });
          return;
        }
        const inIds = new Set(res.slots.map((s) => s.id));
        const outIds = new Set(beforeSlots.map((s) => s.id));
        const nameOf = (id: string) => CARD_BY_ID.get(id)?.name ?? id;
        const swappedIn = res.slots
          .filter((s) => !outIds.has(s.id))
          .map((s) => ({ id: s.id, name: nameOf(s.id), rental: s.rental }));
        const swappedOut = beforeSlots
          .filter((s) => !inIds.has(s.id))
          .map((s) => ({ id: s.id, name: nameOf(s.id) }));

        if (res.hif)
          r.schedule.setPlan(res.hif.lessons, res.hif.classTypes, res.hif.examScores);
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
        const notes: string[] = [];
        if (before !== null && !beforeOk && res.rating < before) {
          notes.push(
            "押す前より評価値が下がっていますが、元の編成は探索の条件に合っていなかったため置き換えました",
          );
        }
        if (hasOps) {
          notes.push(
            "評価値ボックスには前イベ/後イベの取得制限を反映した値を表示しています（下のボタンでサポカ設定にも反映できます）",
          );
        }
        if (res.spShortfall > 0) {
          notes.push(`SPレッスン率の条件はあと${res.spShortfall}枚分満たせませんでした`);
        }
        setOutcome({
          ...base,
          swappedIn,
          swappedOut,
          notes,
          diagLog: buildDiagLog(res, before, beforeOk, true),
        });
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
    setOutcome({ kind: "info", message: "前イベ/後イベの取得制限をサポカ設定に反映しました。" });
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

  const memoryCount = r.memoryStore.selected.length;
  const conditionChips = currentConditions();
  const ownershipUnset = !ownershipCustomized(r.ownedLevels.levels);
  const scrollToResults = () =>
    document
      .getElementById("calc-results")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });

  /** 主役ボタン: 所持状況が未入力なら初回だけ確認してから探索する */
  const requestAutoOptimize = () => {
    if (ownershipUnset && !readOwnershipAck()) {
      setOwnConfirmOpen(true);
      return;
    }
    runAutoOptimize();
  };

  const actionPanel = (
    <ActionPanel
      busy={optBusy || idealBusy || planOpt.busy}
      ready={optimizeReady}
      missingInputs={missingInputs}
      notReadyTitle={notReadyTitle}
      ownershipUnset={ownershipUnset}
      onRun={requestAutoOptimize}
      onFormationOnly={applyIdealFormation}
      onPlanOnly={() => {
        setOutcome(null);
        planOpt.run((m) => setOutcome({ kind: "info", message: m }));
      }}
      onConditions={() => setTheoryOpen(true)}
      onEditPlan={() => setPlanOpen(true)}
      onEditCounts={() => setCountsOpen(true)}
    />
  );

  return (
    <div className="grid gap-4 pb-24 lg:grid-cols-[360px_1fr] lg:items-start lg:pb-0">
      {/* 見出し行: タイトル／セーブデータ／ヘルプ */}
      <div className="-mb-1 flex flex-wrap items-center justify-between gap-2 lg:col-span-2 lg:order-first">
        <h1 className="text-xl font-bold text-slate-900">計算ページ</h1>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSaveOpen(true)}
            className={BTN_SECONDARY}
            title="セーブデータの保存・読み込み、計算シートの画像保存"
          >
            <Save size={13} />
            セーブデータ
          </button>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="flex items-center gap-1 rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100"
          >
            <HelpCircle size={14} />
            使い方・計算式ヘルプ
          </button>
        </div>
      </div>

      {/* ===== 入力（デスクトップでは右） ===== */}
      <div className="flex min-w-0 flex-col gap-4 lg:order-2">
        {/* 育成の前提（シナリオ・Pアイドル・育成パターン・メモリー・本戦点数）。全部そろうと探索できる */}
        <Card title="育成の前提" hint={<Hint text={GLOSSARY.premise} />}>
          <div className="flex flex-col gap-3 sm:flex-row">
            {/* Pアイドルの画像と情報（画像クリック=Pアイドル選択・歯車=特訓/開花）。
                プラン・おすすめ効果は特訓開花の下 */}
            <div className="flex w-28 shrink-0 flex-col gap-1.5">
              <PIdolImageEditor
                r={r}
                onOpenPicker={() => setIdolPickerOpen(true)}
              />
              <PIdolInfo r={r} />
            </div>
            {/* 入力欄（縦並び） */}
            <div className="min-w-0 flex-1">
              <div className="grid gap-2">
                <Field label="育成シナリオ">
                  <button
                    type="button"
                    onClick={() => setScenarioPickerOpen(true)}
                    className={`${INPUT} flex w-full items-center gap-2 text-left ${
                      r.scenarioStore.chosen ? "" : "border-amber-400 bg-amber-50"
                    }`}
                  >
                    {r.scenarioStore.chosen ? (
                      <>
                        <span
                          className={`h-4 w-4 shrink-0 rounded ${SCENARIO_STYLE[r.scenario].bg}`}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {SCENARIO_LABELS[r.scenario]}
                        </span>
                      </>
                    ) : (
                      <span className="min-w-0 flex-1 truncate font-bold text-amber-700">
                        未選択（クリックして選ぶ）
                      </span>
                    )}
                    <ChevronDown size={14} className="shrink-0 text-slate-400" />
                  </button>
                </Field>
                <Field label="アイドル・Pアイドル">
                  <button
                    type="button"
                    onClick={() => setIdolPickerOpen(true)}
                    className={`${INPUT} flex w-full items-center justify-between gap-2 text-left ${
                      settings.pIdol && r.pMaster ? "" : "border-amber-400 bg-amber-50"
                    }`}
                  >
                    <span className="truncate">
                      {settings.pIdol && r.pMaster ? (
                        `${settings.idol} / ${r.pMaster.cardName}`
                      ) : (
                        <b className="text-amber-700">
                          {settings.idol
                            ? `${settings.idol}（Pアイドル未選択）`
                            : "未選択（クリックして選ぶ）"}
                        </b>
                      )}
                    </span>
                    <ChevronDown size={14} className="shrink-0 text-slate-400" />
                  </button>
                </Field>
                <Field
                  label={
                    <span className="flex items-center gap-1">
                      育成パターン（発動回数）
                      <Hint text={GLOSSARY.pattern} />
                    </span>
                  }
                >
                  <select
                    value={r.ability.selectedSetId ?? ""}
                    onChange={(e) => {
                      if (e.target.value !== r.ability.selectedSetId)
                        r.ability.selectSet(e.target.value);
                    }}
                    className={`${INPUT} w-full ${
                      r.ability.selectedSetId
                        ? ""
                        : "border-amber-400 bg-amber-50 font-bold text-amber-700"
                    }`}
                  >
                    <option value="">未選択（クリックして選ぶ）</option>
                    {/* セーブデータ用のセットは数が増えるので別グループにまとめる */}
                    {(() => {
                      const visible = r.ability.sets.filter((set) =>
                        setVisibleInScenario(set.id, r.scenario),
                      );
                      const option = (set: (typeof visible)[number]) => (
                        <option key={set.id} value={set.id}>
                          {set.plan ? `【${set.plan}】` : ""}
                          {set.name}
                        </option>
                      );
                      const normal = visible.filter(
                        (s) => !r.ability.saveIdOf(s.id),
                      );
                      const saveSets = visible.filter((s) =>
                        r.ability.saveIdOf(s.id),
                      );
                      return (
                        <>
                          {normal.map(option)}
                          {saveSets.length > 0 && (
                            <optgroup label="セーブデータ用">
                              {saveSets.map(option)}
                            </optgroup>
                          )}
                        </>
                      );
                    })()}
                  </select>
                </Field>
                {/* メモリー（計算ページ内のモーダルで4枚を選ぶ） */}
                <Field
                  label={
                    <span className="flex items-center gap-1">
                      メモリー
                      <Hint text={GLOSSARY.memory} />
                    </span>
                  }
                >
                  <button
                    type="button"
                    onClick={() => setMemoryOpen(true)}
                    className={`${INPUT} flex w-full items-center gap-2 text-left ${
                      memoryCount === 0 ? "border-amber-400 bg-amber-50" : ""
                    }`}
                  >
                    {memoryCount === 0 ? (
                      <span className="min-w-0 flex-1 truncate font-bold text-amber-700">
                        未選択（クリックして選ぶ）
                      </span>
                    ) : (
                      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                        <span className="text-xs text-slate-500">{memoryCount}枚</span>
                        {TYPE_KEYS.map((t) => (
                          <span
                            key={t}
                            className={`rounded px-1.5 py-0.5 text-xs ${TYPE_CHIP[t]}`}
                          >
                            {TYPE_JA[t]} {r.perType[t].memFixed} / {r.perType[t].memPct}%
                          </span>
                        ))}
                      </span>
                    )}
                    <ChevronDown size={14} className="shrink-0 text-slate-400" />
                  </button>
                </Field>
              </div>
            </div>
          </div>

          {/* 本戦・試験の点数（設定ブロック内） */}
          <ScenarioScoreCard r={r} />
        </Card>

        {/* 探索の結果（押した直後にここへスクロール。下のサポカ編成・踏み方が新しい内容） */}
        {(outcome || pendingOps) && (
          <div id="opt-result" className="scroll-mt-16">
            {outcome && <OptimizeResultCard outcome={outcome} />}
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
          </div>
        )}

        {/* サポカ編成 */}
        <Card
          title="サポカ編成"
          hint={<Hint text={GLOSSARY.cardFlags} />}
          action={
            <button
              type="button"
              onClick={() => selected.clearAll()}
              className={BTN_SECONDARY}
            >
              全て外す
            </button>
          }
        >
          {r.members.filter((m) => m?.rental).length >= 2 && (
            <p className="mb-2 text-xs font-semibold text-amber-600">
              ⚠ レンタルが
              {r.members.filter((m) => m?.rental).length}
              枚選ばれています。レンタルサポカは1育成につき1枚です。
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {selected.slots.map((_, i) => (
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
          <p className={`mt-1.5 ${NOTE}`}>
            枠をクリックで入れ替え、歯車で凸・固定・BAN。「+123」は評価値へのステ換算の貢献です。
          </p>
          {/* 選択中カードの前イベ・後イベ・ステイベ（サポカ設定とは独立した計算ページ専用。常に表示） */}
          <EventCountEditor r={r} />
        </Card>

        {/* レッスンの踏み方（メイン・サブ・SP、授業／営業の並び） */}
        <PlanSummaryCard
          r={r}
          onEditPlan={() => setPlanOpen(true)}
          onEditCounts={() => setCountsOpen(true)}
        />
      </div>

      {/* ===== 結果と操作（デスクトップでは左・スクロールに追従） ===== */}
      <div
        id="calc-results"
        className="flex scroll-mt-16 flex-col gap-4 lg:order-1 lg:sticky lg:top-14 lg:self-start"
      >
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
          <p className="flex items-center justify-center gap-1 text-xs font-semibold text-slate-500">
            評価値
            <Hint text={GLOSSARY.rating} />
            {canShowRating && previewRating !== null && (
              <span className="ml-1 text-amber-600">（取得制限を反映）</span>
            )}
          </p>
          {!canShowRating ? (
            <p className="mt-2 text-xs text-slate-400">
              サポカを6枚編成し、育成パターンを選ぶと表示されます。
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
              <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                {r.scenario === "niaMaster" ? (
                  <>
                    ステ合計×2.3（
                    {Math.floor(r.cappedSum * 2.3).toLocaleString()}）＋
                    ファン投票数の換算値（
                    {(r.scenarioValues.fanValue ?? 0).toLocaleString()}）
                  </>
                ) : r.scenario === "hatsuLegend" ? (
                  <>
                    ステ合計×2.1（
                    {Math.floor(r.cappedSum * 2.1).toLocaleString()}）＋
                    順位ボーナス（
                    {(r.scenarioValues.rankValue ?? 0).toLocaleString()}）＋
                    試験スコアの換算値（
                    {(
                      (r.scenarioValues.midValue ?? 0) +
                      (r.scenarioValues.finalValue ?? 0)
                    ).toLocaleString()}）
                  </>
                ) : (
                  <>
                    ステ合計×2（{(r.cappedSum * 2).toLocaleString()}）＋
                    スター性{r.totalStar}×7.5（
                    {Math.floor(r.totalStar * 7.5).toLocaleString()}）＋
                    本戦ラウンド点数の評価値（
                    {(r.roundValues[0] + r.roundValues[1]).toLocaleString()}）−
                    2,000
                  </>
                )}
              </p>
              {/* 探索の条件を設定しているときは、今の編成での達成状況を出す */}
              {conditionChips.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center justify-center gap-1">
                  {conditionChips.map((c) => (
                    <span key={c.label} className={c.ok ? CHIP_OK : CHIP_NG} title={c.detail}>
                      {c.ok ? "✓" : "✗"} {c.label}
                      {!c.ok && c.detail && (
                        <span className="font-normal opacity-80">（{c.detail}）</span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* 操作（主役ボタン・探索の条件・踏み方・発動回数）。デスクトップでは常に見える */}
        <div className="hidden lg:block">{actionPanel}</div>

        {/* 育成後のステータス */}
        <Card
          title="育成後のステータス"
          hint={<Hint text={`${GLOSSARY.finalStats} 各タイプの上限は${r.statCap}です。`} />}
        >
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
          {/* スター性・Pポイント・体力は1項目1行（3段）で見やすく */}
          <div className="mt-1.5 flex flex-col gap-1 border-t border-slate-100 pt-1.5 text-sm text-slate-500">
            {r.scenario === "hif" && (
              <p>
                合計スター性: <b className="text-violet-600">{r.totalStar}</b>
              </p>
            )}
            {/* サポカ由来のPポイントだけをまとめて出す（固定P・前イベP・P率換算・
                タイプSPレッスンP率）。開始時230や差し入れ・レッスン・メモリー分は含めない
                （内訳はヘルプに記載） */}
            <p className="flex items-center gap-1">
              Pポイント（サポカ分）:{" "}
              <b className="text-cyan-700">
                {Math.round(r.resources.pCards).toLocaleString()}
              </b>
              <Hint text="サポカ由来のPポイント（固定P・前イベP・レッスンP率換算・タイプSPレッスンP率）。開始時230（HIFボーナス200＋STEP3の30。選抜・本戦とも）・差し入れ80×5・レッスン・メモリー分は含みません" />
            </p>
            <p>
              体力:{" "}
              <b className="text-emerald-700">
                {Math.round(r.resources.hpTotal)}
              </b>
            </p>
          </div>
        </Card>

        {/* プロデュース開始時のステ */}
        <Card
          title="開始時のステータス"
          action={
            <button
              type="button"
              onClick={() => setParaboOpen(true)}
              title="パラボ%が今の踏み方で何点ぶんのステになるかの変換表を開きます"
              className={BTN_SECONDARY}
            >
              <Table2 size={13} />
              パラボ変換表
            </button>
          }
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
                <p className="text-xs tabular-nums text-slate-800">
                  ＋{r.perType[type].startPct}%
                </p>
              </div>
            ))}
          </div>
          <p className={`mt-1.5 ${NOTE}`}>
            審査基準:{" "}
            {TYPE_KEYS.map((t) => `${TYPE_JA[t]} ${r.ranks?.[t] ?? "—"}`).join(" / ")}
          </p>
        </Card>
      </div>

      {/* スマホ: 操作パネルは入力列の先頭（画面下の固定バーにも主要操作あり） */}
      <div className="lg:hidden">{actionPanel}</div>

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

      {/* サポカ選択モーダル（凸もその場で直せる） */}
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
          setLevel={r.setLevel}
          onPick={(entry) => {
            selected.setSlot(pickerSlot, entry);
            setPickerSlot(null);
          }}
          onClose={() => setPickerSlot(null)}
        />
      )}

      {/* 探索の条件モーダル */}
      {theoryOpen && (
        <TheorySettingsModal
          settings={settings}
          onUpdate={calc.update}
          onClose={() => setTheoryOpen(false)}
        />
      )}

      {/* 使い方・計算式ヘルプ */}
      {helpOpen && (
        <CalcHelpModal scenario={r.scenario} onClose={() => setHelpOpen(false)} />
      )}

      {/* 初回の探索前: 所持状況が未入力なら確認 */}
      {ownConfirmOpen && (
        <OwnershipConfirmModal
          onProceed={() => {
            writeOwnershipAck();
            setOwnConfirmOpen(false);
            runAutoOptimize();
          }}
          onClose={() => setOwnConfirmOpen(false)}
        />
      )}

      {/* パラボ%→固定値の変換表 */}
      {paraboOpen && (
        <ParaboTableModal r={r} onClose={() => setParaboOpen(false)} />
      )}

      {/* シナリオ選択モーダル（色付き■3つ） */}
      {scenarioPickerOpen && (
        <ScenarioPickerModal
          current={r.scenario}
          onPick={(key) => {
            // シナリオが変わったら発動回数セットは選び直し（テンプレがシナリオ別のため）
            if (key !== r.scenario || !r.scenarioStore.chosen)
              r.ability.clearSelected();
            r.scenarioStore.setScenario(key);
          }}
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

      {/* メモリーを計算ページ内で選ぶ */}
      {memoryOpen && (
        <MemoryPickerModal r={r} onClose={() => setMemoryOpen(false)} />
      )}

      {/* セーブデータ・画像保存 */}
      {saveOpen && (
        <Modal title="セーブデータ・画像で保存" onClose={() => setSaveOpen(false)}>
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
            <span className="text-xs font-bold text-slate-700">画像で保存</span>
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
              disabled={exportBusy}
              onClick={() => {
                if (exportBusy) return;
                setExportBusy(true);
                void exportSheetImage(r, flags.pinned).finally(() =>
                  setExportBusy(false),
                );
              }}
              title="今の計算シートの内容（評価値・ステ・サポカ・レッスン・発動回数など）を画像で保存します"
              className={BTN_PRIMARY}
            >
              <ImageDown size={13} />
              {exportBusy ? "保存中…" : "画像で保存"}
            </button>
          </div>
          <SaveDataPanel r={r} />
        </Modal>
      )}

      {/* 発動回数・踏み方のエディタ（操作パネル／踏み方ブロック／下バーから開く） */}
      <AbilityCountDrawer r={r} open={countsOpen} onClose={() => setCountsOpen(false)} />
      <PlanEditDrawer r={r} open={planOpen} onClose={() => setPlanOpen(false)} />

      {/* スマホ: 画面下の固定バー（評価値・踏み方・回数・主役ボタン） */}
      <MobileActionBar
        rating={previewRating ?? r.rating}
        canShow={canShowRating}
        busy={optBusy}
        ready={optimizeReady}
        notReadyTitle={notReadyTitle}
        onRun={requestAutoOptimize}
        onShowResults={scrollToResults}
        onEditPlan={() => setPlanOpen(true)}
        onEditCounts={() => setCountsOpen(true)}
      />
    </div>
  );
}

/** シナリオ別の本戦・試験スコア入力（評価値の上に置く） */
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
    <div className="mt-3 rounded-lg bg-slate-50 px-2.5 py-2">
      <p className="mb-1.5 text-xs font-bold text-slate-600">
        {title}
        {hint && (
          <span className="ml-1.5 font-normal text-slate-400">{hint}</span>
        )}
      </p>
      {children}
    </div>
  );
}

function ScenarioScoreCard({ r }: { r: ReturnType<typeof useCalcResult> }) {
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
      </SettingSub>
    );
  }
  return (
    <SettingSub title="試験スコア・順位" hint="レッスンページと共有">
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
            return (
              <tr key={card.id}>
                {/* カード */}
                <td className={`${td} min-w-44`}>
                  <span className="flex items-center gap-1.5">
                    <CardThumb name={card.name} id={card.id} />
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
                  <AcquireToggle
                    card={card}
                    override={override}
                    events={r.events}
                    imgClass="h-10 w-10"
                  />
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
        計算ページ専用（サポカ設定ページとは別保存）。
      </p>
    </div>
  );
}

/** 編成サポカのサムネイル（前イベエディタ用） */
function CardThumb({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const url = imageUrl(SUPPORT_IMAGE_BY_ID.get(id) ?? "");
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
          className={`mt-1 block w-28 text-center text-xs font-bold transition hover:text-blue-600 ${
            own ? "text-slate-700" : "text-red-500"
          }`}
        >
          {own ? `特訓${own.kunren}・開花${own.kaika}` : "未所持"}
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

/** Pアイドルの状態表示（プラン・おすすめ効果。特訓開花表示の下に置く） */
function PIdolInfo({ r }: { r: ReturnType<typeof useCalcResult> }) {
  if (!r.pMaster) return null;
  return (
    <div className="text-center text-xs text-slate-600">
      <p>
        <b className="text-slate-800">{r.pMaster.plan}</b>
      </p>
      <p className="text-[11px] leading-tight text-slate-500">
        おすすめ: {r.pMaster.effect}
      </p>
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
