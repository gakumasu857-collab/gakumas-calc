import type { ScenarioKey } from "@/data/scenarios";

/**
 * シナリオを切り替えたときに外したプロデュース（発動回数セット）を覚えておく（計算ページ）。
 * 探索を押す前に元のシナリオへ戻したら、そのとき選んでいたプロデュースに戻す。
 * 上書き保存していない「この育成だけ」の変更はセットごとに残っているので、選び直せば一緒に戻る。
 * 探索を押したら捨てる。画面の移動や再読み込みをはさんでも続くように localStorage に置く。
 */
const KEY = "gakumas:calc:scenarioSetMemory:v1";

type Memory = Partial<Record<ScenarioKey, string>>;

function read(): Memory {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Memory) : {};
  } catch {
    return {};
  }
}

/** このシナリオで選んでいたプロデュースを覚える */
export function rememberScenarioSet(scenario: ScenarioKey, setId: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [scenario]: setId }));
  } catch {
    // 容量超過などは無視
  }
}

/** このシナリオで最後に選んでいたプロデュース（探索を押した後や、覚えていなければ undefined） */
export function recallScenarioSet(scenario: ScenarioKey): string | undefined {
  return read()[scenario];
}

/** 覚えていたプロデュースをすべて捨てる（探索を押したとき） */
export function forgetScenarioSets(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 無視
  }
}
