import { useCallback, useEffect, useMemo, useState } from "react";
import { useSaveNotifier } from "./storeSync";
import {
  PLAN_LIST,
  SLOT_SIZE,
  TEMPLATE_MEMORIES,
  padSlots,
  sameAbilities,
  sameMemoryContent,
  sameSlots,
  slotToMemory,
  slotsFromIds,
  toSlotMemory,
  type AttrKey,
  type Memory,
  type MemorySet,
  type PlanKey,
  type SlotMemory,
} from "./memoryTypes";

/** 作成・保存に使うメモリーの中身（ID・テンプレ印を除いたもの） */
export type MemoryDraft = Omit<Memory, "id" | "isTemplate">;

/** 枠の保存状態。編集枠のバッジと保存ボタンの出し分けに使う */
export type SlotStatus = "empty" | "template" | "unsaved" | "saved" | "modified";

/** 旧データ（plan:"スキル"など廃止された値）を現行の4プランへ正規化 */
function normalizePlan(plan: unknown): PlanKey {
  return (PLAN_LIST as string[]).includes(plan as string) ? (plan as PlanKey) : "共通";
}
function normalizeMemory(memory: Memory): Memory {
  return { ...memory, plan: normalizePlan(memory.plan) };
}

/**
 * メモリーの状態を localStorage に永続化するストア。
 *
 * - library: 保存したメモリー（テンプレは含めない）
 * - slots: スロット4枠の中身（保存していないメモリーもそのまま持つ。sourceId は保存元）
 * - sets: 保存済みメモリーセット（4枠の中身のスナップショット）
 * - activeSetId: 今の4枠をどのセットから入れたか（セットの「変更あり」「上書き保存」用。2026-10-07）
 *
 * 旧形式（スロット＝メモリーIDの配列、セット＝IDの配列）は読み込み時に中身へ展開する。
 */
const LIB_KEY = "gakumas:memories:v1";
const SLOTS_KEY = "gakumas:memorySlots:v2";
/** 最初の汎用メモリーを入れ終えた印（入れるのは1回だけ。あとから4枠とも空にしても入れ直さない） */
const INIT_KEY = "gakumas:memoryInit:v1";

/** 汎用メモリー（汎用メモリー60点のテンプレ）。初めての人の4枠と「汎用メモリーを入れる」で使う */
export const GENERIC_MEMORY_ID = "tpl-role60";
/** 旧形式のスロット（IDの配列）。v2 が無いときだけ読む */
const LEGACY_SEL_KEY = "gakumas:memorySelection:v1";
const SETS_KEY = "gakumas:memorySets:v1";
/** 今の4枠をどのセットから入れたか（セットID。null＝どのセットからでもない） */
const ACTIVE_SET_KEY = "gakumas:memoryActiveSet:v1";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // 破損データは無視
  }
  return fallback;
}

/** 保存データの1枠ぶんを検証して整える（壊れていれば null） */
function normalizeSlot(raw: unknown): SlotMemory | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<SlotMemory>;
  if (!Array.isArray(r.abilities)) return null;
  const roleSpec =
    r.roleSpec &&
    typeof r.roleSpec.mainPct === "number" &&
    typeof r.roleSpec.subFlat === "number"
      ? { mainPct: r.roleSpec.mainPct, subFlat: r.roleSpec.subFlat }
      : undefined;
  return {
    plan: normalizePlan(r.plan),
    skillName:
      typeof r.skillName === "string" && r.skillName ? r.skillName : undefined,
    abilities: r.abilities
      .filter((a) => a && typeof a.attr === "string" && typeof a.value === "string")
      .map((a) => ({ attr: a.attr as AttrKey, value: a.value })),
    roleSpec,
    sourceId: typeof r.sourceId === "string" ? r.sourceId : undefined,
  };
}

function loadSlots(pool: Memory[]): (SlotMemory | null)[] {
  const v2 = load<unknown>(SLOTS_KEY, null);
  const slots = Array.isArray(v2)
    ? padSlots(v2.map(normalizeSlot))
    : slotsFromIds(load<string[]>(LEGACY_SEL_KEY, []), pool);
  return withFirstTimeGeneric(slots, pool);
}

/**
 * 初めての人は、4枠とも汎用メモリー（汎用メモリー60点）から始める（オーナー指定 2026-10-01。
 * メモリーを自分で作るところで手が止まりやすいので、まず探索まで行けるようにする）。
 * 入れるのは1回だけ: もう何か入っている人はそのまま。あとから4枠とも空にしても入れ直さない。
 * 入れた中身はその場で保存する（開発中の二重初期化や、ほかの実体が読んでも同じ中身になるように）。
 */
function withFirstTimeGeneric(
  slots: (SlotMemory | null)[],
  pool: Memory[],
): (SlotMemory | null)[] {
  try {
    if (localStorage.getItem(INIT_KEY)) return slots;
    localStorage.setItem(INIT_KEY, "1");
  } catch {
    return slots; // 保存できない環境では何もしない（毎回入れ直してしまうため）
  }
  if (slots.some((s) => s !== null)) return slots;
  const generic = pool.find((m) => m.id === GENERIC_MEMORY_ID);
  if (!generic) return slots;
  const filled = Array.from({ length: SLOT_SIZE }, () => toSlotMemory(generic));
  try {
    localStorage.setItem(SLOTS_KEY, JSON.stringify(filled));
  } catch {
    // 容量超過などは無視（このあとの通常の保存に任せる）
  }
  return filled;
}

function loadSets(pool: Memory[]): MemorySet[] {
  const raw = load<unknown>(SETS_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const s = item as Partial<MemorySet>;
    if (typeof s.id !== "string" || typeof s.name !== "string") return [];
    const memories = Array.isArray(s.memories)
      ? padSlots(s.memories.map(normalizeSlot))
      : Array.isArray(s.memoryIds)
        ? slotsFromIds(s.memoryIds, pool)
        : padSlots([]);
    return [
      {
        id: s.id,
        name: s.name,
        memories,
        saveId: typeof s.saveId === "string" ? s.saveId : undefined,
      },
    ];
  });
}

export function useMemoryStore() {
  // SPAなのでlocalStorageを初期値で同期読み込みする（読み込みちらつき防止）
  const [library, setLibrary] = useState<Memory[]>(() =>
    load<Memory[]>(LIB_KEY, []).map(normalizeMemory),
  );
  const [slots, setSlotsState] = useState<(SlotMemory | null)[]>(() =>
    loadSlots([...TEMPLATE_MEMORIES, ...load<Memory[]>(LIB_KEY, [])]),
  );
  const [sets, setSets] = useState<MemorySet[]>(() =>
    loadSets([...TEMPLATE_MEMORIES, ...load<Memory[]>(LIB_KEY, [])]),
  );
  const [activeSetId, setActiveSetId] = useState<string | null>(() => {
    const raw = load<unknown>(ACTIVE_SET_KEY, null);
    return typeof raw === "string" ? raw : null;
  });

  const notifySave = useSaveNotifier();
  useEffect(() => {
    try {
      localStorage.setItem(LIB_KEY, JSON.stringify(library));
      localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
      localStorage.setItem(SETS_KEY, JSON.stringify(sets));
      localStorage.setItem(ACTIVE_SET_KEY, JSON.stringify(activeSetId));
      notifySave();
    } catch {
      // 容量超過などは無視
    }
  }, [library, slots, sets, activeSetId, notifySave]);
  // 入れたセットが消えたら（削除・セーブデータの控えの整理）つながりを外す
  useEffect(() => {
    if (activeSetId && !sets.some((s) => s.id === activeSetId)) setActiveSetId(null);
  }, [sets, activeSetId]);

  /** テンプレ＋保存したメモリーをまとめた全メモリー */
  const allMemories = useMemo(
    () => [...TEMPLATE_MEMORIES, ...library],
    [library],
  );

  const findMemory = useCallback(
    (id: string): Memory | undefined => allMemories.find((m) => m.id === id),
    [allMemories],
  );

  /** スロットの中身を表示・計算用の Memory にしたもの（空枠は null） */
  const slotMemories = useMemo(
    () => slots.map((s, i) => (s ? slotToMemory(s, i) : null)),
    [slots],
  );
  /** 中身が入っている枠の数 */
  const count = slots.filter((s) => s !== null).length;
  /** 4枠とも汎用メモリー（汎用メモリー60点のテンプレ）のままか（設定欄の「今は汎用メモリー」の表記用） */
  const isGeneric = slots.every((s) => !!s && !!s.roleSpec && s.sourceId === GENERIC_MEMORY_ID);
  /** 今の4枠を入れたセット（無ければ null）と、そこから枠を変えたか（「上書き保存」を出す条件） */
  const activeSet = useMemo(
    () => sets.find((s) => s.id === activeSetId) ?? null,
    [sets, activeSetId],
  );
  const activeSetModified = !!activeSet && !sameSlots(slots, activeSet.memories);

  // ---------------------------------------------------------------- スロット
  const setSlot = useCallback((index: number, value: SlotMemory | null) => {
    setSlotsState((prev) => prev.map((s, i) => (i === index ? value : s)));
  }, []);

  const clearSlot = useCallback((index: number) => setSlot(index, null), [setSlot]);

  /** 4枠をまるごと置き換える（セーブデータの読み込み・セットの展開用） */
  const setSlots = useCallback((values: (SlotMemory | null)[]) => {
    setSlotsState(padSlots(values.map((v) => (v ? normalizeSlot(v) : null))));
    setActiveSetId(null); // セーブデータの読み込みなど＝どのセットから入れたのでもない
  }, []);

  /** 保存したメモリー／テンプレの中身を枠にコピーして入れる */
  const pickIntoSlot = useCallback(
    (index: number, memoryId: string) => {
      const m = findMemory(memoryId);
      if (m) setSlot(index, toSlotMemory(m));
    },
    [findMemory, setSlot],
  );

  /** 4枠すべてを同じメモリーのコピーにする（メモリー選択の「汎用のメモリーを入れる」用） */
  const fillSlots = useCallback(
    (memoryId: string) => {
      const m = findMemory(memoryId);
      if (m) {
        setSlotsState(Array.from({ length: SLOT_SIZE }, () => toSlotMemory(m)));
        setActiveSetId(null);
      }
    },
    [findMemory],
  );

  // ---------------------------------------------------------------- ライブラリ
  /** メモリーを保存（ライブラリへ追加）。付けたIDを返す */
  const addMemory = useCallback((draft: MemoryDraft): string => {
    const id = `mem-${crypto.randomUUID()}`;
    setLibrary((prev) => [...prev, normalizeMemory({ ...draft, id })]);
    return id;
  }, []);

  /**
   * 保存したメモリーの中身を書き換える（テンプレは不可）。
   * 枠に入れてある「保存元から変えていないコピー」も一緒に書き換える（変えてあるものはそのまま）。
   */
  const updateMemory = useCallback(
    (id: string, patch: MemoryDraft) => {
      if (id.startsWith("tpl-")) return;
      const old = library.find((m) => m.id === id);
      setLibrary((prev) =>
        prev.map((m) => (m.id === id ? normalizeMemory({ ...m, ...patch }) : m)),
      );
      if (old) {
        setSlotsState((prev) =>
          prev.map((s) =>
            s && s.sourceId === id && sameMemoryContent(s, old)
              ? { ...s, plan: patch.plan, skillName: patch.skillName, abilities: patch.abilities }
              : s,
          ),
        );
      }
    },
    [library],
  );

  /** ライブラリから削除（テンプレは不可）。枠の中身は残し、保存元のつながりだけ外す */
  const deleteMemory = useCallback((id: string) => {
    if (id.startsWith("tpl-")) return;
    setLibrary((prev) => prev.filter((m) => m.id !== id));
    setSlotsState((prev) =>
      prev.map((s) => (s && s.sourceId === id ? { ...s, sourceId: undefined } : s)),
    );
  }, []);

  /** 枠の保存状態（空／テンプレ／未保存／保存済み／保存元から変更あり） */
  const slotStatus = useCallback(
    (index: number): SlotStatus => {
      const s = slots[index];
      if (!s) return "empty";
      if (s.roleSpec) return "template";
      const source = s.sourceId ? library.find((m) => m.id === s.sourceId) : undefined;
      if (!source) return "unsaved";
      return sameMemoryContent(s, source) ? "saved" : "modified";
    },
    [slots, library],
  );

  /** 枠と同じアビリティ・プランで保存済みのメモリー（名前は問わない。保存元そのものは除く） */
  const findDuplicate = useCallback(
    (index: number): Memory | undefined => {
      const s = slots[index];
      if (!s || s.roleSpec || s.abilities.length === 0) return undefined;
      return library.find((m) => m.id !== s.sourceId && sameAbilities(m, s));
    },
    [slots, library],
  );

  /**
   * 枠の中身をライブラリへ保存する。
   * new: 新しいメモリーとして保存して枠をそれにつなぐ／overwrite: 保存元を上書き。
   * patch（名前・プラン）は保存するときに付けるもの（2026-10-08〜。枠の編集では付けない）。枠にも書く。
   * 保存したメモリーのIDを返す（テンプレ・空枠は null）。
   */
  const saveSlot = useCallback(
    (
      index: number,
      mode: "new" | "overwrite",
      patch?: { plan?: PlanKey; skillName?: string },
    ): string | null => {
      const s0 = slots[index];
      if (!s0 || s0.roleSpec || s0.abilities.length === 0) return null;
      const s: SlotMemory = patch ? { ...s0, ...patch } : s0;
      const draft: MemoryDraft = {
        plan: s.plan,
        skillName: s.skillName,
        abilities: s.abilities,
      };
      if (mode === "overwrite" && s.sourceId && library.some((m) => m.id === s.sourceId)) {
        updateMemory(s.sourceId, draft);
        if (patch) setSlot(index, s);
        return s.sourceId;
      }
      const id = addMemory(draft);
      setSlot(index, { ...s, sourceId: id });
      return id;
    },
    [slots, library, updateMemory, addMemory, setSlot],
  );

  // ---------------------------------------------------------------- セット
  /** 今の4枠をメモリーセットとして保存する（名前未入力なら「セットn」） */
  const saveSet = useCallback(
    (name: string): string => {
      const id = `set-${crypto.randomUUID()}`;
      const memories = slots.map((s) => (s ? { ...s } : null));
      setSets((prev) => [
        ...prev,
        { id, name: name || `セット${prev.length + 1}`, memories },
      ]);
      setActiveSetId(id); // 保存した直後は、そのセットを使っている状態
      return id;
    },
    [slots],
  );

  /** セットの4枚を枠へ展開する（以後そのセットを使っている状態。枠を変えると「変更あり」） */
  const applySet = useCallback((set: MemorySet) => {
    setSlotsState(padSlots(set.memories.map((m) => (m ? { ...m } : null))));
    setActiveSetId(set.id);
  }, []);

  /** 今の4枠で、そのセットの中身を書き換える（作業台の「上書き保存」） */
  const overwriteSet = useCallback(
    (id: string) => {
      const memories = slots.map((s) => (s ? { ...s } : null));
      setSets((prev) => prev.map((s) => (s.id === id ? { ...s, memories } : s)));
    },
    [slots],
  );

  /** セットの名前を変える（空なら変えない） */
  const renameSet = useCallback((id: string, name: string) => {
    const next = name.trim();
    if (!next) return;
    setSets((prev) => prev.map((s) => (s.id === id ? { ...s, name: next } : s)));
  }, []);

  const deleteSet = useCallback((id: string) => {
    setSets((prev) => prev.filter((s) => s.id !== id));
  }, []);

  /**
   * 計算ページのセーブデータ用セットを作る/上書きする（1セーブにつき1件）。
   * セーブを読み込むときはここではなくスナップショットから展開するので、
   * このセットは「あとで手動で呼び出せる控え」として置いておく用。
   */
  const upsertSaveSet = useCallback(
    (saveId: string, name: string, memories: (SlotMemory | null)[]) => {
      // IDは更新関数の外で確定させる（更新関数は遅延実行されるため）
      const existing = sets.find((s) => s.saveId === saveId);
      const id = existing?.id ?? `set-${crypto.randomUUID()}`;
      const snapshot = padSlots(memories.map((m) => (m ? { ...m } : null)));
      setSets((prev) =>
        prev.some((s) => s.id === id)
          ? prev.map((s) =>
              s.id === id ? { ...s, name, memories: snapshot, saveId } : s,
            )
          : [...prev, { id, name, memories: snapshot, saveId }],
      );
      return id;
    },
    [sets],
  );

  const deleteSetsBySaveId = useCallback((saveId: string) => {
    setSets((prev) => prev.filter((s) => s.saveId !== saveId));
  }, []);

  return {
    loaded: true,
    allMemories,
    library,
    findMemory,
    slots,
    slotMemories,
    count,
    isGeneric,
    setSlot,
    clearSlot,
    setSlots,
    pickIntoSlot,
    fillSlots,
    addMemory,
    updateMemory,
    deleteMemory,
    slotStatus,
    findDuplicate,
    saveSlot,
    sets,
    saveSet,
    applySet,
    overwriteSet,
    renameSet,
    activeSet,
    activeSetModified,
    deleteSet,
    upsertSaveSet,
    deleteSetsBySaveId,
  };
}
