import { useCallback, useEffect, useState } from "react";
import {
  NIA_AUDITION_VOTE_MAX,
  NIA_AUDITIONS,
  NIA_FINAL_SCORE_DEFAULT,
  NIA_LESSONS,
  NIA_SALES,
  type NiaFinalKind,
} from "@/data/scenarios";
import { useSaveNotifier } from "./storeSync";
import { roleToTypeFromCalcStorage } from "./useSchedule";
import { TYPE_KEYS, type TypeKey } from "./useCalcSettings";

/**
 * N.I.A（マスター）のスケジュール入力状態。
 * - lessons: 自主レッスン7回の踏みタイプ（単タイプ・サブなし）とSP有無
 * - sales: 営業7回。上げるタイプ＋営業先（リゾートか）＋大成功か
 * - auditions: 1次・2次オーディションのタイプ別「素点」（手入力。獲得ボーナス・パラボ抜き）
 * - auditionVotes: 1次・2次のファン投票数（手入力）
 * - finalScores: 最終オーディションのタイプ別スコア
 *   （タイプごとに審査基準ランクの式でステ素点を導出。投票数は合計スコアから導出）
 * - finalStats: 最終オーディションの素点を直接入力するとき（null＝スコアから導出）。
 *   スコアは投票数の導出にだけ使う
 * - finalKind: 最終オーディションの種類（FINALE／QUARTET。ステ換算の式と上限が変わる）
 * ※ 札（スキルカード獲得枚数）は発動回数セットの「スキル獲得」から取るためここには持たない
 * すべてタイプ直接紐づけ（ロール概念なし）。アイドル切替時は remapTypes で入れ替える。
 */
const STORAGE_KEY = "gakumas:niaSchedule:v1";

/** main: null = このレッスンを踏まない */
export type NiaLessonPick = { main: TypeKey | null; sp: boolean };
export type NiaSalePick = { type: TypeKey; resort: boolean; great: boolean };

export type NiaState = {
  lessons: NiaLessonPick[];
  sales: NiaSalePick[];
  auditions: Record<TypeKey, number>[];
  auditionVotes: number[];
  finalScores: Record<TypeKey, number>;
  finalStats: Record<TypeKey, number> | null;
  /**
   * ステ入力のときの合計スコア（ファン投票数の導出だけに使う。null＝タイプ別スコアの合計）。
   * ステ入力中にタイプ別スコアを書き換えると「スコア」に戻したとき別物のステになるので、別に持つ。
   */
  finalTotalScore: number | null;
  finalKind: NiaFinalKind;
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
  finalStats: null,
  finalTotalScore: null,
  finalKind: "finale",
};

const isTypeKey = (v: unknown): v is TypeKey =>
  TYPE_KEYS.includes(v as TypeKey);

/** 最終の素点入力（null か、3タイプの数値） */
function parseFinalStats(raw: unknown): Record<TypeKey, number> | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Partial<Record<TypeKey, unknown>>;
  const out: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
  for (const type of TYPE_KEYS) {
    const v = rec[type];
    out[type] = typeof v === "number" && v > 0 ? Math.round(v) : 0;
  }
  return out;
}

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
          main:
            lessonsRaw[i]?.main === null
              ? null
              : toType(lessonsRaw[i]?.main, "vocal"),
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
        finalStats: parseFinalStats(stored.finalStats),
        // 旧データには無い（＝タイプ別スコアの合計を使う）
        finalTotalScore:
          typeof stored.finalTotalScore === "number"
            ? Math.max(0, Math.round(stored.finalTotalScore))
            : null,
        finalKind: stored.finalKind === "quartet" ? "quartet" : "finale",
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

  const setLessonMain = useCallback((index: number, main: TypeKey | null) => {
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
          i === index ? { ...a, [type]: Math.max(0, Math.round(value)) } : a,
        ),
      }));
    },
    [],
  );

  const setAuditionVotes = useCallback((index: number, value: number) => {
    setState((prev) => ({
      ...prev,
      auditionVotes: prev.auditionVotes.map((v, i) =>
        i === index ? Math.min(NIA_AUDITION_VOTE_MAX[index] ?? Infinity, Math.max(0, value)) : v,
      ),
    }));
  }, []);

  /** 最終オーディションの種類（FINALE／QUARTET） */
  const setFinalKind = useCallback((finalKind: NiaFinalKind) => {
    setState((prev) => ({ ...prev, finalKind }));
  }, []);

  const setFinalScore = useCallback((type: TypeKey, value: number) => {
    setState((prev) => ({
      ...prev,
      finalScores: { ...prev.finalScores, [type]: Math.max(0, value) },
    }));
  }, []);

  /**
   * 最終の入力方法の切り替え。"stat" にするときは初期値（今のスコアから導出した素点）を渡す。
   * "score" に戻すとスコアからの導出に戻る（スコアは残っている）。
   */
  const setFinalMode = useCallback(
    (mode: "score" | "stat", initial?: Record<TypeKey, number>) => {
      setState((prev) => ({
        ...prev,
        finalStats:
          mode === "score"
            ? null
            : (prev.finalStats ?? initial ?? { vocal: 0, dance: 0, visual: 0 }),
        // 「スコア」に戻したら合計はタイプ別スコアの合計に戻す
        finalTotalScore: mode === "score" ? null : prev.finalTotalScore,
      }));
    },
    [],
  );

  /** 最終の素点を直接入力（ステ入力のとき） */
  const setFinalStat = useCallback((type: TypeKey, value: number) => {
    setState((prev) => ({
      ...prev,
      finalStats: {
        ...(prev.finalStats ?? { vocal: 0, dance: 0, visual: 0 }),
        [type]: Math.max(0, Math.round(value)),
      },
    }));
  }, []);

  /**
   * 最終の合計スコアだけを変える（投票数の導出用）。
   * ステ入力のときはタイプ別スコアを触らず、この合計だけを持つ
   * （触ると「スコア」に戻したときに入力前と違うステになるため）。
   * スコア入力のときは今の比率を保って内訳に配る（内訳が0なら1タイプに入れる）。
   */
  const setFinalTotalScore = useCallback((total: number) => {
    setState((prev) => {
      const t = Math.max(0, Math.round(total));
      if (prev.finalStats) return { ...prev, finalTotalScore: t };
      const cur = TYPE_KEYS.reduce((sum, k) => sum + prev.finalScores[k], 0);
      const next: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
      if (cur <= 0) {
        const st = prev.finalStats;
        const top = st ? TYPE_KEYS.reduce((a, b) => (st[b] > st[a] ? b : a)) : "vocal";
        next[top] = t;
        return { ...prev, finalScores: next, finalTotalScore: null };
      }
      let used = 0;
      TYPE_KEYS.forEach((k, idx) => {
        next[k] =
          idx === TYPE_KEYS.length - 1
            ? t - used
            : Math.floor((prev.finalScores[k] * t) / cur);
        used += next[k];
      });
      return { ...prev, finalScores: next, finalTotalScore: null };
    });
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
      lessons: prev.lessons.map((l) => ({
        ...l,
        main: l.main ? map[l.main] : null,
      })),
      sales: prev.sales.map((s) => ({ ...s, type: map[s.type] })),
      auditions: prev.auditions.map(remapRecord),
      finalScores: remapRecord(prev.finalScores),
      finalStats: prev.finalStats ? remapRecord(prev.finalStats) : null,
    }));
  }, []);

  /**
   * 入力状態をまるごと置き換える（セーブデータの読み込み用）。
   * マスタの件数が保存時と違っても壊れないよう、現行の件数に合わせて詰め直す。
   * 旧セーブ（finalStats 無し）はスコアからの導出。
   */
  const replaceAll = useCallback((snapshot: NiaState) => {
    setState({
      lessons: NIA_LESSONS.map(
        (_, i) => snapshot.lessons[i] ?? DEFAULT_STATE.lessons[i],
      ),
      sales: NIA_SALES.map((_, i) => snapshot.sales[i] ?? DEFAULT_STATE.sales[i]),
      auditions: NIA_AUDITIONS.map(
        (_, i) => snapshot.auditions[i] ?? DEFAULT_STATE.auditions[i],
      ),
      auditionVotes: NIA_AUDITIONS.map(
        (_, i) => snapshot.auditionVotes[i] ?? DEFAULT_STATE.auditionVotes[i],
      ),
      finalScores: { ...DEFAULT_STATE.finalScores, ...snapshot.finalScores },
      finalStats: parseFinalStats(snapshot.finalStats),
      // 旧セーブには無い（＝タイプ別スコアの合計を使う）
      finalTotalScore:
        typeof snapshot.finalTotalScore === "number"
          ? Math.max(0, Math.round(snapshot.finalTotalScore))
          : null,
      finalKind: snapshot.finalKind === "quartet" ? "quartet" : "finale",
    });
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
    setFinalMode,
    setFinalStat,
    setFinalKind,
    setFinalTotalScore,
    setPlan,
    remapTypes,
    replaceAll,
    loaded: true,
  };
}
