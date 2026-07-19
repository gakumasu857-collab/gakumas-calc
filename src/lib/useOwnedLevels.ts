import { useCallback, useEffect, useState } from "react";
import { SUPPORT_CARD_DB } from "@/data/supportCardsDb";
import { useSaveNotifier } from "./storeSync";

/**
 * サポカの所持レベルを localStorage に保存する簡易ストア。
 *
 * レベルの意味:
 *   -1 = 未所持（画像はモノクロ）
 *    0 = 所持・0凸（ひし形は全消灯・画像はカラー）
 *  1〜4 = 所持・凸数（ひし形が左から点灯）
 *
 * マップに存在しないカードは -1（未所持）扱い。
 */
const STORAGE_KEY = "gakumas:ownedLevels:v1";

export type LevelMap = Record<string, number>;

/** localStorageから同期読み込み（旧ID形式の移行込み。SPAなので初期値で直接読む） */
function loadLevels(): LevelMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LevelMap;
      // 旧ID形式 "ssr:<名前>" をCSVカタログの "card:<名前>" に移行する
      const migrated: LevelMap = {};
      for (const [key, level] of Object.entries(parsed)) {
        if (!key.startsWith("ssr:")) migrated[key] = level;
      }
      for (const [key, level] of Object.entries(parsed)) {
        if (key.startsWith("ssr:")) {
          const newKey = `card:${key.slice(4)}`;
          if (!(newKey in migrated)) migrated[newKey] = level;
        }
      }
      return migrated;
    }
  } catch {
    // 破損データなどは無視
  }
  // 初回アクセス（保存なし）: 全サポカを完凸(4)で初期化する
  const seeded: LevelMap = {};
  for (const c of SUPPORT_CARD_DB) seeded[c.id] = 4;
  return seeded;
}

export function useOwnedLevels() {
  const [levels, setLevels] = useState<LevelMap>(loadLevels);

  // 変更のたびに保存
  const notifySave = useSaveNotifier();
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(levels));
      notifySave();
    } catch {
      // 容量超過などは無視
    }
  }, [levels, notifySave]);

  const getLevel = useCallback(
    (id: string): number => (id in levels ? levels[id] : -1),
    [levels],
  );

  const setLevel = useCallback((id: string, level: number) => {
    setLevels((prev) => ({ ...prev, [id]: level }));
  }, []);

  /** 複数カードをまとめて同じレベルに設定（「表示中を全部レベル4」用） */
  const setManyLevels = useCallback((ids: string[], level: number) => {
    setLevels((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = level;
      return next;
    });
  }, []);

  /** カードごとに異なるレベルを一括反映（CSVインポート用）。-1未満は未所持=エントリ削除 */
  const applyLevels = useCallback((entries: Record<string, number>) => {
    setLevels((prev) => {
      const next = { ...prev };
      for (const [id, level] of Object.entries(entries)) {
        if (level < 0) delete next[id];
        else next[id] = Math.min(4, level);
      }
      return next;
    });
  }, []);

  return { getLevel, setLevel, setManyLevels, applyLevels, loaded: true };
}
