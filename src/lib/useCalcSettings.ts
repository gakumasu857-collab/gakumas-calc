import { useCallback, useEffect, useState } from "react";
import { useSaveNotifier } from "./storeSync";
import { IDLE_NAMES } from "@/data/constants";

/**
 * 計算ページの入力状態とセーブデータのストア。
 *
 * - 現在の入力は常に自動保存（gakumas:calcSettings:v1）
 * - セーブデータは名前付きスロットとして別枠で保存（gakumas:calcSaves:v1）
 *   名前を空欄で保存すると「アイドル名＋Pアイドル＋日付」で自動命名する。
 */
const CURRENT_KEY = "gakumas:calcSettings:v1";
const SAVES_KEY = "gakumas:calcSaves:v1";

export type TypeKey = "vocal" | "dance" | "visual";
export const TYPE_LABELS: Record<TypeKey, string> = {
  vocal: "Vocal",
  dance: "Dance",
  visual: "Visual",
};
export const TYPE_KEYS: TypeKey[] = ["vocal", "dance", "visual"];

export type CalcSettings = {
  /** アイドル名（IDLE_NAMESのキー） */
  idol: string;
  /** Pアイドル名（例: Love&Joy） */
  pIdol: string;
  /** メモリー（例: 45点（メインパラボ）） */
  memory: string;
  /** 育成セット（発動回数ページのセットID） */
  trainingSetId: string;
  /** HIFワッペン発動回数 */
  wappenCount: number;
  /** 合計スター性 */
  totalStar: number;
  /** 理想編成の条件: タイプごとのSPレッスン率アップ持ちサポカの最低枚数 */
  spMin: Record<TypeKey, number>;
  /**
   * 全自動最適化の条件: 前イベの取得枚数（カード1枚=1）・後イベの発動回数の上限
   * （enabled=false なら制限なし）
   */
  eventBudget: { enabled: boolean; pre: number; post: number };
  /**
   * 全自動最適化の条件: 踏み方のタイプ割合を固定する（例 Vo1 Da3 Vi2）。
   * enabled=false なら踏み方のタイプ配分も探索する。
   */
  typeRatio: { enabled: boolean } & Record<TypeKey, number>;
  /**
   * 試験補助を強めにする（理想編成の選定用）。
   * ONで「アイテム評価が高い」「ドリンク獲得」「SP率持ち」のサポカを優先して
   * 編成する（EXAM_ASSIST_WEIGHTS）。表示されるステ・評価値は常に素の値。
   */
  examAssist: boolean;
  /**
   * 理論評価値・理想編成の条件: タイプごとの最低ステータス（0=条件なし）。
   * 全部満たせないときはアイドルの審査基準が高いタイプから優先して満たす。
   */
  minStats: Record<TypeKey, number>;
  /**
   * タイプごとの最高ステータス（デフォルト3200=制限なし）。
   * ソフト上限: これを超えるぶんは探索で「積みに行かない」が、
   * 他タイプの溢れで自然に超えた分は評価値へ全額入る（頭打ちはシナリオ上限のみ）。
   */
  maxStats: Record<TypeKey, number>;
  /** ステージ（試験中）に持ち込むPアイテムのサポカを編成しない（固定は貫通） */
  noStageItems: boolean;
  /**
   * 基礎SPレッスン率（%）。SP率 = 基礎 + サポカ + Pアイドル。
   * 元値はコミュニティ検証で約10%とされる（確定値ではないので変更可）。
   */
  baseSpRate: number;
  /** ラウンド1/2の点数（ボーナス前・手動入力） */
  round1: number;
  round2: number;
  /** 画像出力に載せるユーザー名（任意） */
  userName: string;
  /** おすすめ編成の選択（例: Vo / 1 / Da / 5 / Vi / 0） */
  formation: string;
  /** 最大ステ編成選択 */
  maxStat: boolean;
};

export const DEFAULT_SETTINGS: CalcSettings = {
  idol: "花海咲季",
  pIdol: "",
  memory: "",
  trainingSetId: "",
  wappenCount: 20,
  totalStar: 0,
  spMin: { vocal: 0, dance: 0, visual: 0 },
  eventBudget: { enabled: false, pre: 6, post: 6 },
  typeRatio: { enabled: false, vocal: 1, dance: 1, visual: 1 },
  examAssist: false,
  minStats: { vocal: 0, dance: 0, visual: 0 },
  maxStats: { vocal: 3200, dance: 3200, visual: 3200 },
  noStageItems: false,
  baseSpRate: 10,
  // 本戦ラウンドの点数はデフォルトで上限（R1=140万 / R2=240万）
  round1: 1_400_000,
  round2: 2_400_000,
  formation: "",
  maxStat: false,
  userName: "",
};

export type CalcSave = {
  id: string;
  name: string;
  savedAt: string; // YYYY/MM/DD
  settings: CalcSettings;
};

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // 破損データは無視
  }
  return fallback;
}

/** 現在の入力をlocalStorageから同期読み込み（旧形式の補完・移行込み） */
function loadCurrentSettings(): CalcSettings {
  // 古い保存に無いキーは DEFAULT_SETTINGS で補完する
  const stored = load<Partial<CalcSettings>>(CURRENT_KEY, {});
  // 旧形式（IDLE_NAMESの英語キー）は日本語名（空白なし）へ移行
  const idolRaw = stored.idol ?? DEFAULT_SETTINGS.idol;
  const idol =
    idolRaw in IDLE_NAMES
      ? (IDLE_NAMES as Record<string, string>)[idolRaw].replace(/\s/g, "")
      : idolRaw;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    idol,
    spMin: { ...DEFAULT_SETTINGS.spMin, ...(stored.spMin ?? {}) },
    eventBudget: {
      ...DEFAULT_SETTINGS.eventBudget,
      ...(stored.eventBudget ?? {}),
    },
    typeRatio: {
      ...DEFAULT_SETTINGS.typeRatio,
      ...(stored.typeRatio ?? {}),
    },
    minStats: { ...DEFAULT_SETTINGS.minStats, ...(stored.minStats ?? {}) },
    maxStats: { ...DEFAULT_SETTINGS.maxStats, ...(stored.maxStats ?? {}) },
  };
}

export function useCalcSettings() {
  // SPAなのでlocalStorageを初期値で同期読み込みする（読み込みちらつき防止）
  const [settings, setSettings] = useState<CalcSettings>(loadCurrentSettings);
  const [saves, setSaves] = useState<CalcSave[]>(() =>
    load<CalcSave[]>(SAVES_KEY, []),
  );

  const notifySave = useSaveNotifier();
  useEffect(() => {
    try {
      localStorage.setItem(CURRENT_KEY, JSON.stringify(settings));
      localStorage.setItem(SAVES_KEY, JSON.stringify(saves));
      notifySave();
    } catch {
      // 容量超過などは無視
    }
  }, [settings, saves, notifySave]);

  const update = useCallback((patch: Partial<CalcSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  /** 空欄なら「アイドル名＋Pアイドル＋日付」で自動命名 */
  const buildSaveName = useCallback(
    (name: string): string => {
      if (name.trim()) return name.trim();
      const idolLabel =
        (IDLE_NAMES as Record<string, string>)[settings.idol] ?? settings.idol;
      const date = new Date().toLocaleDateString("ja-JP");
      return [idolLabel, settings.pIdol, date].filter(Boolean).join(" ");
    },
    [settings],
  );

  /** 現在の状態を新しいセーブデータとして保存 */
  const saveNew = useCallback(
    (name: string) => {
      const save: CalcSave = {
        id: `save-${crypto.randomUUID()}`,
        name: buildSaveName(name),
        savedAt: new Date().toLocaleDateString("ja-JP"),
        settings,
      };
      setSaves((prev) => [...prev, save]);
    },
    [settings, buildSaveName],
  );

  /** 既存スロットへ上書き保存 */
  const overwrite = useCallback(
    (saveId: string) => {
      setSaves((prev) =>
        prev.map((s) =>
          s.id === saveId
            ? {
                ...s,
                savedAt: new Date().toLocaleDateString("ja-JP"),
                settings,
              }
            : s,
        ),
      );
    },
    [settings],
  );

  /** セーブデータを現在の入力へ読み込む */
  const loadSave = useCallback((save: CalcSave) => {
    setSettings({
      ...DEFAULT_SETTINGS,
      ...save.settings,
      spMin: { ...DEFAULT_SETTINGS.spMin, ...(save.settings.spMin ?? {}) },
      eventBudget: {
        ...DEFAULT_SETTINGS.eventBudget,
        ...(save.settings.eventBudget ?? {}),
      },
      typeRatio: {
        ...DEFAULT_SETTINGS.typeRatio,
        ...(save.settings.typeRatio ?? {}),
      },
      minStats: {
        ...DEFAULT_SETTINGS.minStats,
        ...(save.settings.minStats ?? {}),
      },
    });
  }, []);

  const deleteSave = useCallback((saveId: string) => {
    setSaves((prev) => prev.filter((s) => s.id !== saveId));
  }, []);

  return {
    settings,
    saves,
    update,
    saveNew,
    overwrite,
    loadSave,
    deleteSave,
    loaded: true,
  };
}
