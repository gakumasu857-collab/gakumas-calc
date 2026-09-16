/**
 * N.I.AのチャレンジPアイテム（プロデュース開始前に3枠選ぶ。マスターは実質3枠すべて使える）。
 * 計算に使うのは各アイテムの「獲得ボーナス」（%）だけ:
 *   オーディションボーナスのステ上昇（素点）に掛かるパラボで、その上に通常のパラボ%が掛かる
 *   （2025-12-26 の調整以降。素点 → 素点＋floor(素点×獲得ボーナス) → さらに通常パラボ）。
 * Pポイント・体力回復・ライバルスコア増加は評価値に効かないので持たない。
 * アイテム名ではなく枠ごとに%を選ぶ。枠ごとの選択肢（0＝使わない）:
 *   1枠目 5/10/15%、2枠目 10/15/20%、3枠目 5/10/15/20%
 * 既定は各枠の最大（15%＋20%＋20%＝55%）。
 */
export const NIA_CHALLENGE_CHOICES: readonly (readonly number[])[] = [
  [0, 5, 10, 15],
  [0, 10, 15, 20],
  [0, 5, 10, 15, 20],
];

/** 3枠それぞれの獲得ボーナス%（順に1枠目・2枠目・3枠目） */
export type NiaChallenge = [number, number, number];

export const NIA_CHALLENGE_MAX: NiaChallenge = [15, 20, 20];

/** 保存値の正規化（無い・壊れている・選択肢に無い値は既定＝最大に戻す） */
export function normalizeNiaChallenge(raw: unknown): NiaChallenge {
  const arr = Array.isArray(raw) ? raw : [];
  return NIA_CHALLENGE_MAX.map((max, i) => {
    const v = arr[i];
    return typeof v === "number" && NIA_CHALLENGE_CHOICES[i].includes(v) ? v : max;
  }) as NiaChallenge;
}

/** 3枠の合計%（オーディションの素点に掛かる率） */
export function niaChallengeTotal(c: NiaChallenge): number {
  return c[0] + c[1] + c[2];
}

export function isNiaChallengeMax(c: NiaChallenge): boolean {
  return c.every((v, i) => v === NIA_CHALLENGE_MAX[i]);
}

/** オーディションの素点に獲得ボーナスを乗せた値（切り捨て）。これに通常のパラボが掛かる */
export function niaChallengeApply(base: number, totalPct: number): number {
  return base + Math.floor(base * (Math.max(0, totalPct) / 100));
}

/**
 * ゲームのログに出るオーディションの上昇幅（獲得ボーナス＋パラボ込み）。
 * パラボ分はログの1回分の表示に合わせて「その回の上昇×%を切り捨て」（計算機全体のパラボ変換は合計に掛けて切り捨て）。
 */
export function niaAuditionRise(base: number, challengePct: number, paraboPct: number): number {
  const e = niaChallengeApply(base, challengePct);
  return e + Math.floor(e * (Math.max(0, paraboPct) / 100));
}

/**
 * ログの上昇幅から素点（獲得ボーナス・パラボ抜き）を逆算する。
 * f(g) は単調増加なので、f(g) <= rise を満たす最大の g を返す（作れない値は超えない側に寄せる）。
 */
export function niaAuditionBaseFromRise(rise: number, challengePct: number, paraboPct: number): number {
  if (rise <= 0) return 0;
  const rate = (1 + Math.max(0, challengePct) / 100) * (1 + Math.max(0, paraboPct) / 100);
  let g = Math.floor(rise / rate);
  while (g < 999 && niaAuditionRise(g + 1, challengePct, paraboPct) <= rise) g++;
  while (g > 0 && niaAuditionRise(g, challengePct, paraboPct) > rise) g--;
  return g;
}
