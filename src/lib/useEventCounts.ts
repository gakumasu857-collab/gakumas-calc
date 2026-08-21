import { useCallback, useEffect, useState } from "react";
import type { EventCountOverride } from "./sheetScore";
import { useSaveNotifier } from "./storeSync";

/**
 * サポカごとの前イベ・後イベ発動回数の手動指定ストア。
 * 未指定のカードは自動計算（前イベ=min(参照回数, 最大発動回数)、後イベ=1回）。
 *
 * 保存キーを引数で切り替えられる:
 * - 既定（gakumas:eventCounts:v1）: サポカ設定ページ・点数表で共有
 * - 計算ページは専用キーを渡して独立させる（サポカ設定と混ざらないように）
 */
export const CALC_EVENT_COUNTS_KEY = "gakumas:calcEventCounts:v1";
const DEFAULT_STORAGE_KEY = "gakumas:eventCounts:v1";

type OverrideMap = Record<string, EventCountOverride>;

export function useEventCounts(storageKey: string = DEFAULT_STORAGE_KEY) {
  // SPAなのでlocalStorageを初期値で同期読み込みする（読み込みちらつき防止）
  const [map, setMap] = useState<OverrideMap>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw) as OverrideMap;
    } catch {
      // 破損データは無視
    }
    return {};
  });
  const notifySave = useSaveNotifier();

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(map));
      notifySave();
    } catch {
      // 容量超過などは無視
    }
  }, [map, notifySave, storageKey]);

  /** 空のオーバーライドはマップから消す */
  const isEmpty = (o: EventCountOverride) =>
    o.pre === undefined &&
    o.post === undefined &&
    o.acquire === undefined &&
    o.enhance === undefined &&
    o.preEnhanceM === undefined &&
    o.preDelM === undefined &&
    o.statEvent === undefined;

  /** 1項目の更新（null でデフォルトに戻す）共通処理 */
  const patch = useCallback(
    <K extends keyof EventCountOverride>(
      id: string,
      key: K,
      value: EventCountOverride[K] | null,
    ) => {
      setMap((prev) => {
        const current = { ...(prev[id] ?? {}) };
        if (value === null) delete current[key];
        else current[key] = value;
        const next = { ...prev };
        if (isEmpty(current)) delete next[id];
        else next[id] = current;
        return next;
      });
    },
    [],
  );

  /** 回数の設定（前イベ・後イベ・ステイベ）。null で自動に戻す */
  const set = useCallback(
    (id: string, key: "pre" | "post" | "statEvent", value: number | null) => {
      patch(id, key, value === null ? null : Math.max(0, value));
    },
    [patch],
  );

  /** 後イベ強化の割り振り設定。null でデフォルト規則に戻す */
  const setTarget = useCallback(
    (id: string, value: "A" | "M" | null) => {
      patch(id, "enhance", value);
    },
    [patch],
  );

  /** 前イベの強化/削除のM側枚数（残りはA）。null でデフォルトに戻す */
  const setAssign = useCallback(
    (id: string, key: "preEnhanceM" | "preDelM", value: number | null) => {
      patch(id, key, value === null ? null : Math.max(0, value));
    },
    [patch],
  );

  /** Pアイテムを取得したか（null でデフォルト=取得する に戻す） */
  const setAcquire = useCallback(
    (id: string, value: boolean | null) => {
      patch(id, "acquire", value);
    },
    [patch],
  );

  const get = useCallback(
    (id: string): EventCountOverride | undefined => map[id],
    [map],
  );

  /** まるごと置き換える（セーブデータの読み込み用） */
  const replaceAll = useCallback((snapshot: OverrideMap) => {
    setMap({ ...snapshot });
  }, []);

  return {
    get,
    set,
    setTarget,
    setAssign,
    setAcquire,
    replaceAll,
    loaded: true,
    map,
  };
}
