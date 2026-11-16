import type { TypeKey } from "@/lib/useCalcSettings";

/**
 * 定期公演『初』（レジェンド）のチャレンジPアイテム。プロデュース開始前に3枠から1つずつ選ぶ（オーナー提供 2026-11-16）。
 * 計算に入れるのはステータスとレッスン上限だけ（オーナー指定）:
 * - capBonus: レッスン上限の増加（+20／+30）。3枠の合計がレジェンドレッスンのパーフェクトの値に効く
 *   （scenarios.ts の HATSU_LESSONS は合計 +90 のときの値。合計が少なければその分だけパーフェクトが下がる）
 * - pct: パラメータボーナス%（1枠目の教科書。そのタイプ +8.5%）
 * - flat: パラメータ上昇の固定値（1枠目のボイスレコーダーなど。+15 × プロデュース中5回 = +75。
 *   条件「所持スキルカード17枚以上」は満たす前提。ほかのPアイテムの上昇と同じくパラボは掛けない）
 * ライバルのスコア増加・パラメータ上昇量増加（レッスン・試験開始時）・好調/集中などのバフ・スキルカードの獲得は持たない。
 * 2枠目・3枠目はプランごとのアイテム（効くのはレッスン上限だけ）。
 */
export type HatsuChallengeItem = {
  /** 保存に使う名前（色まで含めて一意） */
  id: string;
  slot: 1 | 2 | 3;
  /** 共通（1枠目）／センス／ロジック／アノマリー */
  plan: "共通" | "センス" | "ロジック" | "アノマリー";
  capBonus: 20 | 30;
  /** 【高難易度】のアイテム */
  hard: boolean;
  pct?: { type: TypeKey; value: number };
  flat?: { type: TypeKey; value: number };
};

const item = (
  id: string,
  slot: 1 | 2 | 3,
  plan: HatsuChallengeItem["plan"],
  capBonus: 20 | 30,
  extra: Partial<Pick<HatsuChallengeItem, "pct" | "flat">> = {},
): HatsuChallengeItem => ({ id, slot, plan, capBonus, hard: capBonus === 30, ...extra });

/** 1枠目の教科書のパラボ%・ボイスレコーダーなどの固定値（+15 × 5回） */
const TEXTBOOK_PCT = 8.5;
const RECORDER_FLAT = 15 * 5;

export const HATSU_CHALLENGE_ITEMS: readonly HatsuChallengeItem[] = [
  // ---- 1枠目（共通） ----
  item("ボーカルの教科書", 1, "共通", 20, { pct: { type: "vocal", value: TEXTBOOK_PCT } }),
  item("ダンスの教科書", 1, "共通", 20, { pct: { type: "dance", value: TEXTBOOK_PCT } }),
  item("ビジュアルの教科書", 1, "共通", 20, { pct: { type: "visual", value: TEXTBOOK_PCT } }),
  item("ボイスレコーダー", 1, "共通", 30, { flat: { type: "vocal", value: RECORDER_FLAT } }),
  item("ポータブルスピーカー", 1, "共通", 30, { flat: { type: "dance", value: RECORDER_FLAT } }),
  item("メイクアップミラー", 1, "共通", 30, { flat: { type: "visual", value: RECORDER_FLAT } }),
  // ---- 2枠目・3枠目（センス） ----
  item("初星ハット（緑）", 2, "センス", 20),
  item("初星ボールペン（緑）", 2, "センス", 20),
  item("初星ハット（紫）", 2, "センス", 20),
  item("初星ボールペン（紫）", 2, "センス", 20),
  item("はつぼし手鏡（緑）", 2, "センス", 30),
  item("プロデュース本（緑）", 2, "センス", 30),
  item("はつぼし手鏡（紫）", 2, "センス", 30),
  item("プロデュース本（紫）", 2, "センス", 30),
  item("初星マーカー（橙）", 3, "センス", 20),
  item("初星ステッカー（橙）", 3, "センス", 20),
  item("初星ネクタイ（橙）", 3, "センス", 30),
  item("初星名刺ケース（橙）", 3, "センス", 30),
  // ---- 2枠目・3枠目（ロジック） ----
  item("リップグロス（黄）", 2, "ロジック", 20),
  item("初星ストラップ（黄）", 2, "ロジック", 20),
  item("リップグロス（赤）", 2, "ロジック", 20),
  item("初星ストラップ（赤）", 2, "ロジック", 20),
  item("初星チャーム（黄）", 2, "ロジック", 30),
  item("アイドルレポ（黄）", 2, "ロジック", 30),
  item("初星チャーム（赤）", 2, "ロジック", 30),
  item("アイドルレポ（赤）", 2, "ロジック", 30),
  item("初星マーカー（白）", 3, "ロジック", 20),
  item("初星ステッカー（白）", 3, "ロジック", 20),
  item("初星ネクタイ（白）", 3, "ロジック", 30),
  item("初星名刺ケース（白）", 3, "ロジック", 30),
  // ---- 2枠目・3枠目（アノマリー） ----
  item("初星ボトル（水色）", 2, "アノマリー", 20),
  item("バインダー（水色）", 2, "アノマリー", 20),
  item("初星ボトル（ピンク）", 2, "アノマリー", 20),
  item("バインダー（ピンク）", 2, "アノマリー", 20),
  item("イヤリング（水色）", 2, "アノマリー", 30),
  item("業界レポ（水色）", 2, "アノマリー", 30),
  item("イヤリング（ピンク）", 2, "アノマリー", 30),
  item("業界レポ（ピンク）", 2, "アノマリー", 30),
  item("初星マーカー（黒）", 3, "アノマリー", 20),
  item("初星ステッカー（黒）", 3, "アノマリー", 20),
  item("初星ネクタイ（黒）", 3, "アノマリー", 30),
  item("初星名刺ケース（黒）", 3, "アノマリー", 30),
];

const ITEM_BY_ID = new Map(HATSU_CHALLENGE_ITEMS.map((i) => [i.id, i]));

/** レジェンドレッスンの表（HATSU_LESSONS）がどのレッスン上限の合計で作られているか */
export const HATSU_TABLE_CAP_BONUS = 90;

/** 3枠の選択（アイテムの id。null＝おまかせ＝下の既定） */
export type HatsuChallenge = [string | null, string | null, string | null];
export const HATSU_CHALLENGE_DEFAULT: HatsuChallenge = [null, null, null];

/** 保存値の正規化（無い・壊れている・知らない名前・枠違いは おまかせ に戻す） */
export function normalizeHatsuChallenge(raw: unknown): HatsuChallenge {
  const arr = Array.isArray(raw) ? raw : [];
  return [0, 1, 2].map((i) => {
    const v = arr[i];
    return typeof v === "string" && ITEM_BY_ID.get(v)?.slot === i + 1 ? v : null;
  }) as HatsuChallenge;
}

/** Pアイドルのプラン（センス／ロジック／アノマリー以外・未選択は null＝全部のプランから選べる） */
export type HatsuPlan = "センス" | "ロジック" | "アノマリー" | null;
export function hatsuPlanOf(plan: string | null | undefined): HatsuPlan {
  return plan === "センス" || plan === "ロジック" || plan === "アノマリー" ? plan : null;
}

/** その枠で選べるアイテム（2・3枠目はPアイドルのプランのもの。プランが分からなければ全部） */
export function hatsuChallengeChoices(slot: 1 | 2 | 3, plan: HatsuPlan): HatsuChallengeItem[] {
  return HATSU_CHALLENGE_ITEMS.filter(
    (i) => i.slot === slot && (slot === 1 || plan === null || i.plan === plan),
  );
}

export type HatsuChallengeResolved = {
  /** 実際に計算に使う3つ（おまかせ・プラン違いは決めたもの） */
  items: [HatsuChallengeItem, HatsuChallengeItem, HatsuChallengeItem];
  /** 選んだもの（null＝おまかせ） */
  picked: HatsuChallenge;
  /** レッスン上限の合計 */
  capBonus: number;
  /** タイプごとのパラボ%・固定値 */
  pct: Record<TypeKey, number>;
  fixed: Record<TypeKey, number>;
};

/**
 * 選択を計算に使える形にする。
 * - おまかせ（null）: 1枠目は審査基準がいちばん高いタイプの【高難易度】（+15×5）、2・3枠目はプランの最初の【高難易度】
 *   （どれも上限+30＝今までの計算と同じ合計+90）
 * - 2・3枠目でPアイドルのプランに無いアイテムを選んでいた（Pアイドルを変えた）ときは、同じ上限のプランのアイテムに読み替える
 */
export function resolveHatsuChallenge(
  picked: HatsuChallenge,
  opts: { plan: HatsuPlan; topType: TypeKey },
): HatsuChallengeResolved {
  const pick = (slot: 1 | 2 | 3): HatsuChallengeItem => {
    const choices = hatsuChallengeChoices(slot, opts.plan);
    const chosen = picked[slot - 1] ? ITEM_BY_ID.get(picked[slot - 1]!) : undefined;
    if (chosen && choices.includes(chosen)) return chosen;
    if (chosen) return choices.find((c) => c.capBonus === chosen.capBonus) ?? choices[0];
    if (slot === 1) return choices.find((c) => c.flat?.type === opts.topType) ?? choices[0];
    return choices.find((c) => c.hard) ?? choices[0];
  };
  const items = [pick(1), pick(2), pick(3)] as HatsuChallengeResolved["items"];
  const pct: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
  const fixed: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
  for (const i of items) {
    if (i.pct) pct[i.pct.type] += i.pct.value;
    if (i.flat) fixed[i.flat.type] += i.flat.value;
  }
  return {
    items,
    picked,
    capBonus: items.reduce((s, i) => s + i.capBonus, 0),
    pct,
    fixed,
  };
}

/** アイテムの計算に入る効果の短い説明（画面用） */
export function hatsuChallengeEffectText(i: HatsuChallengeItem): string {
  const type = (t: TypeKey) => (t === "vocal" ? "Vo" : t === "dance" ? "Da" : "Vi");
  const parts = [`レッスン上限+${i.capBonus}`];
  if (i.pct) parts.push(`${type(i.pct.type)}パラボ+${i.pct.value}%`);
  if (i.flat) parts.push(`${type(i.flat.type)}+15×5回`);
  return parts.join("・");
}
