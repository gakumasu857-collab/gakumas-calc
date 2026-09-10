import { useCallback, useState } from "react";
import { SCENARIO_KEYS, type ScenarioKey } from "@/data/scenarios";
import { notifyStoreChange } from "./storeSync";

/**
 * 育成シナリオの選択ストア（ホームで切り替え）。
 * 踏み方・計算・理想編成のステ上限と評価式がこれに従う。
 */
const STORAGE_KEY = "gakumas:scenario:v1";

export function useScenario() {
  // SPAなのでlocalStorageを初期値で同期読み込みする（読み込みちらつき防止）
  // chosen=false は「まだ一度も選んでいない」（計算はhifで動くがUIは未選択表示）
  const [state, setState] = useState<{ scenario: ScenarioKey; chosen: boolean }>(
    () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw && SCENARIO_KEYS.includes(raw as ScenarioKey)) {
          return { scenario: raw as ScenarioKey, chosen: true };
        }
      } catch {
        // 破損データは無視
      }
      return { scenario: "hif", chosen: false };
    },
  );

  const setScenario = useCallback((key: ScenarioKey) => {
    setState({ scenario: key, chosen: true });
    try {
      localStorage.setItem(STORAGE_KEY, key);
      notifyStoreChange();
    } catch {
      // 容量超過などは無視
    }
  }, []);

  return { scenario: state.scenario, chosen: state.chosen, setScenario, loaded: true };
}
