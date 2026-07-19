/**
 * 踏み方の局所探索（焼きなまし法＋仕上げの山登り）。
 *
 * 評価関数（evalOf）と時間上限（deadline）だけを受け取る純粋な探索で、
 * 何を評価しているか（ステ・編成など）は呼び出し側の責任。
 * 近傍はどちらも steppingAxes（＝踏み方の1箇所）に統一している。
 */
import { randomNeighbor, steppingAxes, type Stepping } from "./stepping";

/** 焼きなまし法の反復回数（1シードあたり） */
const SA_ITERS = 400;
/** 焼きなましの初期温度・終端温度（幾何冷却）。目的値のスケールに合わせる */
const SA_T0 = 2500;
const SA_T1 = 5;
/** 仕上げ山登りの最大パス数 */
const MAX_CLIMB_PASS = 5;

export type Scored = { stepping: Stepping; score: number };
export type EvalOf = (s: Stepping) => number;

/**
 * 山登り: 軸を1つずつ、より良い候補があれば置き換える。
 * 改善が無くなる（=局所最適）か、パス数の上限まで繰り返す。
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

/**
 * 焼きなまし法: ランダムな近傍へ確率的に移動しながら最良を記録する。
 * 温度を下げつつ、悪化も一定確率で受け入れて局所解を脱出し、最後に山登りで詰める。
 */
export function annealStepping(
  start: Stepping,
  startScore: number,
  evalOf: EvalOf,
  deadline: number,
): Scored {
  let current = start;
  let currentScore = startScore;
  let best = start;
  let bestScore = startScore;
  for (let i = 0; i < SA_ITERS; i++) {
    if ((i & 63) === 0 && performance.now() > deadline) break;
    const temperature = SA_T0 * Math.pow(SA_T1 / SA_T0, i / (SA_ITERS - 1));
    const neighbor = randomNeighbor(current);
    const score = evalOf(neighbor);
    // 良くなれば必ず、悪くなっても温度に応じた確率で受け入れる
    if (
      score >= currentScore ||
      Math.random() < Math.exp((score - currentScore) / temperature)
    ) {
      current = neighbor;
      currentScore = score;
      if (score > bestScore) {
        best = neighbor;
        bestScore = score;
      }
    }
  }
  return climbStepping(best, bestScore, evalOf, deadline);
}
