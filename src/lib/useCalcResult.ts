/**
 * 計算ページとステータスバーで共有する「現在のステ・評価値」の計算フック。
 *
 * 現在のステ[type] = 授業(営業) + メモリー(固定+%変換) + Pアイドル(固定+100 + %変換)
 *                  + レッスン + 試験(オーディション) + 選択サポカ6枠（イベント相互作用込み）
 * 評価値はシナリオ別:
 *   H.I.F.: Σmin(3200, ステ)×2 + floor(合計スター性×7.5) + 本戦評価値 − 2000（スプシ検証済み）
 *   N.I.A.: floor(Σmin(2600, ステ)×2.3) + ファン投票数換算
 *   初レジェンド: floor(Σmin(3000, ステ)×2.1) + 最終順位分 + 試験スコア換算
 *
 * ロール概念は廃止。サポカは自タイプの踏み回数を参照し、
 * パラボ追従メモリーは「パラボ母数が大きい上位2タイプ」に%が付く。
 */
import { useMemo } from "react";
import {
  FINAL_ROUNDS,
  finalRoundValue,
  LESSONS,
  WAPPEN_MAX,
} from "@/data/schedule";
import {
  HATSU_LESSONS,
  HATSU_PARAM_RATE,
  HATSU_RANK_VALUES,
  hatsuExamValue,
  NIA_LESSONS,
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
  DEFAULT_RANKS,
  type TypeRanks,
} from "./scenarioGains";
import {
  buildSheetScoreContext,
  paraboAssignFromGains,
  SHEET_ROLE_TYPE,
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
import { CALC_EVENT_COUNTS_KEY, useEventCounts } from "./useEventCounts";
import { useHatsuSchedule } from "./useHatsuSchedule";
import { useMemoryStore } from "./useMemoryStore";
import { useNiaSchedule } from "./useNiaSchedule";
import { useOwnedLevels } from "./useOwnedLevels";
import { useOwnedPIdols } from "./useOwnedPIdols";
import { useScenario } from "./useScenario";
import { computeScheduleGains, useSchedule } from "./useSchedule";
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
  const ability = useAbilityCounts();
  const schedule = useSchedule();
  const memoryStore = useMemoryStore();
  const pIdols = useOwnedPIdols();
  const selected = useSelectedSupports();
  // 計算ページの前イベ・後イベ設定はサポカ設定と混ざらないよう専用ストアを使う
  const events = useEventCounts(CALC_EVENT_COUNTS_KEY);
  const scenarioStore = useScenario();
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
    const statCap = SCENARIO_CAPS[scenario];

    const manual = manualCountFromSet(
      selectedSet ? (key) => ability.getCount(selectedSet, key) : null,
    );

    // ---- スケジュール（シナリオ別・%なしの生値・タイプ直接紐づけ） ----
    // NIAの審査タイプ（バランス=flat / 特化=skew）
    const niaTag: NiaTag = ranks?.tag === "特化" ? "skew" : "flat";
    let bd: Record<"lessons" | "classes" | "exams", Record<TypeKey, number>>;
    let schedGains: Record<TypeKey, number>;
    let hifStar = { lessonStar: 0, examStar: 0 };
    let niaVotesBase = { sales: 0, auditions: 0, finale: 0, base: 0 };
    let ctx;
    // レッスン由来のPポイント合計と、タイプ別「メイン踏み×SP」のPポイント（P率の母数）
    let lessonP = 0;
    const typeSpP: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
    if (scenario === "niaMaster") {
      const nia = computeNiaGains(niaSchedule, niaTag, typeRanks);
      bd = nia.breakdown;
      schedGains = nia.gains;
      niaVotesBase = nia.votes;
      lessonP = nia.pPoints;
      NIA_LESSONS.forEach((lesson, i) => {
        const pick = niaSchedule.lessons[i];
        if (pick?.sp) typeSpP[pick.main] += lesson.p;
      });
      ctx = buildNiaScoreContext(niaSchedule, manual, events.get, niaTag, typeRanks);
    } else if (scenario === "hatsuLegend") {
      const hatsu = computeHatsuGains(hatsuSchedule);
      bd = hatsu.breakdown;
      schedGains = hatsu.gains;
      lessonP = hatsu.pPoints;
      HATSU_LESSONS.forEach((lesson, i) => {
        const pick = hatsuSchedule.lessons[i];
        if (pick?.sp) typeSpP[pick.main] += lesson.p;
      });
      ctx = buildHatsuScoreContext(hatsuSchedule, manual, events.get);
    } else {
      const sched = computeScheduleGains(schedule);
      bd = sched.breakdown;
      schedGains = sched.gains;
      hifStar = {
        lessonStar: sched.breakdown.lessonStar,
        examStar: sched.breakdown.examStar,
      };
      lessonP = sched.pPoints;
      LESSONS.forEach((lesson, i) => {
        const pick = schedule.lessons[i];
        if (pick?.main && pick.sp) typeSpP[pick.main] += lesson.p;
      });
      ctx = buildSheetScoreContext(schedule, manual, events.get);
    }

    // ---- メモリー（メモリーページのスロット4枚） ----
    // パラボ追従メモリーは「パラボ母数が大きい上位2タイプに%・残りに固定値」で展開
    const paraboAssign = paraboAssignFromGains(ctx.gains);
    const mem = calcMemoryTotals(
      memoryStore.selected.map((id) => {
        const memory = memoryStore.findMemory(id);
        return memory && resolveParaboMemory(memory, paraboAssign);
      }),
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
    const basePct = {} as Record<TypeKey, number>;
    for (const type of TYPE_KEYS) {
      basePct[type] = memPct[type] + (pStats?.parabo[type] ?? 0) + 10;
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
      const idolFixed = (pStats?.fixed[type] ?? 0) + 100;
      const idolPct = (pStats?.parabo[type] ?? 0) + 10;
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
      // HIFのレッスン・サポカ以外の固定取得: 選抜開始時230・本戦開始時200・
      // 差し入れ80×5（うち1回は本戦）。サポカ固定P・メモリーは選抜期間に計上し、
      // レッスンP率・タイプSPレッスンP率の換算は対象レッスンの期間（選抜/本戦）に入れる
      const isHifP = scenario === "hif";
      let lessonPSenbatsu = 0;
      let lessonPHonsen = 0;
      // タイプSPレッスンP率の母数（自タイプのメイン踏み×SPレッスンのP）を期間別に持つ
      const spPSen: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
      const spPHon: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
      if (isHifP) {
        LESSONS.forEach((lesson, i) => {
          const pick = schedule.lessons[i];
          if (!pick?.main) return;
          const honsen = lesson.label.startsWith("本戦");
          if (honsen) lessonPHonsen += lesson.p;
          else lessonPSenbatsu += lesson.p;
          if (pick.sp) (honsen ? spPHon : spPSen)[pick.main] += lesson.p;
        });
      }

      let cardP = 0;
      let recover = 0;
      let maxHp = 0;
      let rateLesson = 0;
      let rateTypeSpTotal = 0;
      let rateTypeSpSen = 0;
      let rateTypeSpHon = 0;
      for (const m of activeCards) {
        const db = DB_BY_ID.get(m.id);
        if (!db) continue;
        const res = cardResources(db, m.level, TYPE_SHEET_ROLE[m.type], ctx);
        cardP += res.p;
        recover += res.recover;
        maxHp += res.maxHp;
        rateLesson += res.pRateLesson;
        // タイプSP率は「自タイプのメイン踏み×SPレッスン」のPが母数
        rateTypeSpTotal += res.pRateTypeSp * typeSpP[m.type];
        rateTypeSpSen += res.pRateTypeSp * spPSen[m.type];
        rateTypeSpHon += res.pRateTypeSp * spPHon[m.type];
      }
      const rateP = Math.floor(rateLesson * lessonP + rateTypeSpTotal);
      // P率換算の期間別内訳（選抜レッスン由来 / 本戦レッスン由来）
      const ratePSen = Math.floor(rateLesson * lessonPSenbatsu + rateTypeSpSen);
      const ratePHon = Math.floor(rateLesson * lessonPHonsen + rateTypeSpHon);
      void recover; // 体力回復は表示しない（体力＝最大体力を表示する）
      const pFixedSenbatsu = isHifP ? 230 + 80 * 4 : 0;
      const pFixedHonsen = isHifP ? 200 + 80 : 0;
      const pCardsSenbatsu = cardP + ratePSen;
      const pCardsHonsen = ratePHon;
      const pSenbatsu =
        pFixedSenbatsu + lessonPSenbatsu + mem.P + pCardsSenbatsu;
      const pHonsen = pFixedHonsen + lessonPHonsen + pCardsHonsen;
      return {
        /** 合計Pポイント（HIFは開始時・差し入れの固定取得も含む） */
        pTotal: isHifP
          ? pSenbatsu + pHonsen
          : lessonP + mem.P + cardP + rateP,
        pLesson: lessonP,
        pMemory: mem.P,
        pCards: isHifP ? pCardsSenbatsu + pCardsHonsen : cardP + rateP,
        /** HIFの内訳（他シナリオは0） */
        pSenbatsu,
        pHonsen,
        pFixedSenbatsu,
        pFixedHonsen,
        pLessonSenbatsu: lessonPSenbatsu,
        pLessonHonsen: lessonPHonsen,
        pCardsSenbatsu,
        pCardsHonsen,
        /** 体力（Pアイドルの体力＋サポカの最大体力上昇） */
        hpTotal: (pStats?.hp ?? 0) + maxHp,
        hpIdol: pStats?.hp ?? 0,
        hpCards: maxHp,
      };
    })();

    // ---- SPレッスン率（サポカ＋Pアイドルの上昇分）とこの踏み方の実現確率 ----
    const spLesson = (() => {
      const base = (settings.baseSpRate ?? 10) / 100;
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
      const rates: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
      for (const t of TYPE_KEYS) {
        rates[t] = Math.min(1, Math.max(0, base + bonus[t]));
      }
      // 実現確率: SP踏みは「メイン属性のSP率」、サブ属性の指定があるレッスン（HIF）は
      // 2択（残り2属性からランダム）で50%。
      // 例: DaSP率30%で Da（サブVo）のSP踏み = 30% × 50% = 15%
      const picks =
        scenario === "niaMaster"
          ? niaSchedule.lessons
          : scenario === "hatsuLegend"
            ? hatsuSchedule.lessons
            : schedule.lessons;
      let prob = 1;
      let spCount = 0;
      let subCount = 0;
      for (const pick of picks) {
        if (!pick?.main) continue;
        if ("sub" in pick) {
          prob *= 0.5;
          subCount++;
        }
        if (pick.sp) {
          prob *= rates[pick.main];
          spCount++;
        }
      }
      return { bonus, rates, prob, spCount, subCount };
    })();

    // ---- スター性・本戦・評価値（シナリオ別） ----
    const isHif = scenario === "hif";
    const finalStar = isHif
      ? FINAL_ROUNDS.reduce((sum, r) => sum + r.star, 0)
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
    const wappenStar = isHif ? 15 * wappenCount : 0;
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
      // 互換用: タイプ⇔シート内部ロールの固定対応
      roles: { roleType: SHEET_ROLE_TYPE, typeRole: TYPE_SHEET_ROLE },
      paraboAssign,
      gains: schedGains,
      baseStats,
      baseNoConv,
      basePct,
      // デバッグページ用: 合算パラボの内訳（パラボ抜きサポカ点・合算%・変換値）
      paraboDetail: adj,
      // NIAの理想編成用（他シナリオではundefined）
      niaFudaExtra,
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
    events.get,
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
    getLevel,
    setLevel: ownedLevels.setLevel,
    levelsLoaded,
    selectedSet,
    ...result,
  };
}
