/**
 * 画面共通の見た目（ボタン・入力欄・注記・チップ）。
 * 色の意味を固定する: 青＝押す／黄＝未設定・注意／緑＝条件OK／赤＝条件NG・上限超え。
 * 文字は 3 段階（見出し text-sm font-bold ／ 本文 text-sm ／ 注記 text-xs text-slate-500）。
 */
import type { TypeKey } from "@/lib/useCalcSettings";

/** 主役ボタン（1画面に1つ） */
export const BTN_PRIMARY =
  "inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50";
/** 脇役ボタン（白地・枠線） */
export const BTN_SECONDARY =
  "inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40";
/** 目立たせる操作ボタン（青地・枠線・影で「ここを押す」と分かるように） */
export const BTN_ACTION =
  "inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800 shadow-sm transition hover:border-blue-400 hover:bg-blue-100 hover:shadow active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40";
/** 控えめな文字ボタン */
export const BTN_GHOST =
  "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800";
/** 入力欄・選択欄（ボタン型の欄もこれで統一する） */
export const FIELD =
  "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500";
/** 注記（本文の下に添える説明。長い説明は Hint（ⓘ）へ） */
export const NOTE = "text-xs leading-relaxed text-slate-500";

export const CHIP_OK =
  "inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700";
export const CHIP_NG =
  "inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700";
export const CHIP_WARN =
  "inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700";

/** タイプの淡い色チップ */
export const TYPE_CHIP: Record<TypeKey, string> = {
  vocal: "bg-red-100 text-red-700",
  dance: "bg-blue-100 text-blue-700",
  visual: "bg-yellow-100 text-yellow-700",
};
/** タイプの濃い色チップ（踏み方の並びなど） */
export const TYPE_SOLID: Record<TypeKey, string> = {
  vocal: "bg-red-500 text-white",
  dance: "bg-blue-500 text-white",
  visual: "bg-yellow-400 text-yellow-950",
};
export const TYPE_SHORT: Record<TypeKey, "Vo" | "Da" | "Vi"> = {
  vocal: "Vo",
  dance: "Da",
  visual: "Vi",
};
