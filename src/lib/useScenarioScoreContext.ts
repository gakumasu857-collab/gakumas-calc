import { useMemo } from "react";
import { niaChallengeTotal } from "@/data/niaChallenge";
import { hatsuChallengeFor } from "./hatsuChallengeSetup";
import { IDOL_RANKS } from "./pIdol";
import type { NiaTag } from "@/data/scenarios";
import { buildHatsuScoreContext, buildNiaScoreContext } from "./scenarioGains";
import { buildSheetScoreContext } from "./sheetContext";
import type { SheetScoreContext } from "./sheetScore";
import { useCalcSettings } from "./useCalcSettings";
import { typeRanksOf } from "./useCalcResult";
import { useHatsuSchedule } from "./useHatsuSchedule";
import { useNiaSchedule } from "./useNiaSchedule";
import { useSchedule } from "./useSchedule";
import { useScenario } from "./useScenario";

/**
 * 点数の計算コンテキストを、計算ページで選んでいるシナリオに合わせて作る（点数表・サポカ設定ページ用）。
 * 2026-11-11 まで点数表とサポカ設定ページは H.I.F の作り方（buildSheetScoreContext）だけだったので、
 * N.I.A・初を選んでいてもレッスン回数は H.I.F の踏み方、試験・オーディション終了などの固定回数は H.I.F の値だった
 * （オーナー「計算ページでシナリオ変えても点数表の発動回数が HIF のまま」）。
 * 作り方は計算ページ（useCalcResult）と同じ。回数は呼び出し側が渡す（点数表はプロデュース設定の回数）。
 */
export function useScenarioScoreContext(
  manualCount: (label: string) => number | undefined,
  eventCounts: SheetScoreContext["eventCounts"],
): { ctx: SheetScoreContext; scenario: ReturnType<typeof useScenario>["scenario"] } {
  const { scenario } = useScenario();
  const schedule = useSchedule();
  const niaSchedule = useNiaSchedule();
  const hatsuSchedule = useHatsuSchedule();
  const { settings } = useCalcSettings();

  const ctx = useMemo(() => {
    if (scenario === "niaMaster") {
      const niaTag: NiaTag = IDOL_RANKS[settings.idol]?.tag === "特化" ? "skew" : "flat";
      return buildNiaScoreContext(
        niaSchedule,
        manualCount,
        eventCounts,
        niaTag,
        typeRanksOf(settings.idol),
        niaChallengeTotal(settings.niaChallenge),
      );
    }
    if (scenario === "hatsuLegend")
      return buildHatsuScoreContext(
        { ...hatsuSchedule, capBonus: hatsuChallengeFor(settings).capBonus },
        manualCount,
        eventCounts,
      );
    return buildSheetScoreContext(schedule, manualCount, eventCounts);
  }, [scenario, schedule, niaSchedule, hatsuSchedule, settings, manualCount, eventCounts]);

  return { ctx, scenario };
}
