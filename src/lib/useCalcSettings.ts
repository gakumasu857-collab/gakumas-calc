import { useCallback, useEffect, useState } from "react";
import { useSaveNotifier } from "./storeSync";
import { IDLE_NAMES, type AbilityName } from "@/data/constants";
import type { ScenarioKey } from "@/data/scenarios";
import type { SelectedSlot } from "./formation";
import type { Memory, SlotMemory } from "./memoryTypes";
import { AFFECTION_DEFAULT, normalizeAffection } from "@/data/affection";
import { hifBonusMax, normalizeHifBonus, type HifBonusLevels } from "@/data/hifBonus";
import { NIA_CHALLENGE_MAX, normalizeNiaChallenge, type NiaChallenge } from "@/data/niaChallenge";
import type { ScheduleChoices } from "@/data/scheduleCalendar";
import type { EventCountOverride } from "./sheetScore";
import type { PIdolOwnership } from "./useOwnedPIdols";
import type { HatsuState } from "./useHatsuSchedule";
import type { NiaState } from "./useNiaSchedule";
import type { ScheduleState } from "./useSchedule";

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
  /** レッスンを多く踏む上位2タイプへのSPレッスン率アップ持ち最低枚数（1位/2位） */
  spTop: { first: number; second: number };
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
  /** ステージ（試験中）に持ち込むPアイテム・スキルのサポカを編成しない（固定は貫通） */
  noStageItems: boolean;
  /**
   * 表記外推定SP率（%）。シナリオごと。実際のSP率 = これ + 画面の「SPレッスン率上昇」。
   * H.I.Fは約10%、N.I.Aと初は約15%（コミュニティ検証。確定値ではないので変更可）。
   */
  baseSpRate: Record<ScenarioKey, number>;
  /** 探索で、育成後のステータスをこの順（高い→低い）にする（null＝指定なし） */
  statOrder: TypeKey[] | null;
/**
   * 親愛度Lv（20以下＝20、21〜37）。スター性ボーナス・初期Pポイント（STEP3）・最大体力に効く。
   * シナリオ共通（Pポイントは全シナリオに関わる）。既定は37（一番星）。
   */
  affection: number;
  /** H.I.Fボーナスのレベル（H.I.F限定。Vo/Da/Viは固定値とパラボが別レベル。既定は全部最大＝固定+100・パラボ+10%・SP率+5%・上限3200） */
  hifBonus: HifBonusLevels;
  /** N.I.AのチャレンジPアイテム3枠の獲得ボーナス%（N.I.A限定。既定は各枠の最大＝15/20/20） */
  niaChallenge: NiaChallenge;
  /** ラウンド1/2の点数（ボーナス前・手動入力） */
  round1: number;
  round2: number;
  /** 画像出力に載せるユーザー名（任意） */
  userName: string;
};

export const DEFAULT_SETTINGS: CalcSettings = {
  // アイドル・Pアイドルは未選択で始める（計算ページの「設定欄」で選んでもらう）
  idol: "",
  pIdol: "",
  spTop: { first: 0, second: 0 },
  eventBudget: { enabled: false, pre: 6, post: 6 },
  typeRatio: { enabled: false, vocal: 1, dance: 1, visual: 1 },
  examAssist: false,
  minStats: { vocal: 0, dance: 0, visual: 0 },
  maxStats: { vocal: 3200, dance: 3200, visual: 3200 },
  noStageItems: false,
  baseSpRate: { hif: 10, niaMaster: 15, hatsuLegend: 15 },
  statOrder: null,
  affection: AFFECTION_DEFAULT,
  hifBonus: hifBonusMax(),
  niaChallenge: [...NIA_CHALLENGE_MAX] as NiaChallenge,
  // 本戦ラウンドの点数はデフォルトで上限（R1=140万 / R2=240万）
  round1: 1_400_000,
  round2: 2_400_000,
  userName: "",
};

/**
 * セーブデータが持つ「その育成の全状態」。読み込みはこれが唯一の正（linkedのセット類は控え）。
 * 旧セーブ（v1）には無いので、その場合は settings と ownedLevels だけ復元する。
 */
export type CalcSaveSnapshot = {
  scenario: ScenarioKey;
  /** シナリオ別の踏み方（3つとも保存して、どのシナリオに戻しても再現できるように） */
  schedule: ScheduleState;
  nia: NiaState;
  hatsu: HatsuState;
  /** メモリースロット4枠の中身（保存していないメモリーもそのまま。空枠は null） */
  memorySlots?: (SlotMemory | null)[];
  /** 旧形式: スロットのID＋実体（読み込み時に memorySlots へ展開） */
  memoryIds?: string[];
  memories?: Memory[];
  /** 参照していた発動回数セットの実効回数と名前・プラン */
  abilityCounts: Partial<Record<AbilityName, number>>;
  abilitySetName: string;
  abilitySetPlan: string;
  /** 保存時のスケジュールの選択（scenario のもの。旧データには無い＝回数から推測） */
  scheduleChoices?: ScheduleChoices;
  /** 選択サポカ6枠 */
  slots: (SelectedSlot | null)[];
  /** 計算ページの前イベ・後イベ設定 */
  eventCounts: Record<string, EventCountOverride>;
  /** 所持状況（サポカ凸・Pアイドルの特訓/開花） */
  ownedLevels: Record<string, number>;
  /** 保存時のサポカDB枚数（無いカードを未所持/新カードに振り分ける。旧データには無い） */
  ownedCardCount?: number;
  /** 保存時のPアイドル数（無いPアイドルを未所持／新カード（特訓6・開花4）に振り分ける。旧データには無い） */
  pIdolCount?: number;
  pIdols: Record<string, PIdolOwnership>;
};

export type CalcSave = {
  id: string;
  name: string;
  savedAt: string; // YYYY/MM/DD
  settings: CalcSettings;
  /**
   * 保存時点のサポカ所持状況（カードID→凸レベル）。
   * v1形式の名残。v2では snapshot.ownedLevels を使う（読み込みは両対応）。
   */
  ownedLevels?: Record<string, number>;
  /** v2: その育成の全状態（これがあれば完全に再現できる） */
  snapshot?: CalcSaveSnapshot;
  /** 保存時の評価値・合計ステ（一覧表示用） */
  rating?: number;
  cappedSum?: number;
  /** 一緒に作った「セーブデータ用」の控え（メモリーセット・発動回数セット・所持状況） */
  linked?: {
    memorySetId?: string;
    abilitySetId?: string;
    ownedSaveId?: string;
  };
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

/**
 * 保存値を現行の形に整える（欠けているキーの補完＋旧形式の移行）。
 * 自動保存の読み込みとセーブデータの読み込みの両方で使う
 * （どちらか片方だけ移行すると、古いセーブでアイドル名が英語キーのままになる）。
 */
/** 表記外推定SP率: 旧形式（数値1つ）は H.I.F の値として引き継ぎ、N.I.A・初は既定（15%） */
function normalizeBaseSpRate(raw: unknown): Record<ScenarioKey, number> {
  const def = DEFAULT_SETTINGS.baseSpRate;
  if (typeof raw === "number" && Number.isFinite(raw)) return { ...def, hif: Math.max(0, raw) };
  const obj = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<ScenarioKey, unknown>>;
  const out = { ...def };
  for (const k of Object.keys(def) as ScenarioKey[]) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.max(0, v);
  }
  return out;
}

/** ステの高さの順: 3タイプの並び替え以外は「指定なし」 */
function normalizeStatOrder(raw: unknown): TypeKey[] | null {
  if (!Array.isArray(raw) || raw.length !== 3) return null;
  const ok = raw.every((t) => TYPE_KEYS.includes(t as TypeKey)) && new Set(raw).size === 3;
  return ok ? (raw as TypeKey[]) : null;
}

function normalizeSettings(stored: Partial<CalcSettings>): CalcSettings {
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
    spTop: { ...DEFAULT_SETTINGS.spTop, ...(stored.spTop ?? {}) },
    eventBudget: normalizeEventBudget(stored.eventBudget),
    typeRatio: {
      ...DEFAULT_SETTINGS.typeRatio,
      ...(stored.typeRatio ?? {}),
    },
    minStats: { ...DEFAULT_SETTINGS.minStats, ...(stored.minStats ?? {}) },
    maxStats: { ...DEFAULT_SETTINGS.maxStats, ...(stored.maxStats ?? {}) },
    affection: normalizeAffection(stored.affection),
    hifBonus: normalizeHifBonus(stored.hifBonus),
    niaChallenge: normalizeNiaChallenge(stored.niaChallenge),
    baseSpRate: normalizeBaseSpRate(stored.baseSpRate),
    statOrder: normalizeStatOrder(stored.statOrder),
  };
}

/** 取得回数の制限: 枚数は 0〜6 の整数に丸める（壊れた値で探索が止まらないように） */
function normalizeEventBudget(raw: unknown): CalcSettings["eventBudget"] {
  const d = DEFAULT_SETTINGS.eventBudget;
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<CalcSettings["eventBudget"]>;
  const cnt = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(6, Math.floor(v))) : fallback;
  return {
    enabled: typeof o.enabled === "boolean" ? o.enabled : d.enabled,
    pre: cnt(o.pre, d.pre),
    post: cnt(o.post, d.post),
  };
}

/** 現在の入力をlocalStorageから同期読み込み（旧形式の補完・移行込み） */
function loadCurrentSettings(): CalcSettings {
  return normalizeSettings(load<Partial<CalcSettings>>(CURRENT_KEY, {}));
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

  /** セーブに同梱する全状態（スナップショット・評価値・控えセットのID） */
  type SaveExtras = Pick<CalcSave, "snapshot" | "rating" | "cappedSum" | "linked">;

  /** 新しいセーブデータのIDだけ先に払い出す（控えセットの紐づけに使う） */
  const newSaveId = useCallback(() => `save-${crypto.randomUUID()}`, []);

  /** 現在の状態を新しいセーブデータとして保存（全状態のスナップショット込み） */
  const saveNew = useCallback(
    (name: string, extras: SaveExtras, id?: string) => {
      const save: CalcSave = {
        id: id ?? `save-${crypto.randomUUID()}`,
        name: buildSaveName(name),
        savedAt: new Date().toLocaleDateString("ja-JP"),
        settings,
        ...extras,
      };
      setSaves((prev) => [...prev, save]);
    },
    [settings, buildSaveName],
  );

  /** 既存スロットへ上書き保存（全状態のスナップショット込み） */
  const overwrite = useCallback(
    (saveId: string, extras: SaveExtras) => {
      setSaves((prev) =>
        prev.map((s) =>
          s.id === saveId
            ? {
                ...s,
                savedAt: new Date().toLocaleDateString("ja-JP"),
                settings,
                ...extras,
                linked: { ...s.linked, ...extras.linked },
              }
            : s,
        ),
      );
    },
    [settings],
  );

  /** セーブ名の変更 */
  const renameSave = useCallback((saveId: string, name: string) => {
    setSaves((prev) =>
      prev.map((s) => (s.id === saveId ? { ...s, name: name.trim() || s.name } : s)),
    );
  }, []);

  /** セーブデータを現在の入力へ読み込む（旧形式の移行も自動保存と同じ規則で行う） */
  const loadSave = useCallback((save: CalcSave) => {
    setSettings(normalizeSettings(save.settings));
  }, []);

  const deleteSave = useCallback((saveId: string) => {
    setSaves((prev) => prev.filter((s) => s.id !== saveId));
  }, []);

  return {
    settings,
    saves,
    update,
    newSaveId,
    saveNew,
    overwrite,
    renameSave,
    loadSave,
    deleteSave,
    loaded: true,
  };
}
