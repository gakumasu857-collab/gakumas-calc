/**
 * 開発検証用ハーネス（アプリの画面からは参照しない）。
 * Vite dev のブラウザコンソールから dynamic import して、
 * 全自動最適化の再現実験・固定編成の評価値測定に使う:
 *
 *   const h = await import("/src/lib/devHarness.ts");
 *   h.runOnce();                 // 全自動最適化を1回（現在のlocalStorage設定で）
 *   h.optimizeFor([...6枚の名前]); // 編成固定で踏み方だけ最適化→評価値
 *   h.evalCombo({ names, lessons, classTypes, examScores }); // 完全固定の評価値
 *
 * ストアはlocalStorageを直接読む（React非依存）。値が無いときは
 * 各ストアの初回デフォルト（全カード完凸・特訓6/開花4・メインパラボ60×4）に合わせる。
 */
import { abilityMax, DEFAULT_SETS } from "@/data/abilityCounts";
import type { AbilityName } from "@/data/constants";
import { CLASSES, EXAMS, LESSONS } from "@/data/schedule";
import { SCENARIO_CAPS, type ScenarioKey } from "@/data/scenarios";
import {
  OptimizeEngine,
  optimizeSteppingForSlots,
  runFullOptimize,
  type AutoOptimizeInput,
} from "./autoOptimize";
import { examStyleTags } from "./formation";
import { TEMPLATE_MEMORIES, type Memory } from "./memoryTypes";
import type { Stepping } from "./optimize/stepping";
import { computePIdolStats, findPIdolMaster, IDOL_RANKS } from "./pIdol";
import { manualCountFromSet } from "./sheetContext";
import {
  DEFAULT_SETTINGS,
  type CalcSettings,
  type TypeKey,
} from "./useCalcSettings";
import { typeRanksOf } from "./useCalcResult";
import type { ExamScores, LessonPick } from "./useSchedule";

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // 破損データは無視
  }
  return fallback;
}

type HifState = {
  lessons: LessonPick[];
  classTypes: TypeKey[];
  examScores: ExamScores[];
};

function loadHifState(): HifState {
  const stored = loadJson<Partial<HifState>>("gakumas:schedule:v1", {});
  const each = [5000, 50000, 140000];
  return {
    lessons:
      stored.lessons ??
      LESSONS.map(() => ({ main: "vocal", sub: "dance", sp: true })),
    classTypes: stored.classTypes ?? CLASSES.map(() => "visual" as TypeKey),
    examScores:
      stored.examScores ??
      EXAMS.map((_, i) => ({
        vocal: each[i] ?? 0,
        dance: each[i] ?? 0,
        visual: each[i] ?? 0,
      })),
  };
}

/** localStorage の各ストアから AutoOptimizeInput を組み立てる（buildAutoOptimizeInput のRAM版） */
export function buildInput(): AutoOptimizeInput {
  const settings: CalcSettings = {
    ...DEFAULT_SETTINGS,
    ...loadJson<Partial<CalcSettings>>("gakumas:calcSettings:v1", {}),
  };
  const scenario = (localStorage.getItem("gakumas:scenario:v1") ??
    "hif") as ScenarioKey;
  const hif = loadHifState();

  // メモリー（デフォルト: メインパラボ60×4）
  const library = loadJson<Memory[]>("gakumas:memories:v1", []);
  const selected = loadJson<string[]>("gakumas:memorySelection:v1", [
    "tpl-role60",
    "tpl-role60",
    "tpl-role60",
    "tpl-role60",
  ]);
  const findMemory = (id: string) =>
    library.find((m) => m.id === id) ??
    TEMPLATE_MEMORIES.find((m) => m.id === id);
  const memories = selected.map((id) => findMemory(id));

  // Pアイドル（ストア未初期化なら特訓6・開花4）
  const pMaster = findPIdolMaster(settings.idol, settings.pIdol);
  const pOwnership = loadJson<Record<string, { kunren: number; kaika: number }>>(
    "gakumas:pIdols:v1",
    {},
  );
  const own = pMaster
    ? (pOwnership[pMaster.key] ?? { kunren: 6, kaika: 4 })
    : null;
  const pStats =
    pMaster && own
      ? computePIdolStats(pMaster.growthTag, own.kunren, own.kaika)
      : null;

  // 発動回数セット（ユーザーセットは未対応・テンプレのみ）
  const setId = localStorage.getItem("gakumas:abilitySelectedSet:v1");
  const set = DEFAULT_SETS.find((s) => s.id === setId) ?? null;
  const overrides = loadJson<
    Record<string, Partial<Record<AbilityName, number>>>
  >("gakumas:abilityCountOverrides:v1", {});
  const manual = manualCountFromSet(
    set
      ? (key) =>
          Math.min(
            abilityMax(key),
            Math.max(0, overrides[set.id]?.[key] ?? set.defaults[key] ?? 0),
          )
      : null,
  );

  // 前イベ・後イベ設定（計算ページ専用ストア）
  const eventMap = loadJson<Record<string, Record<string, unknown>>>(
    "gakumas:calcEventCounts:v1",
    {},
  );

  // 所持凸（ストア未初期化なら全カード完凸）
  const levelsRaw = localStorage.getItem("gakumas:ownedLevels:v1");
  const levels = levelsRaw
    ? (JSON.parse(levelsRaw) as Record<string, number>)
    : null;
  const getLevel = (id: string) => (levels ? (levels[id] ?? -1) : 4);

  // BAN・固定・レンタルNG
  const flagMap = loadJson<
    Record<string, { ban?: boolean; pin?: boolean; rentalNg?: boolean }>
  >("gakumas:cardFlags:v1", {});
  const collect = (key: "ban" | "pin" | "rentalNg") =>
    new Set(
      Object.entries(flagMap)
        .filter(([, f]) => f[key])
        .map(([id]) => id),
    );

  return {
    scenario,
    hif,
    nia: {
      lessons: [],
      sales: [],
      auditions: [],
      auditionVotes: [],
      finalScores: { vocal: 0, dance: 0, visual: 0 },
    },
    hatsu: {
      lessons: [],
      classTypes: [],
      midRank: 1,
      finalRank: 1,
      midScore: 0,
      finalScore: 0,
    },
    memories,
    pStats,
    plan: pMaster?.plan ?? null,
    statCap: SCENARIO_CAPS[scenario],
    tag: IDOL_RANKS[settings.idol]?.tag === "特化" ? "skew" : "flat",
    ranks: typeRanksOf(settings.idol),
    manual,
    eventCounts: (id: string) =>
      eventMap[id] as ReturnType<
        NonNullable<AutoOptimizeInput["eventCounts"]>
      >,
    getLevel,
    flags: {
      banned: collect("ban"),
      pinned: collect("pin"),
      rentalNg: collect("rentalNg"),
    },
    spMin: settings.spMin,
    eventBudget: settings.eventBudget.enabled
      ? { pre: settings.eventBudget.pre, post: settings.eventBudget.post }
      : undefined,
    typeRatio: settings.typeRatio.enabled
      ? {
          vocal: settings.typeRatio.vocal,
          dance: settings.typeRatio.dance,
          visual: settings.typeRatio.visual,
        }
      : undefined,
    examAssist: settings.examAssist,
    examStyleTags: examStyleTags(set?.plan ?? null),
    noStageItems: settings.noStageItems,
    minStats: settings.minStats,
    maxStats: settings.maxStats,
    round1: settings.round1,
    round2: settings.round2,
  };
}

const nameToId = (name: string) => `card:${name}`;
const idToName = (id: string) => id.replace(/^card:/, "");

/** コンソール実験用（クラス本体は autoOptimize.ts） */
export { OptimizeEngine } from "./autoOptimize";

/** 全自動最適化を1回まわして要約を返す */
export function runOnce() {
  const res = runFullOptimize(buildInput());
  if (!res) return null;
  return {
    rating: res.rating,
    cappedSum: Math.round(res.cappedSum),
    names: res.slots.map((s) => idToName(s.id) + (s.rental ? "(R)" : "")),
    lessons: res.hif?.lessons.map(
      (l) => `${l.main ?? "―"}/${l.sub}${l.sp ? "■" : ""}`,
    ),
    exams: res.hif?.examScores.map(
      (e) => `Vo${e.vocal}/Da${e.dance}/Vi${e.visual}`,
    ),
    evaluated: res.evaluated,
    elapsedMs: Math.round(res.elapsedMs),
    phaseScores: res.debug?.phaseScores,
  };
}

export type ComboSpec = {
  names: string[];
  lessons: LessonPick[];
  classTypes: TypeKey[];
  examScores: ExamScores[];
  /** レンタル扱いにするカード名（省略時は全部所持凸） */
  rentalName?: string;
};

/** 編成・踏み方を完全固定して、表示と同じ評価値を計算する */
export function evalCombo(spec: ComboSpec) {
  const input = buildInput();
  const engine = new OptimizeEngine(input);
  const stepping: Stepping = {
    kind: "hif",
    lessons: spec.lessons,
    classTypes: spec.classTypes,
    examScores: spec.examScores,
  };
  const slots = spec.names.map((n) => ({
    id: nameToId(n),
    rental: n === spec.rentalName,
  }));
  const ectx = engine.buildEctx(stepping);
  const { cappedSum, stats, members } = engine.preciseObjective(
    slots,
    ectx,
    true,
  );
  const rating = engine.fullRating(stepping, cappedSum, members);
  return {
    rating: Math.round(rating),
    cappedSum: Math.round(cappedSum),
    stats: {
      vocal: Math.round(stats.vocal),
      dance: Math.round(stats.dance),
      visual: Math.round(stats.visual),
    },
    memberCount: members.length,
  };
}

/** 編成だけ固定して踏み方を最適化し、その評価値を返す */
export function optimizeFor(names: string[], rentalName?: string) {
  const input = buildInput();
  const slots = names.map((n) => ({
    id: nameToId(n),
    rental: n === rentalName,
  }));
  const res = optimizeSteppingForSlots(input, slots);
  if (!res?.hif) return null;
  const e = evalCombo({
    names,
    lessons: res.hif.lessons,
    classTypes: res.hif.classTypes,
    examScores: res.hif.examScores,
    rentalName,
  });
  return {
    ...e,
    lessons: res.hif.lessons.map(
      (l) => `${l.main ?? "―"}/${l.sub}${l.sp ? "■" : ""}`,
    ),
    classTypes: res.hif.classTypes.join(","),
    exams: res.hif.examScores.map(
      (e2) => `Vo${e2.vocal}/Da${e2.dance}/Vi${e2.visual}`,
    ),
  };
}
