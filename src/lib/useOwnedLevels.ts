import { useCallback, useEffect, useState } from "react";
import { SUPPORT_CARD_DB } from "@/data/supportCardsDb";
import { migrateCardIdKeys } from "./idMigration";
import { useSaveNotifier } from "./storeSync";
import { autoSaveToActiveSlot, ensureEditableSlot } from "./useOwnedSaves";

/**
 * サポカの所持レベルを localStorage に保存する簡易ストア。
 *
 * レベルの意味:
 *   -1 = 未所持（画像はモノクロ）
 *    0 = 所持・0凸（ひし形は全消灯・画像はカラー）
 *  1〜4 = 所持・凸数（ひし形が左から点灯）
 *
 * マップに存在しないカード（＝保存後に実装された新カード）は 4（完凸）扱い。
 * 未所持は -1 を明示的に保存する（キー削除で表すと新カードと区別できないため）。
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
      // さらに旧キー card:<名前> を今のキー card:<スプシのid> へ（2026-10-08）
      return migrateCardIdKeys(migrated);
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
      // 使っている所持状況（既定以外）へも随時保存（「上書き保存」は要らない）
      autoSaveToActiveSlot({ levels });
      notifySave();
    } catch {
      // 容量超過などは無視
    }
  }, [levels, notifySave]);

  const getLevel = useCallback(
    (id: string): number => (id in levels ? levels[id] : 4),
    [levels],
  );

  // 変更系は、既定（全サポカ完凸）を使っているなら先に「自分の所持状況」を作って保存先にする
  const setLevel = useCallback((id: string, level: number) => {
    ensureEditableSlot();
    setLevels((prev) => ({ ...prev, [id]: level }));
  }, []);

  /** 複数カードをまとめて同じレベルに設定（「表示中を全部レベル4」用） */
  const setManyLevels = useCallback((ids: string[], level: number) => {
    ensureEditableSlot();
    setLevels((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = level;
      return next;
    });
  }, []);

  /** カードごとに異なるレベルを一括反映（CSVインポート用）。負数は未所持(-1)として保存 */
  const applyLevels = useCallback((entries: Record<string, number>) => {
    ensureEditableSlot();
    setLevels((prev) => {
      const next = { ...prev };
      for (const [id, level] of Object.entries(entries)) {
        next[id] = level < 0 ? -1 : Math.min(4, level);
      }
      return next;
    });
  }, []);

  /**
   * 所持状況をまるごと置き換える（セーブデータの読み込み用）。
   * スナップショットに無いカードは明示的に埋める:
   *   保存時に存在していたカード（実装順 index < knownCount）→ 未所持(-1)
   *   保存後に実装されたカード → 完凸(4)
   * knownCount が無い旧スナップショット（キー無し＝未所持の時代）は全て未所持扱い。
   */
  const replaceAll = useCallback(
    (snapshot: LevelMap, knownCount?: number) => {
      const next: LevelMap = migrateCardIdKeys(snapshot); // 旧キーのセーブデータも読める
      SUPPORT_CARD_DB.forEach((c, i) => {
        if (c.id in next) return;
        next[c.id] = knownCount !== undefined && i >= knownCount ? 4 : -1;
      });
      setLevels(next);
    },
    [],
  );

  return {
    levels,
    getLevel,
    setLevel,
    setManyLevels,
    applyLevels,
    replaceAll,
    loaded: true,
  };
}
