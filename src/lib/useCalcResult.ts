/**
 * 計算ページの「現在のステ・評価値」の計算フック（他ページも参照する）。
 *
 * 現在のステ[type] = 授業(営業) + メモリー(固定+%変換) + Pアイドル(固定+100 + %変換)
 *                  + レッスン + 試験(オーディション) + 選択サポカ6枠（イベント相互作用込み）
 * 評価値はシナリオ別:
 *   H.I.F: Σmin(3200, ステ)×2 + floor(合計スター性×7.5) + 本戦評価値 − 2000（スプシ検証済み）
 *   N.I.A: floor(Σmin(2600, ステ)×2.3) + ファン投票数換算
 *   初レジェンド: floor(Σmin(3000, ステ)×2.1) + 最終順位分 + 試験スコア換算
 *
 * ロール概念は廃止。サポカは自タイプの踏み回数を参照し、
 * パラボ追従メモリーは「パラボ母数が大きい上位2タイプ」に%が付く。
 */
import { useMemo } from "react";
import { affectionHpBonus, affectionStepP } from "@/data/affection";
import {
  finalRoundStar,
  finalRoundValue,
  LESSONS,
  WAPPEN_MAX,
  wappenStarTotal,
} from "@/data/schedule";
import {
  HATSU_LESSONS,
  HATSU_PARAM_RATE,
  HATSU_RANK_VALUES,
  hatsuExamValue,
  NIA_LESSONS,
  NIA_SALES,
  NIA_PARAM_RATE,
  niaFanValue,
  niaFudaVotes,
  SCENARIO_CAPS,
  type NiaTag,
} from "@/data/scenarios";
import { SUPPORT_CARD_DB } from "@/data/supportCardsDb";
import {
  evaluateTeam,
  scoreSelectedCards,
  summedParaboByType,
  type ScoredCard,
} from "./formation";
import { calcMemoryTotals, resolveParaboMemory } from "./memoryTotals";
import { computePIdolStats, findPIdolMaster, IDOL_RANKS } from "./pIdol";
import {
  buildHatsuScoreContext,
  buildNiaScoreContext,
  computeHatsuGains,
  computeNiaGains,
  niaAuditionBaseStats,
  DEFAULT_RANKS,
  type TypeRanks,
} from "./scenarioGains";
import {
  buildSheetScoreContext,
  paraboAssignFromGains,
  TYPE_SHEET_ROLE,
  manualCountFromSet,
} from "./sheetContext";
import {
  cardInitialFixed,
  cardResources,
  cardSpRate,
  paraboConvert,
} from "./sheetScore";
import { useAbilityCounts } from "./useAbilityCounts";
import { TYPE_KEYS, useCalcSettings, type TypeKey } from "./useCalcSettings";
import { CALC_EVENT_COUNTS_KEY, useEventCounts, withPreMax } from "./useEventCounts";
import { useHatsuSchedule } from "./useHatsuSchedule";
import { useMemoryStore } from "./useMemoryStore";
import { hifBonusValues } from "@/data/hifBonus";
import { supplyPFromChoices } from "@/data/scheduleCalendar";
import { P_SALE_POINTS } from "@/data/abilityCounts";
import { useNiaSchedule } from "./useNiaSchedule";
import { niaChallengeTotal } from "@/data/niaChallenge";
import { useOwnedLevels } from "./useOwnedLevels";
import { useOwnedPIdols } from "./useOwnedPIdols";
import { useScenario } from "./useScenario";
import {
  computeScheduleGains,
  subAppearProb,
  useSchedule,
  type LessonPick,
} from "./useSchedule";
import { useSelectedSupports } from "./useSelectedSupports";

const DB_BY_ID = new Map(SUPPORT_CARD_DB.map((c) => [c.id, c]));

export type SelectedMember = ScoredCard & {
  /** イベント相互作用によるこのカードの追加点 */
  synergy: number;
};

export type PerTypeResult = {
  classGain: number;
  memFixed: number;
  memPct: number;
  memConv: number;
  idolFixed: number;
  idolPct: number;
  idolConv: number;
  lessonGain: number;
  examGain: number;
  supportPoints: number;
  current: number;
  capped: number;
  startFixed: number;
  startPct: number;
};

/** タイプ→審査基準ランク（1〜3）。IDOL_RANKSに無いアイドルは Vo>Da>Vi 扱い */
export function typeRanksOf(idol: string): TypeRanks {
  const ranks = IDOL_RANKS[idol];
  return ranks
    ? { vocal: ranks.vocal, dance: ranks.dance, visual: ranks.visual }
    : DEFAULT_RANKS;
}

export function useCalcResult() {
  const calc = useCalcSettings();
  // シナリオは発動回数ストアより先に読む（スケジュールの選択で決まる回数がシナリオで変わるため）
  const scenarioStore = useScenario();
  const ability = useAbilityCounts(scenarioStore.scenario);
  const schedule = useSchedule();
  const memoryStore = useMemoryStore();
  const pIdols = useOwnedPIdols();
  const selected = useSelectedSupports();
  // 計算ページの前イベ・後イベ設定はサポカ設定と混ざらないよう専用ストアを使う
  const events = useEventCounts(CALC_EVENT_COUNTS_KEY);
  // サポカ設定ページの「前イベの回数の上限」だけは全ページ共通なので、計算ページの設定に重ねて読む（探索もこれを使う。2026-10-09）
  const cardSettings = useEventCounts();
  const eventOverride = useMemo(
    () => withPreMax(events.get, cardSettings.get),
    [events.get, cardSettings.get],
  );
  const niaSchedule = useNiaSchedule();
  const hatsuSchedule = useHatsuSchedule();
  const ownedLevels = useOwnedLevels();
  const { getLevel, loaded: levelsLoaded } = ownedLevels;

  const { settings } = calc;
  const scenario = scenarioStore.scenario;
  const selectedSet = ability.sets.find((s) => s.id === ability.selectedSetId);

  const result = useMemo(() => {
    // ---- Pアイドル ----
    const pMaster = findPIdolMaster(settings.idol, settings.pIdol);
    const ownership = pMaster ? pIdols.getOwnership(pMaster.key) : null;
    const pStats = pMaster
      ? computePIdolStats(
          pMaster.growthTag,
          ownership?.kunren ?? 0,
          ownership?.kaika ?? 0,
        )
      : null;
    const ranks = IDOL_RANKS[settings.idol];
    const typeRanks = typeRanksOf(settings.idol);
    // H.I.Fボーナス（レベルは設定欄で調整。既定は全部最大）
    const hifBonus = hifBonusValues(settings.hifBonus);
    const statCap = scenario === "hif" ? hifBonus.statCap : SCENARIO_CAPS[scenario];

    const manual = manualCountFromSet(
      selectedSet ? (key) => ability.getRunCount(selectedSet, key) : null,
    );

    // ---- スケジュール（シナリオ別・%なしの生値・タイプ直接紐づけ） ----
    // NIAの審査タイプ（バランス=flat / 特化=skew）
    const niaTag: NiaTag = ranks?.tag === "特化" ? "skew" : "flat";
    let bd: Record<"lessons" | "classes" | "exams", Record<TypeKey, number>>;
    let schedGains: Record<TypeKey, number>;
    let hifStar = { lessonStar: 0, examStar: 0 };
    let niaVotesBase = { sales: 0, auditions: 0, finale: 0, base: 0 };
    // N.I.A: チャレンジPアイテムの獲得ボーナス合計%（オーディションの素点に掛かる）
    const niaChallengePct = niaChallengeTotal(settings.niaChallenge);
    let niaAuditionBase: Record<TypeKey, number>[] = [];
    let ctx;
    // レッスン由来のPポイント合計と、踏んだレッスン1回ごとのPポイント（P率の母数）。
    // P率（レッスン全体・自タイプのSPレッスン）はゲームと同じく獲得のたびに切り捨てるので、
    // 合計ではなく1回ずつ持つ（honsen は H.I.F の本戦のレッスン。選抜・本戦の内訳に使う）
    let lessonP = 0;
    const lessonPList: { p: number; main: TypeKey; sp: boolean; honsen: boolean }[] = [];
    if (scenario === "niaMaster") {
      const nia = computeNiaGains(niaSchedule, niaTag, typeRanks, niaChallengePct);
      bd = nia.breakdown;
      schedGains = nia.gains;
      niaVotesBase = nia.votes;
      niaAuditionBase = niaAuditionBaseStats(niaSchedule, niaTag, typeRanks);
      lessonP = nia.pPoints;
      NIA_LESSONS.forEach((lesson, i) => {
        const pick = niaSchedule.lessons[i];
        if (pick?.main)
          lessonPList.push({ p: lesson.p, main: pick.main, sp: pick.sp, honsen: false });
      });
      ctx = buildNiaScoreContext(niaSchedule, manual, eventOverride, niaTag, typeRanks, niaChallengePct);
    } else if (scenario === "hatsuLegend") {
      const hatsu = computeHatsuGains(hatsuSchedule);
      bd = hatsu.breakdown;
      schedGains = hatsu.gains;
      lessonP = hatsu.pPoints;
      HATSU_LESSONS.forEach((lesson, i) => {
        const pick = hatsuSchedule.lessons[i];
        if (pick?.main)
          lessonPList.push({ p: lesson.p, main: pick.main, sp: pick.sp, honsen: false });
      });
      ctx = buildHatsuScoreContext(hatsuSchedule, manual, eventOverride);
    } else {
      const sched = computeScheduleGains(schedule, settings.affection);
      bd = sched.breakdown;
      schedGains = sched.gains;
      hifStar = {
        lessonStar: sched.breakdown.lessonStar,
        examStar: sched.breakdown.examStar,
      };
      lessonP = sched.pPoints;
      LESSONS.forEach((lesson, i) => {
        const pick = schedule.lessons[i];
        if (pick?.main)
          lessonPList.push({
            p: lesson.p,
            main: pick.main,
            sp: pick.sp,
            honsen: lesson.label.startsWith("本戦"),
          });
      });
      ctx = buildSheetScoreContext(schedule, manual, eventOverride);
    }

    // ---- メモリー（メモリーページのスロット4枚） ----
    // パラボ追従メモリーは「パラボ母数が大きい上位2タイプに%・残りに固定値」で展開
    const paraboAssign = paraboAssignFromGains(ctx.gains);
    const mem = calcMemoryTotals(
      memoryStore.slotMemories.map((memory) =>
        memory ? resolveParaboMemory(memory, paraboAssign) : undefined,
      ),
    );
    const memFixed: Record<TypeKey, number> = {
      vocal: mem.Vo.flat,
      dance: mem.Da.flat,
      visual: mem.Vi.flat,
    };
    const memPct: Record<TypeKey, number> = {
      vocal: mem.Vo.percent,
      dance: mem.Da.percent,
      visual: mem.Vi.percent,
    };

    // ---- 選択サポカ（6枠・イベント相互作用込み） ----
    const slotCards = levelsLoaded
      ? scoreSelectedCards(selected.slots, getLevel, ctx, TYPE_SHEET_ROLE)
      : selected.slots.map(() => null);
    const activeCards = slotCards.filter((m): m is ScoredCard => m !== null);
    // 表示・評価値は常に素の値（「試験補助を強める」は理想編成の選定のみに効かせる）。
    // 最高ステ設定はソフト上限（探索で積みに行かないだけ）なので、
    // 表示・評価値の頭打ちはシナリオ上限のみ＝溢れて超えた分も全額入る。
    const caps: Record<TypeKey, number> = {
      vocal: statCap,
      dance: statCap,
      visual: statCap,
    };
    const teamEval = evaluateTeam(
      activeCards,
      { vocal: 0, dance: 0, visual: 0 },
      caps,
    );
    let memberIndex = 0;
    const members: (SelectedMember | null)[] = slotCards.map((m) =>
      m ? { ...m, synergy: teamEval.synergies[memberIndex++] } : null,
    );

    // ---- %→固定値変換（そのタイプのレッスン・試験獲得が母数） ----
    const convert = (type: TypeKey, pctPercent: number) => {
      const g = ctx.gains[TYPE_SHEET_ROLE[type]];
      return paraboConvert(pctPercent / 100, g.lessons, g.exams);
    };

    // ---- タイプごとの集計 ----
    // パラボは全ソース（メモリー＋Pアイドル＋サポカ）を合算してから1回で変換する
    // （カードごとに個別変換すると切り捨てが多く発生して実際より低く出る）
    // HIFボーナス（全タイプ+100・パラボ+10%）はHIFシナリオ限定
    const hifFixedOf = (t: TypeKey) => (scenario === "hif" ? hifBonus.fixed[t] : 0);
    const hifPctOf = (t: TypeKey) => (scenario === "hif" ? hifBonus.pct[t] : 0);
    const basePct = {} as Record<TypeKey, number>;
    for (const type of TYPE_KEYS) {
      basePct[type] = memPct[type] + (pStats?.parabo[type] ?? 0) + hifPctOf(type);
    }
    const adj = summedParaboByType(
      activeCards,
      teamEval.synergies,
      ctx,
      TYPE_SHEET_ROLE,
      basePct,
      teamEval.synergiesByType,
    );

    const perType = {} as Record<TypeKey, PerTypeResult>;
    const baseNoConv = {} as Record<TypeKey, number>;
    for (const type of TYPE_KEYS) {
      const idolFixed = (pStats?.fixed[type] ?? 0) + hifFixedOf(type);
      const idolPct = (pStats?.parabo[type] ?? 0) + hifPctOf(type);
      const picks = activeCards.filter((p) => p.type === type);
      const supportPoints = teamEval.totals[type].raw;
      const supportInitial = picks.reduce((sum, p) => {
        const db = DB_BY_ID.get(p.id);
        return sum + (db ? cardInitialFixed(db, p.level) : 0);
      }, 0);
      const supportPct = picks.reduce((sum, p) => sum + p.bonusPercent, 0);
      const memConv = memFixed[type] + convert(type, memPct[type]);
      const idolConv = convert(type, idolPct);
      // パラボ以外の固定分
      baseNoConv[type] =
        bd.classes[type] +
        memFixed[type] +
        idolFixed +
        bd.lessons[type] +
        bd.exams[type];
      const current = baseNoConv[type] + adj[type].support + adj[type].conv;
      perType[type] = {
        classGain: bd.classes[type],
        memFixed: memFixed[type],
        memPct: memPct[type],
        memConv,
        idolFixed,
        idolPct,
        idolConv,
        lessonGain: bd.lessons[type],
        examGain: bd.exams[type],
        supportPoints,
        current,
        capped: Math.min(caps[type], current),
        startFixed: memFixed[type] + supportInitial + idolFixed,
        startPct: Math.round((memPct[type] + supportPct + idolPct) * 10) / 10,
      };
    }

    // ---- Pポイント・体力の合計（レッスン＋メモリー＋サポカ＋前イベ） ----
    const resources = (() => {
      // HIFのレッスン・サポカ以外の固定取得: 開始時（H.I.Fボーナスの初期Pポイント。STEP3は選抜だけ）と
      // 差し入れ（踏んだ週ごとのPポイント）。
      // 画面には「サポカ分」と「サポカ＋H.I.Fボーナス＋親愛度＋メモリー＋差し入れ」の2行を出す。
      // サポカ固定P・メモリーは選抜期間に計上し、レッスンP率・タイプSPレッスンP率の
      // 換算は対象レッスンの期間（選抜/本戦）に入れる
      const isHifP = scenario === "hif";
      // H.I.Fのレッスンのpは選抜・本戦に分けて持つ（他シナリオは0のまま）
      let lessonPSenbatsu = 0;
      let lessonPHonsen = 0;
      if (isHifP) {
        for (const l of lessonPList) {
          if (l.honsen) lessonPHonsen += l.p;
          else lessonPSenbatsu += l.p;
        }
      }

      let cardP = 0;
      let recover = 0;
      let maxHp = 0;
      // レッスンPポイント率（全レッスン）と、タイプSPレッスンPポイント率（そのカードのタイプのSPレッスン）
      let rateLesson = 0;
      const rateTypeSp: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
      for (const m of activeCards) {
        const db = DB_BY_ID.get(m.id);
        if (!db) continue;
        const res = cardResources(db, m.level, TYPE_SHEET_ROLE[m.type], ctx);
        cardP += res.p;
        recover += res.recover;
        maxHp += res.maxHp;
        rateLesson += res.pRateLesson;
        rateTypeSp[m.type] += res.pRateTypeSp;
      }
      // P率の換算はレッスン1回ごとに切り捨てる（ステのパラボと同じく、ゲームは獲得のたびに切り捨てる。
      // 率は全サポカぶんを合算してから掛ける）。以前は全レッスンの合計に掛けて最後に1回だけ切り捨てていた。
      // 期間別の内訳（選抜レッスン由来 / 本戦レッスン由来）もここで分ける
      let ratePSen = 0;
      let ratePHon = 0;
      for (const l of lessonPList) {
        const rate = rateLesson + (l.sp ? rateTypeSp[l.main] : 0);
        const bonus = Math.floor(l.p * rate + 1e-9);
        if (isHifP && l.honsen) ratePHon += bonus;
        else ratePSen += bonus;
      }
      const rateP = ratePSen + ratePHon;
      void recover; // 体力回復は表示しない（体力＝最大体力を表示する）
      // 差し入れ（活動支給）のPポイントは、どの週（日）で踏んだかで変わる
      // （スケジュールの選択から。H.I.Fは選抜・本戦に分けて計上する）
      const supply = selectedSet
        ? supplyPFromChoices(scenario, ability.getRunChoices(selectedSet))
        : { total: 0, bySection: [] as number[] };
      // N.I.A: 営業先で「Pポイント営業」を踏んだ回数ぶん（1回 +50P）。回数はプロデュースの回数（営業の数まで）
      const pSales =
        scenario === "niaMaster" && selectedSet
          ? P_SALE_POINTS *
            Math.min(NIA_SALES.length, ability.getRunCount(selectedSet, "p_sale"))
          : 0;
      // 親愛度の初期Pポイント（STEP3。21〜で+10〜+30）。H.I.Fは選抜の開始時だけで本戦にはかからない
      const stepP = affectionStepP(settings.affection);
      const pAffection = stepP;
      // H.I.Fボーナスの初期Pポイント増加（【選抜試験】と【本戦】の2枠）
      const pHifBonus = isHifP
        ? hifBonus.startP.senbatsu + hifBonus.startP.honsen
        : 0;
      const pFixedSenbatsu = isHifP
        ? hifBonus.startP.senbatsu + stepP + (supply.bySection[0] ?? 0)
        : 0;
      const pFixedHonsen = isHifP
        ? hifBonus.startP.honsen + (supply.bySection[1] ?? 0)
        : 0;
      const pCardsSenbatsu = cardP + ratePSen;
      const pCardsHonsen = ratePHon;
      const pSenbatsu =
        pFixedSenbatsu + lessonPSenbatsu + mem.P + pCardsSenbatsu;
      const pHonsen = pFixedHonsen + lessonPHonsen + pCardsHonsen;
      const pCards = isHifP ? pCardsSenbatsu + pCardsHonsen : cardP + rateP;
      // 合計に入れるレッスンのP（H.I.Fは選抜・本戦のレッスンを期間別に数えた合計と同じ）
      const pLessonTotal = isHifP ? lessonPSenbatsu + lessonPHonsen : lessonP;
      return {
        /** 合計Pポイント（開始時・差し入れ・レッスン・メモリー・サポカの全部） */
        pTotal: isHifP
          ? pSenbatsu + pHonsen
          : lessonP + mem.P + pCards + pAffection + supply.total + pSales,
        pLesson: lessonP,
        pMemory: mem.P,
        pCards,
        /** 画面の「Pポイント」＝サポカ＋レッスン＋H.I.Fボーナス＋親愛度＋メモリー＋差し入れ（＝その育成で手に入る合計。pTotal と同じ値） */
        pBase: pCards + pLessonTotal + pHifBonus + pAffection + mem.P + supply.total + pSales,
        /** N.I.A: Pポイント営業で増えるPポイント（他シナリオは0） */
        pSales,
        /** 「Pポイント」の内訳に出すレッスンのP */
        pLessonTotal,
        /** H.I.Fボーナスの初期Pポイント（他シナリオは0） */
        pHifBonus,
        /** 親愛度の初期Pポイント（STEP3。H.I.Fも選抜の1回だけ） */
        pAffection,
        /** 差し入れ（活動支給）で増えるPポイント（踏んだ週から） */
        pSupply: supply.total,
        /** HIFの内訳（他シナリオは0） */
        pSenbatsu,
        pHonsen,
        pFixedSenbatsu,
        pFixedHonsen,
        pLessonSenbatsu: lessonPSenbatsu,
        pLessonHonsen: lessonPHonsen,
        pCardsSenbatsu,
        pCardsHonsen,
        /** 体力（Pアイドルの体力＋親愛度の最大体力上昇＋サポカの最大体力上昇） */
        hpTotal: (pStats?.hp ?? 0) + affectionHpBonus(settings.affection) + maxHp,
        hpIdol: (pStats?.hp ?? 0) + affectionHpBonus(settings.affection),
        hpCards: maxHp,
      };
    })();

    // ---- SPレッスン率（サポカ＋Pアイドルの上昇分）とこの踏み方の実現確率 ----
    const spLesson = (() => {
      const base = (settings.baseSpRate[scenario] ?? 10) / 100;
      // 表示はゲーム内に合わせて基礎を除いた上昇分（サポカ＋Pアイドル）。
      // サポカのSPレッスン率は枠の abi_type の属性へ効く
      const bonus: Record<TypeKey, number> = {
        vocal: pStats?.spRate.vocal ?? 0,
        dance: pStats?.spRate.dance ?? 0,
        visual: pStats?.spRate.visual ?? 0,
      };
      for (const m of activeCards) {
        const db = DB_BY_ID.get(m.id);
        if (!db) continue;
        const sp = cardSpRate(db, m.level);
        for (const t of TYPE_KEYS) bonus[t] += sp[t];
      }
      // ゲーム内の「SPレッスン率上昇」表示は、サポカ＋Pアイドルの合計（H.I.FはさらにH.I.FボーナスのSP率、既定+5%）。
      // N.I.A・初にはこの上乗せは無い（SSRのPアイドルなら 10%/10%/10% と表示される）。
      // 画面もそれに合わせて出し（shown）、実際の確率は「表示＋表記外推定SP率（シナリオ別）」とする
      // （例: 表示 +71%・表記外10% → 81%。Da（サブVi=75%）のSP踏み6回連続 = (0.81×0.75)^6 ≈ 5.0%）
      const SHOWN_OFFSET = scenario === "hif" ? hifBonus.spRate : 0;
      const shown: Record<TypeKey, number> = {
        vocal: bonus.vocal + SHOWN_OFFSET,
        dance: bonus.dance + SHOWN_OFFSET,
        visual: bonus.visual + SHOWN_OFFSET,
      };
      const rates: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
      for (const t of TYPE_KEYS) {
        rates[t] = Math.min(1, Math.max(0, base + shown[t]));
      }
      // 実現確率: SP踏みは「メイン属性のSP率」、サブ属性の指定があるレッスン（HIF）は
      // 残り2属性から審査基準が高い方75%・低い方25%の抽選（subAppearProb）。
      // 例: DaSP率30%で Da（サブVi=審査基準上位）のSP踏み = 30% × 75% = 22.5%
      const picks =
        scenario === "niaMaster"
          ? niaSchedule.lessons
          : scenario === "hatsuLegend"
            ? hatsuSchedule.lessons
            : schedule.lessons;
      let prob = 1;
      let spCount = 0;
      let subCount = 0;
      // HIFは選抜（先頭6回）と本戦（後2回）に分けた確率も出す
      let probSen = 1;
      let probHon = 1;
      picks.forEach((pick, i) => {
        if (!pick?.main) return;
        let p = 1;
        if ("sub" in pick) {
          p *= subAppearProb(pick.main, (pick as LessonPick).sub, typeRanks);
          subCount++;
        }
        if (pick.sp) {
          p *= rates[pick.main];
          spCount++;
        }
        prob *= p;
        if (scenario === "hif") {
          if (i < 6) probSen *= p;
          else probHon *= p;
        }
      });
      return { bonus, shown, rates, prob, probSen, probHon, spCount, subCount };
    })();

    // ---- スター性・本戦・評価値（シナリオ別） ----
    const isHif = scenario === "hif";
    // 本戦のスター性はラウンドの点数で変わる（親愛度のボーナス込み・ラウンドごとに切り捨て）
    const finalStar = isHif
      ? finalRoundStar(0, settings.round1, settings.affection) +
        finalRoundStar(1, settings.round2, settings.affection)
      : 0;
    // HIFのワッペンは札（スキルカード取得）のたびに発動する（最大20回）:
    // 発動回数 = セットのスキル獲得回数 + 編成サポカのスキル獲得分（前イベ・後イベ込み）
    const wappenCount = isHif
      ? Math.min(
          WAPPEN_MAX,
          (manual("スキル獲得") ?? 0) +
            activeCards.reduce(
              (sum, m) => sum + (m.eventContrib["スキル獲得"] ?? 0),
              0,
            ),
        )
      : 0;
    const wappenStar = isHif ? wappenStarTotal(wappenCount, settings.affection) : 0;
    const totalStar =
      wappenStar + hifStar.lessonStar + hifStar.examStar + finalStar;
    const roundValues = isHif
      ? [finalRoundValue(0, settings.round1), finalRoundValue(1, settings.round2)]
      : [0, 0];
    const cappedSum = TYPE_KEYS.reduce((sum, t) => sum + perType[t].capped, 0);

    // サポカ抜きの基礎ステ（授業＋メモリー＋Pアイドル＋レッスン＋試験＋基礎パラボ変換）。
    // 理想編成のベースに使う（これを無視すると上限溢れを考慮できない）
    const baseStats = {} as Record<TypeKey, number>;
    for (const type of TYPE_KEYS) {
      baseStats[type] = baseNoConv[type] + convert(type, basePct[type]);
    }

    let rating: number;
    // シナリオ固有の評価値内訳（計算ページ・デバッグの表示用）
    let scenarioValues: {
      fanValue?: number;
      totalVotes?: number;
      setFuda?: number;
      supportFuda?: number;
      totalFuda?: number;
      votesSales?: number;
      votesAuditions?: number;
      votesFinale?: number;
      votesFuda?: number;
      midValue?: number;
      finalValue?: number;
      rankValue?: number;
    } = {};
    // NIAの理想編成用: 札（スキルカード獲得）の投票価値をステ換算で返す
    let niaFudaExtra: ((cards: ScoredCard[]) => number) | undefined;
    if (scenario === "niaMaster") {
      // 札 = 発動回数セットの「スキル獲得」＋編成サポカのスキル獲得分（2枚ごとに3000票）
      const setFuda = manual("スキル獲得") ?? 0;
      const supportFuda = activeCards.reduce(
        (sum, m) => sum + (m.eventContrib["スキル獲得"] ?? 0),
        0,
      );
      const totalFuda = setFuda + supportFuda;
      const votesFuda = niaFudaVotes(totalFuda);
      const totalVotes = niaVotesBase.base + votesFuda;
      const fanValue = niaFanValue(totalVotes);
      rating = Math.floor(cappedSum * NIA_PARAM_RATE) + fanValue;
      scenarioValues = {
        fanValue,
        totalVotes,
        setFuda,
        supportFuda,
        totalFuda,
        votesSales: niaVotesBase.sales,
        votesAuditions: niaVotesBase.auditions,
        votesFinale: niaVotesBase.finale,
        votesFuda,
      };
      niaFudaExtra = (cards) => {
        const fuda = cards.reduce(
          (sum, m) => sum + (m.eventContrib["スキル獲得"] ?? 0),
          0,
        );
        const withVotes = niaVotesBase.base + niaFudaVotes(setFuda + fuda);
        const withoutVotes = niaVotesBase.base + niaFudaVotes(setFuda);
        // 評価値差分をステ換算（評価値=ステ×2.3のため）
        return (niaFanValue(withVotes) - niaFanValue(withoutVotes)) / NIA_PARAM_RATE;
      };
    } else if (scenario === "hatsuLegend") {
      const midValue = hatsuExamValue(0, hatsuSchedule.midScore);
      const finalValue = hatsuExamValue(1, hatsuSchedule.finalScore);
      const rankValue = HATSU_RANK_VALUES[hatsuSchedule.finalRank - 1] ?? 0;
      rating =
        Math.floor(cappedSum * HATSU_PARAM_RATE) +
        rankValue +
        midValue +
        finalValue;
      scenarioValues = { midValue, finalValue, rankValue };
    } else {
      rating =
        cappedSum * 2 +
        Math.floor(totalStar * 7.5) +
        roundValues[0] +
        roundValues[1] -
        2000;
    }

    return {
      pMaster,
      ownership,
      pStats,
      ranks,
      typeRanks,
      plan: pMaster?.plan ?? null,
      perType,
      members,
      totalStar,
      /** HIFワッペンの発動回数（札取得回数から自動算出） */
      wappenCount,
      starParts: {
        wappen: wappenStar,
        lesson: hifStar.lessonStar,
        exam: hifStar.examStar,
        final: finalStar,
      },
      roundValues,
      cappedSum,
      rating,
      scenarioValues,
      resources,
      spLesson,
      statCap,
      ctx,
      // タイプ→シート内部ロール（点数表の参照軸）の固定対応
      roles: { typeRole: TYPE_SHEET_ROLE },
      paraboAssign,
      gains: schedGains,
      baseStats,
      baseNoConv,
      basePct,
      // デバッグページ用: 合算パラボの内訳（パラボ抜きサポカ点・合算%・変換値）
      paraboDetail: adj,
      // NIAの理想編成用（他シナリオではundefined）
      niaFudaExtra,
      /** N.I.A: オーディション（1次・2次・最終）のタイプ別素点（上限クランプ済み・獲得ボーナス前）。他シナリオでは空 */
      niaAuditionBase,
      /** N.I.A: チャレンジPアイテムの獲得ボーナス合計% */
      niaChallengePct,
    };
  }, [
    settings,
    scenario,
    pIdols,
    memoryStore,
    schedule,
    niaSchedule,
    hatsuSchedule,
    ability,
    selectedSet,
    selected.slots,
    eventOverride,
    getLevel,
    levelsLoaded,
  ]);

  return {
    calc,
    ability,
    schedule,
    niaSchedule,
    hatsuSchedule,
    scenarioStore,
    scenario,
    memoryStore,
    pIdols,
    selected,
    events,
    /** 計算ページの設定にサポカ設定ページの前イベの上限を重ねたもの（点数の計算・探索の入力はこちら。黄色い帯の表示は events） */
    eventOverride,
    getLevel,
    setLevel: ownedLevels.setLevel,
    ownedLevels,
    levelsLoaded,
    selectedSet,
    ...result,
  };
}
