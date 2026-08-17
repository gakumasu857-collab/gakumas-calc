import { useCallback, useEffect, useState } from "react";
import {
  NIA_AUDITION_VOTE_MAX,
  NIA_AUDITIONS,
  NIA_FINAL_SCORE_DEFAULT,
  NIA_LESSONS,
  NIA_SALES,
} from "@/data/scenarios";
import { useSaveNotifier } from "./storeSync";
import { roleToTypeFromCalcStorage } from "./useSchedule";
import { TYPE_KEYS, type TypeKey } from "./useCalcSettings";

/**
 * N.I.A.（マスター）のスケジュール入力状態。
 * - lessons: 自主レッスン7回の踏みタイプ（単タイプ・サブなし）とSP有無
 * - sales: 営業7回。上げるタイプ＋営業先（リゾートか）＋大成功か
 * - auditions: 1次・2次オーディションのタイプ別「素点」（手入力）
 * - auditionVotes: 1次・2次のファン投票数（手入力）
 * - finalScores: 最終オーディションのタイプ別スコア
 *   （タイプごとに審査基準ランクの式でステ素点を導出。投票数は合計スコアから導出）
 * ※ 札（スキルカード獲得枚数）は発動回数セットの「スキル獲得」から取るためここには持たない
 * すべてタイプ直接紐づけ（ロール概念なし）。アイドル切替時は remapTypes で入れ替える。
 */
const STORAGE_KEY = "gakumas:niaSchedule:v1";

export type NiaLessonPick = { main: TypeKey; sp: boolean };
export type NiaSalePick = { type: TypeKey; resort: boolean; great: boolean };

type NiaState = {
  lessons: NiaLessonPick[];
  sales: NiaSalePick[];
  auditions: Record<TypeKey, number>[];
  auditionVotes: number[];
  finalScores: Record<TypeKey, number>;
};

const DEFAULT_STATE: NiaState = {
  lessons: NIA_LESSONS.map(() => ({ main: "vocal", sp: true })),
  sales: NIA_SALES.map(() => ({ type: "visual", resort: true, great: true })),
  // 初回デフォルトは全部上限（オーディション素点は上限クランプ、
  // ファン投票数は上限目安、最終はステ素点・投票数とも上限に到達するスコア）
  auditions: NIA_AUDITIONS.map(() => ({ vocal: 999, dance: 999, visual: 999 })),
  auditionVotes: [...NIA_AUDITION_VOTE_MAX],
  finalScores: {
    vocal: NIA_FINAL_SCORE_DEFAULT,
    dance: NIA_FINAL_SCORE_DEFAULT,
    visual: NIA_FINAL_SCORE_DEFAULT,
  },
};

const isTypeKey = (v: unknown): v is TypeKey =>
  TYPE_KEYS.includes(v as TypeKey);

/** localStorageから同期読み込み（旧ロール形式の移行込み） */
export function loadNiaState(): NiaState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Record<string, unknown>;
      const lessonsRaw = (stored.lessons ?? []) as Record<string, unknown>[];
      const salesRaw = (stored.sales ?? []) as Record<string, unknown>[];
      const isRoleFormat =
        lessonsRaw.some((l) => typeof l?.main === "string" && !isTypeKey(l.main)) ||
        salesRaw.some((s) => typeof s?.role === "string");
      const roleToType = isRoleFormat ? roleToTypeFromCalcStorage() : null;
      const toType = (v: unknown, fb: TypeKey): TypeKey => {
        if (isTypeKey(v)) return v;
        if (typeof v === "string" && roleToType?.[v]) return roleToType[v];
        return fb;
      };
      const auditionsRaw = (stored.auditions ?? []) as Partial<
        Record<TypeKey, number>
      >[];
      const votesRaw = (stored.auditionVotes ?? []) as number[];
      // 素点・投票数・最終スコアの0は実プレイであり得ない値なので
      // 「未入力」とみなして上限デフォルトへ移行する
      const orDefault = (v: number | undefined, def: number): number =>
        v && v > 0 ? v : def;
      const finalRaw =
        (stored.finalScores as Partial<Record<TypeKey, number>> | undefined) ??
        {};
      return {
        lessons: NIA_LESSONS.map((_, i) => ({
          main: toType(lessonsRaw[i]?.main, "vocal"),
          sp: (lessonsRaw[i]?.sp as boolean | undefined) ?? true,
        })),
        sales: NIA_SALES.map((_, i) => ({
          type: toType(salesRaw[i]?.type ?? salesRaw[i]?.role, "visual"),
          resort: (salesRaw[i]?.resort as boolean | undefined) ?? false,
          great: (salesRaw[i]?.great as boolean | undefined) ?? false,
        })),
        auditions: NIA_AUDITIONS.map((_, i) => ({
          vocal: orDefault(auditionsRaw[i]?.vocal, 999),
          dance: orDefault(auditionsRaw[i]?.dance, 999),
          visual: orDefault(auditionsRaw[i]?.visual, 999),
        })),
        auditionVotes: NIA_AUDITIONS.map((_, i) =>
          orDefault(votesRaw[i], NIA_AUDITION_VOTE_MAX[i]),
        ),
        finalScores: {
          vocal: orDefault(finalRaw.vocal, NIA_FINAL_SCORE_DEFAULT),
          dance: orDefault(finalRaw.dance, NIA_FINAL_SCORE_DEFAULT),
          visual: orDefault(finalRaw.visual, NIA_FINAL_SCORE_DEFAULT),
        },
      };
    }
  } catch {
    // 破損データは無視
  }
  return DEFAULT_STATE;
}

export function useNiaSchedule() {
  const [state, setState] = useState<NiaState>(loadNiaState);
  const notifySave = useSaveNotifier();

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      notifySave();
    } catch {
      // 容量超過などは無視
    }
  }, [state, notifySave]);

  const setLessonMain = useCallback((index: number, main: TypeKey) => {
    setState((prev) => ({
      ...prev,
      lessons: prev.lessons.map((l, i) => (i === index ? { ...l, main } : l)),
    }));
  }, []);

  const toggleLessonSp = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      lessons: prev.lessons.map((l, i) =>
        i === index ? { ...l, sp: !l.sp } : l,
      ),
    }));
  }, []);

  const applyAllMain = useCallback((main: TypeKey) => {
    setState((prev) => ({
      ...prev,
      lessons: prev.lessons.map((l) => ({ ...l, main })),
    }));
  }, []);

  /** 営業の設定変更（上げるタイプ・営業先・大成功） */
  const setSale = useCallback(
    (index: number, patch: Partial<NiaSalePick>) => {
      setState((prev) => ({
        ...prev,
        sales: prev.sales.map((s, i) => (i === index ? { ...s, ...patch } : s)),
      }));
    },
    [],
  );

  /** 全営業のタイプを一括変更 */
  const applyAllSales = useCallback((type: TypeKey) => {
    setState((prev) => ({
      ...prev,
      sales: prev.sales.map((s) => ({ ...s, type })),
    }));
  }, []);

  const setAudition = useCallback(
    (index: number, type: TypeKey, value: number) => {
      setState((prev) => ({
        ...prev,
        auditions: prev.auditions.map((a, i) =>
          i === index ? { ...a, [type]: Math.max(0, value) } : a,
        ),
      }));
    },
    [],
  );

  const setAuditionVotes = useCallback((index: number, value: number) => {
    setState((prev) => ({
      ...prev,
      auditionVotes: prev.auditionVotes.map((v, i) =>
        i === index ? Math.max(0, value) : v,
      ),
    }));
  }, []);

  const setFinalScore = useCallback((type: TypeKey, value: number) => {
    setState((prev) => ({
      ...prev,
      finalScores: { ...prev.finalScores, [type]: Math.max(0, value) },
    }));
  }, []);

  /** 踏み方・営業の一括適用（全自動最適化用） */
  const setPlan = useCallback(
    (lessons: NiaLessonPick[], sales: NiaSalePick[]) => {
      setState((prev) => ({ ...prev, lessons, sales }));
    },
    [],
  );

  /** タイプ間の入れ替え（アイドル切替時の審査基準合わせ用） */
  const remapTypes = useCallback((map: Record<TypeKey, TypeKey>) => {
    const remapRecord = (rec: Record<TypeKey, number>) => {
      const next: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
      for (const t of TYPE_KEYS) next[map[t]] = rec[t];
      return next;
    };
    setState((prev) => ({
      ...prev,
      lessons: prev.lessons.map((l) => ({ ...l, main: map[l.main] })),
      sales: prev.sales.map((s) => ({ ...s, type: map[s.type] })),
      auditions: prev.auditions.map(remapRecord),
      finalScores: remapRecord(prev.finalScores),
    }));
  }, []);

  return {
    ...state,
    setLessonMain,
    toggleLessonSp,
    applyAllMain,
    setSale,
    applyAllSales,
    setAudition,
    setAuditionVotes,
    setFinalScore,
    setPlan,
    remapTypes,
    loaded: true,
  };
}
