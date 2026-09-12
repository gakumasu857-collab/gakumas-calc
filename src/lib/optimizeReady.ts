import type { useCalcResult } from "@/lib/useCalcResult";

/**
 * 最適化（理想編成／サポカ編成／踏み方）を回すのに足りていない設定を返す。
 * どれか欠けたまま探索しても結果が実際の育成とズレるので、
 * ボタンを押せないようにして、何が足りないかを画面に出すのに使う。
 */
export function missingCalcInputs(
  r: ReturnType<typeof useCalcResult>,
): string[] {
  const settings = r.calc.settings;
  return [
    !r.scenarioStore.chosen && "シナリオ",
    !settings.idol && "アイドル名",
    !(settings.pIdol && r.pMaster) && "Pアイドル",
    !r.selectedSet && "プロデュース",
    r.memoryStore.selected.length === 0 && "メモリー",
  ].filter((v): v is string => typeof v === "string");
}

/** ボタンの title に出す「◯◯を選ぶと使えます」 */
export function notReadyTitle(missing: string[]): string | undefined {
  return missing.length === 0
    ? undefined
    : `${missing.join("・")}を選ぶと使えます`;
}
