import { useCallback, useState } from "react";
import { SCENARIO_KEYS, type ScenarioKey } from "@/data/scenarios";
import { notifyStoreChange } from "./storeSync";

/**
 * 育成シナリオの選択ストア（ホームで切り替え）。
 * レッスンページ・計算・StatusBar・理想編成のステ上限と評価式がこれに従う。
 */
const STORAGE_KEY = "gakumas:scenario:v1";

export function useScenario() {
  // SPAなのでlocalStorageを初期値で同期読み込みする（読み込みちらつき防止）
  const [scenario, setScenarioState] = useState<ScenarioKey>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw && SCENARIO_KEYS.includes(raw as ScenarioKey)) {
        return raw as ScenarioKey;
      }
    } catch {
      // 破損データは無視
    }
    return "hif";
  });

  const setScenario = useCallback((key: ScenarioKey) => {
    setScenarioState(key);
    try {
      localStorage.setItem(STORAGE_KEY, key);
      notifyStoreChange();
    } catch {
      // 容量超過などは無視
    }
  }, []);

  return { scenario, setScenario, loaded: true };
}
