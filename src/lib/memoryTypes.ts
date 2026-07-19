/**
 * メモリー設定画面のデータ型と定数。
 *
 * アビリティ = 属性(Vo/Da/Vi/Pポイント/回復) + 値。
 * 回復だけは「値」ではなく対象属性(Vo/Da/Vi)を選ぶ。
 */

export type AttrKey = "Vo" | "Da" | "Vi" | "P" | "回復";

export type Ability = {
  attr: AttrKey;
  /** Vo/Da/Vi: "+2.8%" など, P: "+30" など, 回復: 対象属性 "Vo"|"Da"|"Vi" */
  value: string;
};

/** プランは4種類。「スキルから選択」は区分ではなく、スキルごとに所属プランが決まる */
export type PlanKey = "共通" | "センス" | "ロジック" | "アノマリー";

export type Memory = {
  id: string;
  plan: PlanKey;
  /** スキルから選択した場合のスキル名（プランはそのスキルの所属プラン） */
  skillName?: string;
  /** 1〜3個。同一属性の重複なし */
  abilities: Ability[];
  /** テンプレメモリー(mem1〜3)は削除不可 */
  isTemplate?: boolean;
  /**
   * ロール追従メモリー: メイン1/メイン2のタイプに%、サブのタイプに固定値。
   * 計算ページのロール割当を変えると効果先のタイプが自動で変わる。
   * これを持つメモリーは abilities を空にして、計算時に resolveRoleMemory で展開する。
   */
  roleSpec?: { mainPct: number; subFlat: number };
};

export type MemorySet = {
  id: string;
  name: string;
  /** スロット4枚分のメモリーID（重複可） */
  memoryIds: string[];
};

/** アビリティの値の選択肢 */
export const ATTR_VALUES: Record<AttrKey, string[]> = {
  Vo: ["+1.4%", "+2.1%", "+2.8%", "+3.5%", "+10", "+15", "+20", "+25"],
  Da: ["+1.4%", "+2.1%", "+2.8%", "+3.5%", "+10", "+15", "+20", "+25"],
  Vi: ["+1.4%", "+2.1%", "+2.8%", "+3.5%", "+10", "+15", "+20", "+25"],
  P: ["+10", "+20", "+30", "+40"],
  回復: ["Vo", "Da", "Vi"],
};

export const ATTR_LIST: AttrKey[] = ["Vo", "Da", "Vi", "P", "回復"];

/** アビリティを表示順（Vo→Da→Vi→P→回復）に並べ替える */
export function sortAbilities(abilities: Ability[]): Ability[] {
  return [...abilities].sort(
    (a, b) => ATTR_LIST.indexOf(a.attr) - ATTR_LIST.indexOf(b.attr),
  );
}

/** 画面表示用ラベル（P はボタン等では「Pポイント」と表示） */
export const ATTR_LABEL: Record<AttrKey, string> = {
  Vo: "Vo",
  Da: "Da",
  Vi: "Vi",
  P: "Pポイント",
  回復: "回復",
};

/**
 * 属性カラー。Tailwind はクラス名を静的に検出するため、
 * 動的連結せず完全なクラス文字列で持つこと。
 */
export const ATTR_STYLES: Record<
  AttrKey,
  { chip: string; btnOn: string; btnOff: string; text: string }
> = {
  Vo: {
    chip: "bg-red-500 text-white",
    btnOn: "border-red-500 bg-red-500 text-white",
    btnOff: "border-red-200 bg-red-50 text-red-600 hover:bg-red-100",
    text: "text-red-600",
  },
  Da: {
    chip: "bg-blue-500 text-white",
    btnOn: "border-blue-500 bg-blue-500 text-white",
    btnOff: "border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100",
    text: "text-blue-600",
  },
  Vi: {
    chip: "bg-yellow-400 text-yellow-950",
    btnOn: "border-yellow-400 bg-yellow-400 text-yellow-950",
    btnOff: "border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-100",
    text: "text-yellow-600",
  },
  P: {
    chip: "bg-cyan-400 text-cyan-950",
    btnOn: "border-cyan-400 bg-cyan-400 text-cyan-950",
    btnOff: "border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100",
    text: "text-cyan-600",
  },
  回復: {
    chip: "bg-green-500 text-white",
    btnOn: "border-green-500 bg-green-500 text-white",
    btnOff: "border-green-200 bg-green-50 text-green-700 hover:bg-green-100",
    text: "text-green-600",
  },
};

/** グレーアウト（選択不可）時の値ボタン */
export const BTN_DISABLED =
  "border-slate-200 bg-slate-100 text-slate-300 cursor-not-allowed";

export const PLAN_LIST: PlanKey[] = ["共通", "センス", "ロジック", "アノマリー"];

/** プランの表示色（カードのアイコン背景・選択ボタン） */
export const PLAN_STYLES: Record<
  PlanKey,
  { icon: string; btnOn: string; btnOff: string; label: string }
> = {
  共通: {
    icon: "bg-slate-500",
    btnOn: "border-slate-600 bg-slate-600 text-white",
    btnOff: "border-slate-300 bg-white text-slate-600 hover:bg-slate-100",
    label: "共通",
  },
  センス: {
    icon: "bg-rose-500",
    btnOn: "border-rose-500 bg-rose-500 text-white",
    btnOff: "border-rose-200 bg-white text-rose-600 hover:bg-rose-50",
    label: "センス",
  },
  ロジック: {
    icon: "bg-emerald-500",
    btnOn: "border-emerald-500 bg-emerald-500 text-white",
    btnOff: "border-emerald-200 bg-white text-emerald-600 hover:bg-emerald-50",
    label: "ロジック",
  },
  アノマリー: {
    icon: "bg-violet-500",
    btnOn: "border-violet-500 bg-violet-500 text-white",
    btnOff: "border-violet-200 bg-white text-violet-600 hover:bg-violet-50",
    label: "アノマリー",
  },
};

/** 「スキルから選択」ボタン専用スタイル（プランではないので別枠） */
export const SKILL_PICKER_STYLE = {
  btnOn: "border-sky-500 bg-sky-500 text-white",
  btnOff: "border-sky-200 bg-white text-sky-600 hover:bg-sky-50",
};

/**
 * 「スキルから選択」モーダルに出す仮のスキル一覧。
 * 各スキルには所属プランが割り当てられている（値は仮。実データで差し替える）。
 */
export type PlaceholderSkill = { name: string; plan: PlanKey };

export const PLACEHOLDER_SKILLS: PlaceholderSkill[] = [
  { name: "アピールの基本", plan: "共通" },
  { name: "ポーズの基本", plan: "共通" },
  { name: "表現の基本", plan: "共通" },
  { name: "目線の基本", plan: "共通" },
  { name: "意識の基本", plan: "センス" },
  { name: "願いの力", plan: "ロジック" },
  { name: "祝福", plan: "ロジック" },
  { name: "光のステージ", plan: "センス" },
  { name: "デイドリーム", plan: "ロジック" },
  { name: "アドレナリン全開", plan: "アノマリー" },
  { name: "始まりの合図", plan: "センス" },
  { name: "ワンモアステップ", plan: "アノマリー" },
];

/** テンプレメモリー。ライブラリに常時表示され削除不可。 */
export const TEMPLATE_MEMORIES: Memory[] = [
  // ロール追従のパラボメモリー（メイン1/メイン2に%・サブに固定値。ロール切替に自動追従）
  {
    id: "tpl-role45",
    plan: "共通",
    skillName: "パラボ45点",
    abilities: [],
    isTemplate: true,
    roleSpec: { mainPct: 2.1, subFlat: 15 },
  },
  {
    id: "tpl-role60",
    plan: "共通",
    skillName: "パラボ60点",
    abilities: [],
    isTemplate: true,
    roleSpec: { mainPct: 2.8, subFlat: 20 },
  },
  {
    id: "tpl-role70",
    plan: "共通",
    skillName: "パラボ70点",
    abilities: [],
    isTemplate: true,
    roleSpec: { mainPct: 3.5, subFlat: 20 },
  },
  {
    id: "tpl-mem1",
    plan: "共通",
    abilities: [
      { attr: "Vo", value: "+2.8%" },
      { attr: "Da", value: "+2.8%" },
    ],
    isTemplate: true,
  },
  {
    id: "tpl-mem2",
    plan: "センス",
    abilities: [
      { attr: "Vo", value: "+10" },
      { attr: "P", value: "+30" },
    ],
    isTemplate: true,
  },
  {
    id: "tpl-mem3",
    plan: "ロジック",
    abilities: [
      { attr: "回復", value: "Vo" },
      { attr: "Vi", value: "+3.5%" },
    ],
    isTemplate: true,
  },
];

/** スロットの最大枚数 */
export const SLOT_SIZE = 4;
