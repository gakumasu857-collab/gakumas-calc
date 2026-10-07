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
  /** メモリーの名前（任意の自由入力。プランとは独立） */
  skillName?: string;
  /** 1〜3個。同一属性の重複なし */
  abilities: Ability[];
  /** テンプレメモリー（メインパラボ）は削除不可 */
  isTemplate?: boolean;
  /**
   * ロール追従メモリー: メイン1/メイン2のタイプに%、サブのタイプに固定値。
   * 計算ページのロール割当を変えると効果先のタイプが自動で変わる。
   * これを持つメモリーは abilities を空にして、計算時に resolveRoleMemory で展開する。
   */
  roleSpec?: { mainPct: number; subFlat: number };
};

/**
 * スロット（4枠）に入っているメモリーの中身。ライブラリのIDではなく中身そのものを持つので、
 * 保存していないメモリーでも計算に使える。sourceId は「どの保存メモリー／テンプレから入れたか」
 * （上書き保存の対象、一覧の「×n」バッジ）。中身を変えても sourceId は残す。
 */
export type SlotMemory = {
  plan: PlanKey;
  skillName?: string;
  abilities: Ability[];
  roleSpec?: Memory["roleSpec"];
  sourceId?: string;
};

export type MemorySet = {
  id: string;
  name: string;
  /** スロット4枚分の中身（保存したときのスナップショット。空枠は null） */
  memories: (SlotMemory | null)[];
  /** 旧形式（メモリーIDの配列）。読み込み時に memories へ変換する */
  memoryIds?: string[];
  /**
   * 計算ページのセーブデータから作られたセットはそのセーブID。
   * メモリーページでは「セーブデータ用」としてまとめて畳んで表示する。
   */
  saveId?: string;
};

/** アビリティの値の選択肢 */
export const ATTR_VALUES: Record<AttrKey, string[]> = {
  Vo: ["+1.4%", "+2.1%", "+2.8%", "+3.5%", "+10", "+15", "+20", "+25"],
  Da: ["+1.4%", "+2.1%", "+2.8%", "+3.5%", "+10", "+15", "+20", "+25"],
  Vi: ["+1.4%", "+2.1%", "+2.8%", "+3.5%", "+10", "+15", "+20", "+25"],
  P: ["+20", "+30", "+40", "+50"],
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

/** プランのゲーム内アイコン画像（public/plan-icons/。共通はFREE表記） */
export const PLAN_ICON_SRC: Record<PlanKey, string> = {
  共通: "/plan-icons/free.png",
  センス: "/plan-icons/sense.png",
  ロジック: "/plan-icons/logic.png",
  アノマリー: "/plan-icons/anomaly.png",
};

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

/** テンプレメモリー（メインパラボ）。枠の「メインパラボ」の選択肢として使う（保存したメモリーの一覧には出さない。2026-10-07）。削除不可 */
export const TEMPLATE_MEMORIES: Memory[] = [
  // ロール追従のパラボメモリー（メイン1/メイン2に%・サブに固定値。ロール切替に自動追従）
  {
    id: "tpl-role45",
    plan: "共通",
    skillName: "メインパラボ45点",
    abilities: [],
    isTemplate: true,
    roleSpec: { mainPct: 2.1, subFlat: 15 },
  },
  {
    id: "tpl-role60",
    plan: "共通",
    skillName: "メインパラボ60点",
    abilities: [],
    isTemplate: true,
    roleSpec: { mainPct: 2.8, subFlat: 20 },
  },
  {
    id: "tpl-role70",
    plan: "共通",
    skillName: "メインパラボ70点",
    abilities: [],
    isTemplate: true,
    roleSpec: { mainPct: 3.5, subFlat: 20 },
  },
];

/** 枠の「メインパラボ」の選択肢（テンプレから作る。点数は名前の「◯点」） */
export const MAIN_PARABO_OPTIONS: { id: string; points: number; mainPct: number; subFlat: number }[] =
  TEMPLATE_MEMORIES.filter((t) => t.roleSpec).map((t) => ({
    id: t.id,
    points: Number((t.skillName ?? "").match(/(\d+)点/)?.[1] ?? 0),
    mainPct: t.roleSpec!.mainPct,
    subFlat: t.roleSpec!.subFlat,
  }));

/** スロットの最大枚数 */
export const SLOT_SIZE = 4;

/** ライブラリ／テンプレのメモリーをスロットの中身としてコピーする（sourceId に元IDを残す） */
export function toSlotMemory(m: Memory): SlotMemory {
  return {
    plan: m.plan,
    skillName: m.skillName,
    abilities: m.abilities.map((a) => ({ ...a })),
    roleSpec: m.roleSpec ? { ...m.roleSpec } : undefined,
    sourceId: m.id,
  };
}

/** スロットの中身を表示・計算用の Memory にする（id は元IDか枠番号。roleSpec 持ちはテンプレ扱い） */
export function slotToMemory(s: SlotMemory, index: number): Memory {
  return {
    id: s.sourceId ?? `slot-${index}`,
    plan: s.plan,
    skillName: s.skillName,
    abilities: s.abilities,
    roleSpec: s.roleSpec,
    isTemplate: !!s.roleSpec,
  };
}

/** 4枠に揃える（不足は null、余りは切り捨て） */
export function padSlots(list: (SlotMemory | null)[]): (SlotMemory | null)[] {
  return Array.from({ length: SLOT_SIZE }, (_, i) => list[i] ?? null);
}

/** 旧形式（メモリーIDの配列）を中身に展開する。見つからないIDは飛ばして前に詰める */
export function slotsFromIds(ids: string[], pool: Memory[]): (SlotMemory | null)[] {
  const found = ids
    .map((id) => pool.find((m) => m.id === id))
    .filter((m): m is Memory => !!m)
    .map(toSlotMemory);
  return padSlots(found);
}

/** 中身が同じか（プラン・名前・アビリティ・roleSpec）。保存済みかどうかの判定に使う */
export function sameMemoryContent(
  a: Pick<Memory, "plan" | "skillName" | "abilities" | "roleSpec">,
  b: Pick<Memory, "plan" | "skillName" | "abilities" | "roleSpec">,
): boolean {
  const key = (m: typeof a) =>
    JSON.stringify([
      m.plan,
      m.skillName ?? "",
      sortAbilities(m.abilities).map((x) => `${x.attr}${x.value}`),
      m.roleSpec ? [m.roleSpec.mainPct, m.roleSpec.subFlat] : null,
    ]);
  return key(a) === key(b);
}

/** 4枠の中身が同じか（セットから入れたあとに枠を変えたかの判定。保存元のつながりは見ない） */
export function sameSlots(a: (SlotMemory | null)[], b: (SlotMemory | null)[]): boolean {
  for (let i = 0; i < SLOT_SIZE; i++) {
    const x = a[i] ?? null;
    const y = b[i] ?? null;
    if (!x || !y) {
      if (x !== y) return false;
      continue;
    }
    if (!sameMemoryContent(x, y)) return false;
  }
  return true;
}

/** アビリティとプランが同じか（名前は問わない）。保存時の「同じメモリーがもうある」判定に使う */
export function sameAbilities(
  a: Pick<Memory, "plan" | "abilities">,
  b: Pick<Memory, "plan" | "abilities">,
): boolean {
  const key = (m: typeof a) =>
    JSON.stringify([m.plan, sortAbilities(m.abilities).map((x) => `${x.attr}${x.value}`)]);
  return key(a) === key(b);
}
