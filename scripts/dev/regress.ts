/**
 * 探索の回帰確認（開発用。アプリからは参照しない）。
 * 決まった5つの条件で全自動探索を回し、評価値と編成を出す。コードを直す前後で同じ数字なら
 * 「探索の結果は変わっていない」と言える（スプシのデータを更新したときは数字が動いてよい）。
 *
 * 実行: npm run check:regress
 *   （esbuild でまとめてから Node で動かす。@/ の別名と JSON の読み込みが要るため、Node で直接は動かない）
 * 1回およそ1分。ほかの重い処理と同時に回すと、時間で打ち切る段階があるので数十点ぶれることがある。
 *
 * ストアは localStorage を読むので、空の localStorage を用意して前提だけ書き込む
 * （＝各ストアの初回デフォルト: 全サポカ完凸・特訓6/開花4・メインパラボ60×4）。
 * devHarness の buildInput は H.I.F 用なので、N.I.A・初はそれぞれの踏み方の初期状態を足す。
 */
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

import { optimizeSteppingForSlots, runFullOptimize } from "@/lib/autoOptimize";
import { SUPPORT_CARD_DB } from "@/data/supportCardsDb";
import { buildInput } from "@/lib/devHarness";
import { loadHatsuState } from "@/lib/useHatsuSchedule";
import { loadNiaState } from "@/lib/useNiaSchedule";

/** 保存キーは card:<スプシのid> なので、表示は名前に戻す */
const NAME_BY_ID = new Map(SUPPORT_CARD_DB.map((c) => [c.id, c.name]));

type Case = { scenario: string; idol: string; pIdol: string; set: string };
const CASES: Case[] = [
  { scenario: "hif", idol: "花海咲季", pIdol: "学園生活", set: "set:センス花ロボ(黄)" },
  { scenario: "hif", idol: "月村手毬", pIdol: "Luna say maybe", set: "set:センス花ロボ(黄)" },
  { scenario: "hif", idol: "藤田ことね", pIdol: "世界一可愛い私", set: "set:ロジック花ロボ(黄)" },
  // N.I.A・初は、前から同じ条件（H.I.Fのテンプレ＋選抜1タイプ分配の指定）で測っている。数字を前回と比べるための固定条件
  { scenario: "niaMaster", idol: "花海咲季", pIdol: "学園生活", set: "set:センス花ロボ(黄)" },
  { scenario: "hatsuLegend", idol: "花海咲季", pIdol: "学園生活", set: "set:センス花ロボ(黄)" },
];

for (const c of CASES) {
  store.clear();
  localStorage.setItem("gakumas:scenario:v1", c.scenario);
  localStorage.setItem("gakumas:abilitySelectedSet:v1", c.set);
  localStorage.setItem("gakumas:calcSettings:v1", JSON.stringify({ idol: c.idol, pIdol: c.pIdol }));
  const hif = c.scenario === "hif";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const input: any = hif
    ? buildInput()
    : { ...buildInput(), nia: loadNiaState(), hatsu: loadHatsuState() };
  const res = runFullOptimize(hif ? input : { ...input, examPolicy: "single" })!;
  const plan = optimizeSteppingForSlots(input, res.slots)!;
  console.log(
    `${c.scenario} ${c.idol}: 評価値 ${res.rating} / 合計ステ ${Math.round(res.cappedSum)}` +
      ` / 踏み方だけ ${Math.round(plan.cappedSum)}`,
  );
  console.log(
    "  編成:",
    res.slots.map((s) => (NAME_BY_ID.get(s.id) ?? s.id) + (s.rental ? "*" : "")).join("、"),
  );
  if (res.hif) console.log("  選抜:", JSON.stringify(res.hif.examScores));
}
