import { useState } from "react";
import { HelpCircle, ImageDown, Save, Settings } from "lucide-react";
import { setPlanMatches } from "@/data/abilityCounts";
import { SUPPORT_CARD_DB } from "@/data/supportCardsDb";
import { SUPPORT_CATALOG } from "@/data/supportCardCatalog";
import AbilityCountDrawer from "@/components/calc/AbilityCountDrawer";
import ActionPanel, { type RunStatus } from "@/components/calc/ActionPanel";
import CalcHelpModal from "@/components/calc/CalcHelpModal";
import FormationPlanCard from "@/components/calc/FormationPlanCard";
import HifBonusModal from "@/components/calc/HifBonusModal";
import NiaChallengeModal from "@/components/calc/NiaChallengeModal";
import MemoryPickerModal from "@/components/calc/MemoryPickerModal";
import ParaboTableModal from "@/components/calc/ParaboTableModal";
import PIdolTrainingModal from "@/components/calc/PIdolTrainingModal";
import PIdolUnownedModal from "@/components/calc/PIdolUnownedModal";
import SideTabs from "@/components/calc/SideTabs";
import PlanEditDrawer from "@/components/calc/PlanEditDrawer";
import PremiseCard from "@/components/calc/PremiseCard";
import SaveDataPanel from "@/components/calc/SaveDataPanel";
import {
  IdolPickerModal,
  ScenarioPickerModal,
  TheorySettingsModal,
} from "@/components/calc/SettingPickers";
import StatsCard from "@/components/calc/StatsCard";
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
import { BTN_PRIMARY, BTN_SECONDARY, CHIP_NG, CHIP_OK } from "@/components/ui";
import { runFullOptimize, type AutoOptimizeResult } from "@/lib/autoOptimize";
import { buildSnapshot } from "@/lib/calcSaveIO";
import { imageUrl } from "@/lib/config";
import { exportSheetImage } from "@/components/calc/ExportSheet";
import {
  examStyleTags,
  findBestFormation,
  scoreOwnedCards,
  scoreRentalCandidates,
  sumEventContrib,
  typeConstraintFromRatio, planAllows } from "@/lib/formation";
import {
  conditionChips as conditionChipsOf,
  currentMeetsConditions as meetsConditions,
  formationIssues,
  type ConditionInput,
} from "@/lib/formationConditions";
import { GLOSSARY } from "@/lib/glossary";
import { buildAutoOptimizeInput, resolveSpMin } from "@/lib/buildOptimizeInput";
import {
  missingCalcInputs,
  notReadyTitle as notReadyTitleOf,
} from "@/lib/optimizeReady";
import { findPIdolMaster, IDOL_RANKS } from "@/lib/pIdol";
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
import { TYPE_KEYS, type TypeKey } from "@/lib/useCalcSettings";

const CARD_BY_ID = new Map(SUPPORT_CARD_DB.map((c) => [c.id, c]));

const SUPPORT_IMAGE_BY_ID = new Map(
  SUPPORT_CATALOG.map((c) => [c.id, c.image]),
);
/** 一度でも探索を押したか（押すまでは、前提がそろったらボタンの上に動く矢印を出す） */
/** 左端タブの案内（初めて探索したあとの吹き出し）を見た（タブを押した／「わかった」）ことの記憶 */
const SIDE_SEEN_KEY = "gakumas:calc:sideTabsSeen:v1";
const readSideSeen = (): boolean => {
  try {
    return localStorage.getItem(SIDE_SEEN_KEY) === "1";
  } catch {
    return false;
  }
};
const writeSideSeen = () => {
  try {
    localStorage.setItem(SIDE_SEEN_KEY, "1");
  } catch {
    // 保存できなくても動作に支障なし
  }
};

const EVER_RUN_KEY = "gakumas:calc:everRun:v1";
const readEverRun = (): boolean => {
  try {
    return localStorage.getItem(EVER_RUN_KEY) === "1";
  } catch {
    return false;
  }
};
const writeEverRun = () => {
  try {
    localStorage.setItem(EVER_RUN_KEY, "1");
  } catch {
    // 保存できなくても動作には影響しない
  }
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
  /** 特訓・才能開花のモーダル（「設定欄」のアイドル欄から） */
  const [trainingOpen, setTrainingOpen] = useState(false);
  /** H.I.F.ボーナスの調整モーダル（設定欄の本戦ラウンド点数の下から） */
  const [hifBonusOpen, setHifBonusOpen] = useState(false);
  /** チャレンジPアイテムの獲得ボーナスのモーダル（設定欄のファン投票数の下から。N.I.A.） */
  const [niaChallengeOpen, setNiaChallengeOpen] = useState(false);
  /** 探索を押したときのPアイドル未所持の注意（「このまま探索」で実行する処理を持つ） */
  const [pIdolWarn, setPIdolWarn] = useState<(() => void) | null>(null);
  /** 左端タブの案内（初めて探索したあと、タブを押すか「わかった」まで） */
  const [sideHint, setSideHint] = useState<boolean>(() => readEverRun() && !readSideSeen());
  /** 直近の探索の状況（操作パネルの下に1行で出す） */
  const [lastRun, setLastRun] = useState<RunStatus | null>(null);
  const [everRun, setEverRun] = useState<boolean>(readEverRun);
  /** 探索が終わった回数（評価値の数字を探索後にも動かすための key） */
  const [runSeq, setRunSeq] = useState(0);
  const bumpRun = () => setRunSeq((n) => n + 1);
  const markRun = () => {
    if (everRun) return;
    setEverRun(true);
    writeEverRun();
    // 初めての探索のあとに左端タブ（踏み方・発動回数）を案内する
    if (!readSideSeen()) setSideHint(true);
  };
  const dismissSideHint = () => {
    if (!sideHint) return;
    setSideHint(false);
    writeSideSeen();
  };
  /** 「今の編成のまま踏み方だけ」（分割メニュー） */
  const planOpt = useOptimizePlan(r);

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
    markRun();
    setIdealBusy(true);
    setLastRun(null);
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
          setLastRun({
            message: "編成を組めません（プラン制限内の所持サポカが不足しています）",
          });
          return;
        }
        selected.setAll(best.picks.map((p) => ({ id: p.id, rental: p.rental })));
        bumpRun();
        setLastRun({
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

  /** 条件判定の入力（今の編成・設定・今の踏み方で決まるSP率持ち枚数・今のステ） */
  const conditionInput = (): ConditionInput => ({
    members: r.members.filter((m): m is SelectedMember => m !== null),
    flags,
    settings,
    plan: r.plan,
    spMin: resolveSpMin(r, settings),
    capped: {
      vocal: r.perType.vocal.capped,
      dance: r.perType.dance.capped,
      visual: r.perType.visual.capped,
    },
    statCap: r.statCap,
    getLevel: r.getLevel,
  });
  /**
   * 今の編成（選択サポカ）が現在の条件設定（固定・BAN・レンタルNG・プラン・ステージ用の除外・
   * SP率持ち・タイプ割合・最低/最高ステ）を満たしているか。
   * 満たしているのに探索結果が今の評価値を下回る場合は、結果を反映せず現状維持する
   * （設定を厳しくした直後などは今の編成が条件外なので、下がっても置き換える）。
   */
  const currentMeetsConditions = (): boolean => meetsConditions(conditionInput());

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
        issues: formationIssues(conditionInput()),
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

  /**
   * 全自動最適化: レッスン（営業・授業）の踏み方×サポカ編成をまとめて探索して、
   * 評価値が一番高かった組み合わせを踏み方・選択サポカへ反映する。
   * 結果そのものは編成・踏み方・評価値の表示に出るので、ここには探索の内訳
   * （何通り・何秒・前後の評価値）と注意だけを残す。
   */
  const runAutoOptimize = () => {
    markRun();
    setOptBusy(true);
    setLastRun(null);
    // 押す前の評価値（表示できているときだけ比較対象にする）と条件適合を控える。
    // 試験補助強めON中は探索の目的関数が「評価値＋補助加点」になり、最適編成の
    // 表示評価値が下がるのはむしろ正常なので、劣化ガードは効かせない。
    // 取得回数の制限ON中も、結果は制限を反映した評価値（今の評価値より低くて当然）なので効かせない
    const before =
      canShowRating && !settings.examAssist && !settings.eventBudget.enabled ? r.rating : null;
    const beforeOk = before !== null && currentMeetsConditions();
    // 「計算中…」を先に描画させてから重い探索を回す
    setTimeout(() => {
      try {
        const res = runFullOptimize(buildAutoOptimizeInput(r, flags, settings));
        if (!res) {
          setLastRun({
            message: "編成を組めません（プラン制限内の所持サポカが不足しています）",
          });
          return;
        }
        // 採用した結果でも満たせなかった条件（SP率持ち枚数・最低ステ・最高ステ）
        const issues = res.axisReport?.find((a) => a.chosen)?.issues ?? [];
        const notes: string[] = [];
        if (issues.length > 0) notes.push(`満たせなかった条件: ${issues.join("・")}`);
        // 今の編成が条件を満たしていて、探索結果がそれを下回るなら反映しない
        if (before !== null && beforeOk && res.rating < before) {
          setLastRun({
            evaluated: res.evaluated,
            elapsedMs: res.elapsedMs,
            before,
            after: res.rating,
            kept: true,
            notes,
            diagLog: buildDiagLog(res, before, beforeOk, false),
          });
          bumpRun();
          return;
        }
        if (res.hif)
          r.schedule.setPlan(res.hif.lessons, res.hif.classTypes, res.hif.examScores);
        if (res.nia) r.niaSchedule.setPlan(res.nia.lessons, res.nia.sales);
        if (res.hatsu)
          r.hatsuSchedule.setPlan(res.hatsu.lessons, res.hatsu.classTypes);
        selected.setAll(res.slots);
        // イベント予算で発動しないことにした前イベ・後イベは「提案」として保持し、
        // 自動ではサポカ設定に反映しない（提案のボタンを押して初めて反映）。
        const ops = res.eventOps ?? null;
        const hasOps = !!ops && ops.length > 0;
        setPendingOps(hasOps ? ops : null);
        // 取得制限つきの理論評価値を評価値ボックスに一時表示（サポカ設定は未変更）
        setPreviewRating(hasOps ? res.rating : null);
        if (before !== null && !beforeOk && res.rating < before) {
          notes.push(
            "押す前より評価値が下がっていますが、元の編成は探索の条件に合っていなかったため置き換えました",
          );
        }
        if (hasOps) {
          notes.push(
            "評価値には前イベ/後イベの取得制限を反映した値を表示しています（提案からサポカ設定にも反映できます）",
          );
        }
        setLastRun({
          evaluated: res.evaluated,
          elapsedMs: res.elapsedMs,
          before,
          after: res.rating,
          notes,
          diagLog: buildDiagLog(res, before, beforeOk, true),
        });
        bumpRun();
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
    setLastRun({ message: "前イベ/後イベの取得制限をサポカ設定に反映しました。" });
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
    // プロデュース（発動回数セット）はPアイドルのプランで使えるものだけ選べる。
    // 使えないものを選んだままなら外して、選び直してもらう
    const plan = findPIdolMaster(idol, pIdolCardName)?.plan ?? null;
    if (!setPlanMatches(r.selectedSet?.plan, plan)) r.ability.clearSelected();
  };

  const conditionChips = conditionChipsOf(conditionInput());
  /** 前イベ・後イベ・ステイベを手で変えている編成カードの数（全体像カードのバッジ） */
  const eventOverrideCount = r.members.filter((m) => {
    if (!m) return false;
    const ov = r.events.get(m.id);
    return !!ov && Object.values(ov).some((v) => v !== undefined && v !== null);
  }).length;

  /** 主役ボタン（所持状況は「設定欄」の欄で見せているので、確認は挟まない） */
  /** 選んでいるPアイドルが所持状況で未所持なら、探索の前に注意を出す（直すか、そのまま進むか） */
  const guardPIdol = (run: () => void) => {
    if (r.pMaster && !r.ownership) setPIdolWarn(() => run);
    else run();
  };
  const requestAutoOptimize = () => guardPIdol(runAutoOptimize);
  /** プラン外のサポカが入っているか（画像出力は不可にする） */
  const outOfPlan = r.members.some(
    (m) => m !== null && !planAllows(SUPPORT_CARD_DB.find((c) => c.id === m.id)?.plan ?? "", r.plan),
  );

  const anyBusy = optBusy || idealBusy || planOpt.busy;
  const runPlanOnly = () => {
    markRun();
    setLastRun(null);
    planOpt.run((m) => {
      setLastRun({ message: m });
      bumpRun();
    });
  };
  /** 操作パネル（前提のすぐ下＝入れたらそのまま押す。PC・スマホ共通） */
  const actionPanel = (
    <ActionPanel
      busy={anyBusy}
      ready={optimizeReady}
      missingInputs={missingInputs}
      notReadyTitle={notReadyTitle}
      showArrow={optimizeReady && !everRun}
      status={lastRun}
      onRun={requestAutoOptimize}
      onFormationOnly={() => guardPIdol(applyIdealFormation)}
      onPlanOnly={runPlanOnly}
      onConditions={() => setTheoryOpen(true)}
    />
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 pl-9 sm:pl-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:pl-6 2xl:pl-0">
      {/* 見出し行: タイトル／セーブデータ／ヘルプ */}
      <div className="-mb-1 flex flex-wrap items-center justify-between gap-2 lg:col-span-2 lg:order-first">
        <h1 className="text-xl font-bold text-slate-900">計算ページ</h1>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSaveOpen(true)}
            className={BTN_SECONDARY}
            title="育成の状態（前提・踏み方・編成・所持状況）をまるごと保存・読み込み"
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
            計算式・数値表
          </button>
        </div>
      </div>

      {/* ===== 入力（デスクトップでは左列）。スマホでは列を解体（contents）して order で並べ、評価値を編成より上に出す ===== */}
      <div className="contents lg:order-1 lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
        {/* 設定欄＝育成の前提（シナリオ・Pアイドル（特訓・開花）・プロデュース・メモリー・所持状況・本戦点数）。1〜4がそろうと探索できる */}
        <div className="order-1 min-w-0">
        <PremiseCard
          r={r}
          onOpenScenario={() => setScenarioPickerOpen(true)}
          onOpenIdol={() => setIdolPickerOpen(true)}
          onOpenMemory={() => setMemoryOpen(true)}
          onOpenIdolTraining={() => setTrainingOpen(true)}
          onOpenHifBonus={() => setHifBonusOpen(true)}
          onOpenNiaChallenge={() => setNiaChallengeOpen(true)}
        />
        </div>

        {/* 操作（求める▾・探索の条件・前回の探索）: 前提のすぐ下＝入れたらそのまま押す */}
        <div className="order-2 min-w-0">{actionPanel}</div>

        {/* 取得制限の提案（探索がイベント予算に合わせて出したもの。反映するまでサポカ設定は変えない） */}
        {pendingOps && (
          <div className="order-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-slate-600">
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
                    <span className="ml-1 font-semibold text-red-600">取得OFF</span>
                  )}
                  {op.pre !== undefined && (
                    <span className="ml-1 font-semibold text-red-600">
                      前イベ{op.pre}回
                    </span>
                  )}
                  {op.post === 0 && (
                    <span className="ml-1 font-semibold text-red-600">後イベ✕</span>
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

        {/* サポカ編成と踏み方（一度に見える） */}
        <div className="order-5 min-w-0">
        <FormationPlanCard
          r={r}
          flags={flags}
          eventOverrideCount={eventOverrideCount}
          onOpenSlot={(i) => setPickerSlot(i)}
          onDetail={(m) => setDetail(m)}
          onEditPlan={() => setPlanOpen(true)}
          onClearAll={() => selected.clearAll()}
          onOpenParabo={() => setParaboOpen(true)}
        >
          {/* 選択中カードの前イベ・後イベ・ステイベ（サポカ設定とは独立した計算ページ専用） */}
          <EventCountEditor r={r} />
        </FormationPlanCard>
        </div>
      </div>

      {/* ===== 結果（デスクトップでは右列・スクロールに追従。スマホでは評価値が編成の上、ステータスが一番下） ===== */}
      <div
        id="calc-results"
        className="contents lg:order-2 lg:flex lg:flex-col lg:gap-3 lg:sticky lg:top-14 lg:self-start"
      >
        {/* 評価値（左にPアイドル。提案中は取得制限を反映した理論値を一時表示）。
            数字は key を変えて再マウントし、変わった瞬間に少し大きくなる（手で変えると効くのが分かる） */}
        <div
          className={`order-4 rounded-xl border-2 bg-white p-3 ${
            !canShowRating
              ? "border-slate-300"
              : previewRating !== null
                ? "border-amber-500"
                : "border-blue-600"
          }`}
        >
          <div className="flex items-center gap-3">
            {/* Pアイドル（画像クリック=選択・歯車=特訓/開花） */}
            <div className="flex w-24 shrink-0 flex-col items-center gap-1">
              <PIdolImageEditor r={r} onOpenPicker={() => setIdolPickerOpen(true)} />
              <PIdolInfo r={r} />
            </div>
            <div className="min-w-0 flex-1 text-center">
              <p className="flex items-center justify-center gap-1 text-xs font-semibold text-slate-500">
                評価値
                <Hint text={GLOSSARY.rating} />
                {canShowRating && previewRating !== null && (
                  <span className="ml-1 text-amber-600">（取得制限を反映）</span>
                )}
              </p>
              {!canShowRating ? (
                <p className="mt-2 text-xs text-slate-400">
                  サポカを6枚編成し、プロデュースを選ぶと表示されます。
                </p>
              ) : (
                <>
                  <div className="mt-0.5 flex items-baseline justify-center gap-2">
                    <p
                      key={`${previewRating ?? r.rating}-${runSeq}`}
                      className={`animate-rating-pop text-4xl font-bold tabular-nums ${
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
                  {/* 探索の条件を設定しているときは、今の編成での達成状況を出す */}
                  {conditionChips.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1">
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
                  {/* 画像に出力（セーブデータとは別物なので評価値の下に置く） */}
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                    <input
                      type="text"
                      value={settings.userName}
                      onChange={(e) => calc.update({ userName: e.target.value })}
                      placeholder="名前（任意・画像に載る）"
                      maxLength={20}
                      className="w-40 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      disabled={exportBusy || outOfPlan}
                      onClick={() => {
                        if (exportBusy || outOfPlan) return;
                        setExportBusy(true);
                        void exportSheetImage(r, flags.pinned).finally(() =>
                          setExportBusy(false),
                        );
                      }}
                      title={
                        outOfPlan
                          ? "プラン外のサポカが入っているので画像に出力できません"
                          : "今の計算（評価値・ステ・サポカ・レッスン・発動回数など）を1枚の画像にして保存します"
                      }
                      className={`${BTN_SECONDARY} disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      <ImageDown size={13} />
                      {exportBusy ? "出力中…" : "画像に出力"}
                    </button>
                    {outOfPlan && (
                      <span className="w-full text-center text-[11px] font-semibold text-red-600">
                        プラン外のサポカが入っているので画像に出力できません
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 育成後のステータス（内訳バーつき） */}
        <div className="order-6">
          <StatsCard r={r} minStats={settings.minStats} maxStats={settings.maxStats} />
        </div>
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

      {/* サポカ選択モーダル（凸・固定・BAN・レンタルNGもここで） */}
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
          flags={flags}
          onToggleFlag={flags.toggle}
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

      {/* 特訓・才能開花（「設定欄」のアイドル欄から） */}
      {trainingOpen && r.pMaster && (
        <PIdolTrainingModal r={r} onClose={() => setTrainingOpen(false)} />
      )}
      {/* H.I.F.ボーナスのレベル調整 */}
      {hifBonusOpen && <HifBonusModal r={r} onClose={() => setHifBonusOpen(false)} />}
      {/* チャレンジPアイテムの獲得ボーナス（N.I.A.） */}
      {niaChallengeOpen && <NiaChallengeModal r={r} onClose={() => setNiaChallengeOpen(false)} />}

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
        <MemoryPickerModal r={r} onClose={() => setMemoryOpen(false)} showTemplate={!everRun} />
      )}

      {/* セーブデータ・画像保存 */}
      {saveOpen && (
        <Modal title="セーブデータ（育成の状態を保存・読み込み）" onClose={() => setSaveOpen(false)}>
          <SaveDataPanel r={r} />
        </Modal>
      )}

      {/* 左端のタブ（上＝発動回数・下＝レッスン等の踏み方）。初めて探索したあとは吹き出しで案内 */}
      <SideTabs
        onOpenCounts={() => setCountsOpen(true)}
        onOpenPlan={() => setPlanOpen(true)}
        countsTitle={
          r.selectedSet
            ? `プロデュース「${r.selectedSet.name}」のアビリティ発動回数を調整`
            : "プロデュースを選ぶと調整できます"
        }
        highlight={sideHint}
        onDismissHighlight={dismissSideHint}
      />
      {/* 探索の前の注意: 選んでいるPアイドルが未所持 */}
      {pIdolWarn && r.pMaster && (
        <PIdolUnownedModal
          name={r.pMaster.cardName}
          onFix={() => {
            setPIdolWarn(null);
            setTrainingOpen(true);
          }}
          onProceed={() => {
            const run = pIdolWarn;
            setPIdolWarn(null);
            run();
          }}
          onClose={() => setPIdolWarn(null)}
        />
      )}

      {/* 発動回数・踏み方のエディタ（左端のタブか踏み方チップから開く） */}
      <AbilityCountDrawer r={r} open={countsOpen} onClose={() => setCountsOpen(false)} />
      <PlanEditDrawer r={r} open={planOpen} onClose={() => setPlanOpen(false)} />
    </div>
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
            className="h-24 w-24 rounded-xl border border-slate-200 object-cover shadow-sm transition hover:brightness-95"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-400">
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
          className={`mt-1 block w-24 text-center text-xs font-bold transition hover:text-blue-600 ${
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

const SMALL_BTN =
  "flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40";
