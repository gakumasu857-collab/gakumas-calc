import {
  hatsuPlanOf,
  normalizeHatsuChallenge,
  resolveHatsuChallenge,
  type HatsuChallengeResolved,
} from "@/data/hatsuChallenge";
import { findPIdolMaster, IDOL_RANKS } from "./pIdol";
import type { TypeKey } from "./useCalcSettings";

/**
 * 計算ページの設定（アイドル・Pアイドル・初のチャレンジPアイテムの選択）から、計算に使うチャレンジPアイテムを決める。
 * 2・3枠目はPアイドルのプランのアイテム、おまかせの1枠目は subType（踏み方のサブのタイプ）のもの。
 * subType を渡さないとき（レッスン上限の合計だけ要るとき）は審査基準がいちばん低いタイプ（ランクの数字が大きい）で仮に決める
 * （おまかせの1枠目はどのタイプでも上限+30 なので合計は変わらない）。
 * 計算ページ・点数表・開発用ハーネスで同じ決め方にするため共通化。
 */
export function hatsuChallengeFor(
  settings: { idol: string; pIdol: string; hatsuChallenge?: unknown },
  subType?: TypeKey,
): HatsuChallengeResolved {
  const pMaster = findPIdolMaster(settings.idol, settings.pIdol);
  const ranks = IDOL_RANKS[settings.idol];
  const order: TypeKey[] = ["vocal", "dance", "visual"];
  const lowType = ranks
    ? order.reduce((low, t) => (ranks[t] > ranks[low] ? t : low), order[0])
    : "visual";
  return resolveHatsuChallenge(normalizeHatsuChallenge(settings.hatsuChallenge), {
    plan: hatsuPlanOf(pMaster?.plan),
    autoType: subType ?? lowType,
  });
}
