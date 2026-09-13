import { useCallback, useEffect, useState } from "react";
import { SUPPORT_CARD_DB } from "@/data/supportCardsDb";
import { P_IDOL_MASTERS } from "./pIdol";
import { notifyStoreChange, subscribeStoreChange } from "./storeSync";
import type { PIdolOwnership } from "./useOwnedPIdols";

/**
 * 所持状況（サポカの凸＋Pアイドルの特訓/開花）の名前つきデータ。
 *
 * 考え方: 「使っている所持状況」が常に1つある。
 * - 既定は「全サポカ完凸」（読み込み専用。保存せず毎回DBから組み立てるので、新カードも自動で完凸）
 * - 既定を使っているときにカードの凸などを変えると、今の内容から「自分の所持状況」が自動で作られて
 *   使用中になり、以後の変更はそこへ随時保存される（ensureEditableSlot。「保存」ボタンは要らない）
 * - 所持状況ページで切り替えると、その内容を読み込んで以後の保存先になる
 * - 計算ページのセーブデータからも作られる（saveId 付き＝「セーブデータ用」）。セーブを読み込むとそれを使う
 *
 * localStorage は複数のフック実体（所持状況ページ・計算ページのセーブ欄・所持ストアの自動保存）から
 * 触られるので、更新は常に「読み直してから書く」（load() を起点）し、書いたら保存イベントで他へ知らせる。
 */
const STORAGE_KEY = "gakumas:ownedSaves:v1";
/** 使っている所持状況のID。無い・消えたIDは既定（全サポカ完凸）扱い */
const ACTIVE_KEY = "gakumas:ownedSaves:active:v1";
/** 所持ストアの保存先（各ストアは変更のたびにここへ書くので、ここを読めば今の内容） */
const LEVELS_KEY = "gakumas:ownedLevels:v1";
const PIDOLS_KEY = "gakumas:pIdols:v1";

export const BUILTIN_ID = "builtin-all4";
/** 既定から自動で作るときの名前 */
export const DEFAULT_OWN_NAME = "自分の所持状況";

export type OwnedSave = {
  id: string;
  name: string;
  savedAt: string;
  /** カードID→凸レベル（-1=未所持） */
  levels: Record<string, number>;
  /** Pアイドルkey→特訓/開花（旧データには無い） */
  pIdols?: Record<string, PIdolOwnership>;
  /** 計算ページのセーブデータに紐づくものはそのセーブID */
  saveId?: string;
  /**
   * 保存時のサポカDBの枚数（実装順）。読み込み時、levels に無いカードを
   * 「保存時に存在した＝未所持」「保存後に実装＝完凸」に振り分けるのに使う。
   * 無い旧データは全て未所持扱い。
   */
  cardCount?: number;
};

/**
 * 既定「全サポカ完凸」。理論値を見たいときの固定データで、読み込みだけできる（変更の保存先にはならない）。
 * Pアイドルは初回既定と同じ特訓6・開花4。保存はせず毎回DBから組み立てるので、新カードも自動的に完凸。
 */
export const BUILTIN_ALL4: OwnedSave = {
  id: BUILTIN_ID,
  name: "全サポカ完凸（既定）",
  savedAt: "常に最新",
  levels: Object.fromEntries(SUPPORT_CARD_DB.map((c) => [c.id, 4])),
  pIdols: Object.fromEntries(
    P_IDOL_MASTERS.map((m) => [m.key, { kunren: 6, kaika: 4 }]),
  ),
  cardCount: SUPPORT_CARD_DB.length,
};

export const isBuiltinId = (id: string | null | undefined): boolean =>
  !id || id === BUILTIN_ID;

function load(): OwnedSave[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as OwnedSave[];
  } catch {
    // 破損データは無視
  }
  return [];
}

function store(saves: OwnedSave[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
  } catch {
    // 容量超過などは無視
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // 破損データは無視
  }
  return fallback;
}

/** 所持ストアの今の中身（サポカ凸） */
function currentLevels(): Record<string, number> {
  return readJson(LEVELS_KEY, BUILTIN_ALL4.levels);
}
/** 所持ストアの今の中身（Pアイドル） */
function currentPIdols(): Record<string, PIdolOwnership> {
  return readJson(PIDOLS_KEY, BUILTIN_ALL4.pIdols ?? {});
}

const today = () => new Date().toLocaleDateString("ja-JP");

/** 使っている所持状況のID（無い・消えたものは既定＝全サポカ完凸） */
export function readActiveSlotId(): string {
  try {
    const id = localStorage.getItem(ACTIVE_KEY);
    if (id && (id === BUILTIN_ID || load().some((s) => s.id === id))) return id;
  } catch {
    // 読めない環境は既定
  }
  return BUILTIN_ID;
}

export function writeActiveSlotId(id: string | null): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id ?? BUILTIN_ID);
  } catch {
    // 保存できない環境では既定として動く
  }
}

/** 同じ名前があれば番号を足す */
function uniqueName(base: string, list: OwnedSave[]): string {
  const names = new Set(list.map((s) => s.name));
  if (!names.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}${i}`;
    if (!names.has(candidate)) return candidate;
  }
}

/** 新しい所持状況を localStorage に追加して返す */
function insert(
  entry: Omit<OwnedSave, "id" | "savedAt" | "cardCount">,
  list: OwnedSave[] = load(),
): OwnedSave {
  const rec: OwnedSave = {
    id: `own-${crypto.randomUUID()}`,
    savedAt: today(),
    cardCount: SUPPORT_CARD_DB.length,
    ...entry,
  };
  store([...list, rec]);
  return rec;
}

/**
 * 所持ストアの変更の直前に呼ぶ。既定（全サポカ完凸）を使っているなら、今の内容から
 * 「自分の所持状況」を作って使用中にする（作ったら true）。以後の変更はそこへ随時保存される。
 */
export function ensureEditableSlot(): boolean {
  if (!isBuiltinId(readActiveSlotId())) return false;
  const list = load();
  const rec = insert(
    { name: uniqueName(DEFAULT_OWN_NAME, list), levels: currentLevels(), pIdols: currentPIdols() },
    list,
  );
  writeActiveSlotId(rec.id);
  notifyStoreChange();
  return true;
}

/**
 * 旧データの移行: 使用中が既定なのに所持状況が既定（全完凸・特訓6開花4）と違うときは、
 * 今の内容を「自分の所持状況」として作って使用中にする（所持状況ページを開いたときに1回呼ぶ）。
 */
export function adoptCustomizedAsOwn(): boolean {
  if (!isBuiltinId(readActiveSlotId())) return false;
  const customized =
    Object.values(currentLevels()).some((v) => v !== 4) ||
    Object.values(currentPIdols()).some((o) => o.kunren !== 6 || o.kaika !== 4);
  return customized ? ensureEditableSlot() : false;
}

/**
 * 計算ページのセーブを読み込んだとき: そのセーブ用の所持状況を使用中にする（無ければ作る）。
 * 読み込み直後の自動保存がここへ向くよう、所持ストアを置き換える前に呼ぶ。
 */
export function adoptSaveSnapshot(
  saveId: string,
  name: string,
  levels: Record<string, number>,
  pIdols?: Record<string, PIdolOwnership>,
): void {
  const list = load();
  const rec = list.find((s) => s.saveId === saveId) ?? insert({ name, levels, pIdols, saveId }, list);
  writeActiveSlotId(rec.id);
  notifyStoreChange();
}

/**
 * 所持ストア（サポカ凸／Pアイドル）の保存effectから呼ぶ。使っている所持状況が既定でなければ、
 * その中身を今の状態で更新する（中身が同じなら何もしない）。通知は呼び出し元の保存effectが出す。
 */
export function autoSaveToActiveSlot(patch: {
  levels?: Record<string, number>;
  pIdols?: Record<string, PIdolOwnership>;
}): void {
  const id = readActiveSlotId();
  if (isBuiltinId(id)) return; // 既定は読み込み専用
  const saves = load();
  const index = saves.findIndex((s) => s.id === id);
  if (index < 0) return;
  const current = saves[index];
  const next: OwnedSave = { ...current };
  let changed = false;
  if (patch.levels && JSON.stringify(patch.levels) !== JSON.stringify(current.levels)) {
    next.levels = patch.levels;
    next.cardCount = SUPPORT_CARD_DB.length;
    changed = true;
  }
  if (
    patch.pIdols &&
    JSON.stringify(patch.pIdols) !== JSON.stringify(current.pIdols ?? {})
  ) {
    next.pIdols = patch.pIdols;
    changed = true;
  }
  if (!changed) return;
  next.savedAt = today();
  saves[index] = next;
  store(saves);
}

export function useOwnedSaves() {
  const [saves, setSaves] = useState<OwnedSave[]>(load);
  const [activeId, setActiveId] = useState<string>(readActiveSlotId);

  // 他のフック実体（所持ストアの自動保存・自動作成、計算ページのセーブ欄）が書いたら読み直す
  useEffect(
    () =>
      subscribeStoreChange(() => {
        const list = load();
        setSaves((prev) => (JSON.stringify(prev) === JSON.stringify(list) ? prev : list));
        const id = readActiveSlotId();
        setActiveId((prev) => (prev === id ? prev : id));
      }),
    [],
  );

  /** 一覧を書いて、この実体と他の実体に反映する */
  const commit = useCallback((next: OwnedSave[]) => {
    store(next);
    setSaves(next);
    notifyStoreChange();
  }, []);

  /** 使う所持状況を切り替える（null=既定）。内容の読み込みは呼び出し側（所持ストアの replaceAll） */
  const setActiveSlot = useCallback((id: string | null) => {
    writeActiveSlotId(id);
    setActiveId(id ?? BUILTIN_ID);
    notifyStoreChange();
  }, []);

  /**
   * 保存（saveId 付きで既存があれば上書き）。付けた/使ったIDを返す。
   * 計算ページのセーブデータからは saveId を渡して1セーブ1件に保つ。
   */
  const upsert = useCallback(
    (entry: {
      name: string;
      levels: Record<string, number>;
      pIdols?: Record<string, PIdolOwnership>;
      saveId?: string;
    }): string => {
      const list = load();
      const existing = entry.saveId ? list.find((s) => s.saveId === entry.saveId) : undefined;
      const id = existing?.id ?? `own-${crypto.randomUUID()}`;
      const savedAt = today();
      const cardCount = SUPPORT_CARD_DB.length;
      commit(
        list.some((s) => s.id === id)
          ? list.map((s) => (s.id === id ? { ...s, ...entry, savedAt, cardCount } : s))
          : [...list, { id, savedAt, ...entry, cardCount }],
      );
      return id;
    },
    [commit],
  );

  /** 既存の保存を今の所持状況で上書きする（名前はそのまま） */
  const overwrite = useCallback(
    (
      id: string,
      entry: { levels: Record<string, number>; pIdols?: Record<string, PIdolOwnership> },
    ) => {
      const savedAt = today();
      const cardCount = SUPPORT_CARD_DB.length;
      commit(load().map((s) => (s.id === id ? { ...s, ...entry, savedAt, cardCount } : s)));
    },
    [commit],
  );

  /** 削除。使用中だったら既定（全サポカ完凸）へ戻す（内容の読み込みは呼び出し側） */
  const remove = useCallback(
    (id: string) => {
      const wasActive = readActiveSlotId() === id;
      commit(load().filter((s) => s.id !== id));
      if (wasActive) setActiveSlot(BUILTIN_ID);
    },
    [commit, setActiveSlot],
  );

  /** セーブデータ（計算ページ）に紐づく所持状況を消す */
  const removeBySaveId = useCallback(
    (saveId: string) => {
      const list = load();
      const wasActive = list.some((s) => s.saveId === saveId && s.id === readActiveSlotId());
      commit(list.filter((s) => s.saveId !== saveId));
      if (wasActive) setActiveSlot(BUILTIN_ID);
    },
    [commit, setActiveSlot],
  );

  const rename = useCallback(
    (id: string, name: string) => {
      commit(load().map((s) => (s.id === id ? { ...s, name } : s)));
    },
    [commit],
  );

  /** 新しく作る（名前が空なら「自分の所持状況」＋番号）。元は今の内容か全サポカ完凸 */
  const createFrom = useCallback(
    (name: string, base: "current" | "all4"): OwnedSave => {
      const list = load();
      const src = base === "all4" ? BUILTIN_ALL4 : { levels: currentLevels(), pIdols: currentPIdols() };
      const rec = insert(
        {
          name: name.trim() || uniqueName(DEFAULT_OWN_NAME, list),
          levels: { ...src.levels },
          pIdols: { ...(src.pIdols ?? {}) },
        },
        list,
      );
      setSaves(load());
      notifyStoreChange();
      return rec;
    },
    [],
  );

  /** 複製（名前が空なら「◯◯のコピー」）。セーブデータ用を複製すると自分のものになる */
  const duplicate = useCallback((id: string, name: string): OwnedSave | null => {
    const list = load();
    const src = id === BUILTIN_ID ? BUILTIN_ALL4 : list.find((s) => s.id === id);
    if (!src) return null;
    const rec = insert(
      {
        name: name.trim() || uniqueName(`${src.name}のコピー`, list),
        levels: { ...src.levels },
        pIdols: src.pIdols ? { ...src.pIdols } : undefined,
      },
      list,
    );
    setSaves(load());
    notifyStoreChange();
    return rec;
  }, []);

  return {
    saves,
    activeId,
    setActiveSlot,
    upsert,
    overwrite,
    remove,
    removeBySaveId,
    rename,
    createFrom,
    duplicate,
    loaded: true,
  };
}
