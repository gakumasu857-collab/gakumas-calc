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
 * 2・3枠目はPアイドルのプランのアイテム、おまかせの1枠目は審査基準がいちばん高いタイプ（ランクの数字が小さい）のもの。
 * 計算ページ・点数表・開発用ハーネスで同じ決め方にするため共通化。
 */
export function hatsuChallengeFor(settings: {
  idol: string;
  pIdol: string;
  hatsuChallenge?: unknown;
}): HatsuChallengeResolved {
  const pMaster = findPIdolMaster(settings.idol, settings.pIdol);
  const ranks = IDOL_RANKS[settings.idol];
  const order: TypeKey[] = ["vocal", "dance", "visual"];
  const topType = ranks
    ? order.reduce((best, t) => (ranks[t] < ranks[best] ? t : best), order[0])
    : "vocal";
  return resolveHatsuChallenge(normalizeHatsuChallenge(settings.hatsuChallenge), {
    plan: hatsuPlanOf(pMaster?.plan),
    topType,
  });
}
