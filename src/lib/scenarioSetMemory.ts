import type { ScenarioKey } from "@/data/scenarios";

/**
 * シナリオやPアイドルを切り替えたときに外したプロデュース（発動回数セット）を覚えておく（計算ページ）。
 * 「シナリオ × Pアイドル」の組み合わせごとに覚え、探索を押す前に同じ組み合わせへ戻したら、
 * そのとき選んでいたプロデュースに戻す（オーナー指定 2026-09-21。以前はシナリオだけだった）。
 * 上書き保存していない「この育成だけ」の変更はセットごとに残っているので、選び直せば一緒に戻る。
 * 探索を押したら捨てる。画面の移動や再読み込みをはさんでも続くように localStorage に置く。
 */
const KEY = "gakumas:calc:scenarioSetMemory:v2";

/** 「シナリオ｜Pアイドル」 → セットID */
type Memory = Record<string, string>;

const keyOf = (scenario: ScenarioKey, pIdol: string | null | undefined): string =>
  `${scenario}|${pIdol ?? ""}`;

function read(): Memory {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Memory) : {};
  } catch {
    return {};
  }
}

/** このシナリオ × Pアイドルで選んでいたプロデュースを覚える */
export function rememberScenarioSet(
  scenario: ScenarioKey,
  pIdol: string | null | undefined,
  setId: string,
): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [keyOf(scenario, pIdol)]: setId }));
  } catch {
    // 容量超過などは無視
  }
}

/** このシナリオ × Pアイドルで最後に選んでいたプロデュース（探索を押した後や、覚えていなければ undefined） */
export function recallScenarioSet(
  scenario: ScenarioKey,
  pIdol: string | null | undefined,
): string | undefined {
  return read()[keyOf(scenario, pIdol)];
}

/** 覚えていたプロデュースをすべて捨てる（探索を押したとき） */
export function forgetScenarioSets(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 無視
  }
}
