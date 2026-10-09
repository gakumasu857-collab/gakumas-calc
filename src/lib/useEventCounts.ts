import { useCallback, useEffect, useState } from "react";
import { SUPPORT_CARD_DB } from "@/data/supportCardsDb";
import { migrateCardId } from "./idMigration";
import { preEventMax, type EventCountOverride } from "./sheetScore";
import { useSaveNotifier } from "./storeSync";

/**
 * サポカごとの前イベ・後イベ発動回数の手動指定ストア。
 * 未指定のカードは自動計算（前イベ=min(参照回数, 最大発動回数)、後イベ=1回）。
 *
 * 保存キーを引数で切り替えられる:
 * - 既定（gakumas:eventCounts:v1）: サポカ設定ページ・点数表で共有。
 *   ここの「前イベの回数の上限」（preMax）だけは全ページ共通で、計算ページ・探索・点数表が
 *   withPreMax で自分の設定に重ねて読む（オーナー要望 2026-10-09「たこ焼きは4回出るけど大体3回なので3で制限したい」）
 * - 計算ページは専用キーを渡して独立させる（サポカ設定と混ざらないように）
 * - 点数表の前イベ回数も専用キー（この表だけの設定。オーナー要望 2026-10-09）
 */
export const CALC_EVENT_COUNTS_KEY = "gakumas:calcEventCounts:v1";
/** 点数表だけの前イベ回数（pre）の保存先 */
export const SCORE_EVENT_COUNTS_KEY = "gakumas:scoreEventCounts:v1";
const DEFAULT_STORAGE_KEY = "gakumas:eventCounts:v1";

type OverrideMap = Record<string, EventCountOverride>;

/** カードの最大発動回数（上限がこれ以上なら意味が無いので持たない） */
const CARD_MAX_BY_ID = new Map(SUPPORT_CARD_DB.map((c) => [c.id, preEventMax(c)]));

/** 前イベの上限の正規化。数でない・0未満は切り上げ、スプシの最大発動回数以上（＝効かない）は null（持たない） */
function normalizePreMax(id: string, value: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const v = Math.max(0, Math.floor(value));
  const max = CARD_MAX_BY_ID.get(id);
  if (max !== undefined && v >= max) return null;
  return v;
}

/**
 * サポカ設定ページの「前イベの回数の上限」（preMax）を、別の設定（計算ページ専用・点数表専用の手動指定）に重ねて読む。
 * 計算ページ・探索・点数表はこれで作った関数を SheetScoreContext.eventCounts に渡す
 * （上限だけが全ページ共通の設定。後イベ・ステイベ・取得はページごと）。
 */
export function withPreMax(
  get: (cardId: string) => EventCountOverride | undefined,
  caps: (cardId: string) => EventCountOverride | undefined,
): (cardId: string) => EventCountOverride | undefined {
  return (id) => {
    const base = get(id);
    const cap = caps(id)?.preMax;
    if (cap === undefined) return base;
    if (base?.preMax === cap) return base;
    return { ...(base ?? {}), preMax: cap };
  };
}

/** 空のオーバーライドか（空ならマップから消す） */
const isEmpty = (o: EventCountOverride) =>
  o.pre === undefined &&
  o.post === undefined &&
  o.acquire === undefined &&
  o.enhance === undefined &&
  o.preEnhanceM === undefined &&
  o.preDelM === undefined &&
  o.preSkillTags === undefined &&
  o.statEvent === undefined &&
  o.preMax === undefined;

/**
 * 保存データ（localStorage・セーブデータ）を読むときに、今は使わない項目を落とす。
 * 後イベのランダム強化の「強化したスキルの属性」（enhanceTags）は 2026-10-07 にやめた
 * （属性つきのスキル強化は全部「スキル強化」として判定することになったため）。
 * 残したままだと、ボタンが無いのに「変更中」と数えられてしまう。
 * @param preToCap サポカ設定ページのストアのとき true。2026-10-09 まで「回数」欄は固定回数（pre）だったので
 *   上限（preMax）へ写す（両方あれば小さい方）。計算ページ・点数表の pre はそのまま
 */
function sanitize(map: OverrideMap, preToCap: boolean): OverrideMap {
  const out: OverrideMap = {};
  for (const [rawId, raw] of Object.entries(map ?? {})) {
    if (!raw || typeof raw !== "object") continue;
    const o: EventCountOverride & { enhanceTags?: unknown } = { ...raw };
    delete o.enhanceTags;
    // 旧キー card:<名前> は今のキー card:<スプシのid> へ（両方あれば今のキーの値を優先）
    const id = migrateCardId(rawId);
    if (preToCap && o.pre !== undefined) {
      o.preMax = o.preMax === undefined ? o.pre : Math.min(o.preMax, o.pre);
      delete o.pre;
    }
    if (o.preMax !== undefined) {
      const cap = normalizePreMax(id, o.preMax);
      if (cap === null) delete o.preMax;
      else o.preMax = cap;
    }
    if (isEmpty(o)) continue;
    if (id !== rawId && id in out) continue;
    out[id] = o;
  }
  return out;
}

export function useEventCounts(storageKey: string = DEFAULT_STORAGE_KEY) {
  // SPAなのでlocalStorageを初期値で同期読み込みする（読み込みちらつき防止）
  const [map, setMap] = useState<OverrideMap>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return sanitize(JSON.parse(raw) as OverrideMap, storageKey === DEFAULT_STORAGE_KEY);
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

  /**
   * 回数の設定（前イベ・後イベ・ステイベ）。null で自動に戻す。
   * preMax＝前イベの回数の上限（サポカ設定ページ）。スプシの最大発動回数以上の上限は意味が無いので持たない
   */
  const set = useCallback(
    (id: string, key: "pre" | "post" | "statEvent" | "preMax", value: number | null) => {
      const v =
        value === null ? null : key === "preMax" ? normalizePreMax(id, value) : Math.max(0, value);
      patch(id, key, v);
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

  /**
   * 任意スキル獲得のi回目の分類タグを設定する。
   * 全回ぶんが空になったら preSkillTags 自体を消してデフォルト（分類なし）に戻す。
   */
  const setSkillTags = useCallback(
    (id: string, index: number, tags: string[]) => {
      setMap((prev) => {
        const current = { ...(prev[id] ?? {}) };
        const list = [...(current.preSkillTags ?? [])];
        while (list.length <= index) list.push([]);
        list[index] = tags;
        // 末尾の空配列を落とし、全部空なら未指定へ戻す
        while (list.length > 0 && list[list.length - 1].length === 0) list.pop();
        if (list.length === 0) delete current.preSkillTags;
        else current.preSkillTags = list;
        const next = { ...prev };
        if (isEmpty(current)) delete next[id];
        else next[id] = current;
        return next;
      });
    },
    [],
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
  const replaceAll = useCallback(
    (snapshot: OverrideMap) => {
      setMap(sanitize(snapshot, storageKey === DEFAULT_STORAGE_KEY));
    },
    [storageKey],
  );

  /** カード1枚ぶんの手動指定を全部消す（自動に戻す） */
  const clear = useCallback((id: string) => {
    setMap((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  /**
   * 指定したカード以外の手動指定を消す。
   * 計算ページでは「今の編成での調整」なので、編成から外れたカードの設定を持ち越さない
   * （別の編成のときに取得OFFにしたカードを後で入れ直すと、何もしていないのに
   *   「変更中」になって評価値も変わる、を防ぐ）。空の Set を渡すと全部消える。
   */
  const pruneTo = useCallback((ids: ReadonlySet<string>) => {
    setMap((prev) => {
      const stale = Object.keys(prev).filter((id) => !ids.has(id));
      if (stale.length === 0) return prev;
      const next = { ...prev };
      for (const id of stale) delete next[id];
      return next;
    });
  }, []);

  /**
   * 探索の結果の前イベ・後イベの取得状況を反映する（どの探索でも終わったら呼ぶ）。
   * 対象カードの acquire/pre/post をいったん自動（＝全部発動）に戻してから ops を当てる。
   * ops が空なら「全部発動」（取得回数の制限が無いとき）。ステイベ・強化のA/Mなどは残す。
   */
  const applyEventOps = useCallback(
    (
      ids: readonly string[],
      ops: readonly { id: string; pre?: number; acquire?: false; post?: 0 }[],
    ) => {
      setMap((prev) => {
        const next = { ...prev };
        for (const id of ids) {
          const cur = { ...(next[id] ?? {}) };
          delete cur.acquire;
          delete cur.pre;
          delete cur.post;
          if (isEmpty(cur)) delete next[id];
          else next[id] = cur;
        }
        for (const op of ops) {
          const cur = { ...(next[op.id] ?? {}) };
          if (op.acquire === false) cur.acquire = false;
          if (op.pre !== undefined) cur.pre = Math.max(0, op.pre);
          if (op.post !== undefined) cur.post = Math.max(0, op.post);
          if (isEmpty(cur)) delete next[op.id];
          else next[op.id] = cur;
        }
        return next;
      });
    },
    [],
  );

  return {
    get,
    set,
    setTarget,
    setAssign,
    setAcquire,
    setSkillTags,
    replaceAll,
    clear,
    pruneTo,
    applyEventOps,
    loaded: true,
    map,
  };
}
