/**
 * 踏み方の局所探索（決定的な山登り）。
 *
 * 評価関数（evalOf）と時間上限（deadline）だけを受け取る純粋な探索で、
 * 何を評価しているか（ステ・編成など）は呼び出し側の責任。
 * 近傍は steppingAxes（＝踏み方の1箇所の変更）。乱数は使わない。
 */
import { steppingAxes, type Stepping } from "./stepping";

/** 山登りの最大パス数（1パス＝全軸の候補を一巡） */
const MAX_CLIMB_PASS = 5;

type Scored = { stepping: Stepping; score: number };
type EvalOf = (s: Stepping) => number;

/**
 * 山登り: 軸を1つずつ、より良い候補があれば置き換える。
 * 改善が無くなる（=局所最適）か、パス数の上限まで繰り返す。
 * deadline を過ぎたら次のパスに進まない（1パス目は必ず回す）。
 */
export function climbStepping(
  start: Stepping,
  startScore: number,
  evalOf: EvalOf,
  deadline: number,
): Scored {
  let current = start;
  let best = startScore;
  for (let pass = 0; pass < MAX_CLIMB_PASS; pass++) {
    if (pass > 0 && performance.now() > deadline) break;
    let improved = false;
    for (const axis of steppingAxes(current)) {
      // current は改善のたびに進むので、候補はその時点の current から作る
      for (const trial of axis.alternatives(current)) {
        const score = evalOf(trial);
        if (score > best + 1e-9) {
          current = trial;
          best = score;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return { stepping: current, score: best };
}
