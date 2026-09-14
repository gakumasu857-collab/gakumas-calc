/**
 * 計算ページの「計算式・数値表」モーダル。
 * 評価値・スター性・SP率・最終ステータスの式を「式のカード」で見せ、下にシナリオの数値表を置く。
 * シナリオは上のチップで切り替えて読める（開いたときは今のシナリオ）。
 * 使い方・用語・操作のヒント・よくある質問はヘルプページ（/help）。
 */
import { useState } from "react";
import { BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import Modal from "@/components/Modal";
import { NumbersTables } from "@/components/calc/PlanEditDrawer";
import { SCENARIO_LABELS, type ScenarioKey } from "@/data/scenarios";

const SCENARIOS: ScenarioKey[] = ["hif", "niaMaster", "hatsuLegend"];

/** 式の中の1項（色で「何の値か」を分ける） */
function T({
  c = "slate",
  children,
}: {
  c?: "blue" | "violet" | "emerald" | "amber" | "slate" | "red";
  children: React.ReactNode;
}) {
  const C = {
    blue: "bg-blue-100 text-blue-900",
    violet: "bg-violet-100 text-violet-900",
    emerald: "bg-emerald-100 text-emerald-900",
    amber: "bg-amber-100 text-amber-900",
    slate: "bg-slate-200 text-slate-800",
    red: "bg-red-100 text-red-900",
  }[c];
  return (
    <span className={`inline-block rounded-md px-1.5 py-0.5 text-sm font-semibold leading-tight ${C}`}>
      {children}
    </span>
  );
}

/** 演算子（項の間） */
function Op({ children }: { children: React.ReactNode }) {
  return <span className="mx-1 text-sm font-bold text-slate-500">{children}</span>;
}

/** 式のカード: 見出し・式・補足 */
function Formula({
  title,
  formula,
  notes,
}: {
  title: string;
  formula: React.ReactNode;
  notes?: React.ReactNode[];
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3">
      <h4 className="mb-1.5 text-sm font-bold text-slate-900">{title}</h4>
      <div className="flex flex-wrap items-center gap-y-1.5 rounded-lg bg-slate-50 px-3 py-2 leading-relaxed">
        {formula}
      </div>
      {notes && notes.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-600">
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function CalcHelpModal({
  onClose,
  scenario = "hif",
}: {
  onClose: () => void;
  scenario?: ScenarioKey;
}) {
  const [view, setView] = useState<ScenarioKey>(scenario);
  return (
    <Modal title="計算式・数値表" onClose={onClose} widthClass="max-w-3xl">
      {/* シナリオ切り替え＋ヘルプへの導線 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-500">シナリオ</span>
        {SCENARIOS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setView(s)}
            className={`rounded-full px-3 py-1 text-xs font-bold transition ${
              view === s
                ? "bg-blue-600 text-white"
                : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            {SCENARIO_LABELS[s]}
          </button>
        ))}
        <Link
          to="/help"
          onClick={onClose}
          className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-blue-700 underline"
        >
          <BookOpen size={13} />
          使い方・用語・操作のヒントはヘルプページ
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        {view === "hif" && (
          <>
            <Formula
              title="評価値（H.I.F.）"
              formula={
                <>
                  <T c="blue">ステ合計（各3200まで）</T>
                  <Op>×</Op>
                  <T>2</T>
                  <Op>＋</Op>
                  <T c="violet">合計スター性</T>
                  <Op>×</Op>
                  <T>7.5</T>
                  <Op>＋</Op>
                  <T c="emerald">本戦R1・R2の点数換算</T>
                  <Op>−</Op>
                  <T>2000</T>
                </>
              }
              notes={["スター性の掛け算は小数点以下を切り捨て。本戦の点数換算は設定欄の本戦ラウンド点数から（区分線形）。"]}
            />
            <Formula
              title="合計スター性"
              formula={
                <>
                  <T c="violet">ワッペン</T>
                  <Op>＋</Op>
                  <T c="violet">レッスン</T>
                  <Op>＋</Op>
                  <T c="violet">選抜</T>
                  <Op>＋</Op>
                  <T c="violet">本戦（R1 180 ＋ R2 225）</T>
                </>
              }
              notes={[
                "ワッペン: 札（スキルカード）を1枚取るごとに★15、最大20発動。札＝プロデュースの「スキル獲得」＋編成サポカのスキル獲得分（前イベ・後イベ込み）。",
                "レッスン: 数値表の★（SPと非SPで異なり、小数は切り捨て）。選抜: スコアから近似式。",
              ]}
            />
            <Formula
              title="Pポイント（サポカ分）"
              formula={
                <>
                  <T c="amber">サポカの固定Pポイント</T>
                  <Op>＋</Op>
                  <T c="amber">前イベのPポイント</T>
                  <Op>＋</Op>
                  <T c="amber">レッスンPポイント率の換算</T>
                  <Op>＋</Op>
                  <T c="amber">タイプSPレッスンPポイント率の換算</T>
                </>
              }
              notes={[
                "画面の数字はサポカ由来の分だけ。実際の育成ではこれに加えて、選抜・本戦それぞれ開始時230（HIFボーナス200＋STEP3の30）、差し入れ80×5（うち1回は本戦）、レッスン（選抜30×6・本戦50×2）、メモリーのPポイントが入ります。",
              ]}
            />
          </>
        )}
        {view === "niaMaster" && (
          <>
            <Formula
              title="評価値（N.I.A.）"
              formula={
                <>
                  <T c="blue">ステ合計（各2600まで）</T>
                  <Op>×</Op>
                  <T>2.3</T>
                  <Op>＋</Op>
                  <T c="violet">ファン投票数の換算</T>
                </>
              }
              notes={[
                "ステの掛け算は小数点以下を切り捨て。投票数→評価値は区分線形（〜2万は×0.1、以降は段階的に倍率が下がり、14万超は 5,200＋超過分×0.03）。",
              ]}
            />
            <Formula
              title="ファン投票数"
              formula={
                <>
                  <T c="violet">営業</T>
                  <Op>＋</Op>
                  <T c="violet">1次・2次オーディション</T>
                  <Op>＋</Op>
                  <T c="violet">最終オーディション</T>
                  <Op>＋</Op>
                  <T c="violet">札2枚ごとに3,000票</T>
                </>
              }
              notes={[
                "営業は営業先と成功／大成功で決まり、1次・2次は手入力、最終は合計スコアから換算。札の奇数の最後の1枚は無効。",
                "オーディションのステ: 1次・2次は上がるステ（素点）を手入力。ゲームのログの上昇幅（パラボ込み）からの逆算もできる（上限は流行順位とバランス／特化で決まる。例: バランス1次 92/76/62）。最終はVo/Da/Viのスコアを流行順位別の式（区分線形）で換算（上限: バランス 172/142/116・特化 215/129/86）するか、ステを直接入力。流行順位＝そのタイプの審査基準ランク。",
                "オーディションの素点にはチャレンジPアイテムの獲得ボーナス（3枠の合計%。既定は各枠の最大＝+55%。設定欄の「チャレンジPアイテム」で調整）が掛かり、その上にパラボが掛かる（素点 → 素点＋切り捨て(素点×獲得ボーナス) → パラボ）。",
              ]}
            />
          </>
        )}
        {view === "hatsuLegend" && (
          <>
            <Formula
              title="評価値（初）"
              formula={
                <>
                  <T c="blue">ステ合計（各3000まで）</T>
                  <Op>×</Op>
                  <T>2.1</T>
                  <Op>＋</Op>
                  <T c="violet">最終順位分</T>
                  <Op>＋</Op>
                  <T c="emerald">中間スコア換算</T>
                  <Op>＋</Op>
                  <T c="emerald">最終スコア換算</T>
                </>
              }
              notes={[
                "ステの掛け算は小数点以下を切り捨て。最終順位分は1位1,700／2位900／3位500。スコア換算はどちらも区分線形（中間は20万で頭打ち）。",
              ]}
            />
            <Formula
              title="試験のステ上昇・レッスン"
              formula={
                <>
                  <T c="blue">中間: 1位80／2位40／3位20</T>
                  <Op>・</Op>
                  <T c="blue">最終: 1位160／2位80／3位40</T>
                </>
              }
              notes={[
                "試験は順位に応じて全タイプ一律に上がる（スコア分配はなし）。",
                "レッスンは、レッスン中に出した点数がそのまま踏んだタイプの素ステ（上限＝パーフェクト）。クリアライン（数値表の「クリア」）を超えた分は残り2タイプにも同じだけ入る。どちらもパラボが掛かる。",
              ]}
            />
          </>
        )}

        {/* 共通 */}
        <Formula
          title="最終ステータス（タイプごと）"
          formula={
            <>
              <T c="slate">授業{view === "niaMaster" ? "・営業" : ""}</T>
              <Op>＋</Op>
              <T c="slate">メモリー</T>
              <Op>＋</Op>
              <T c="slate">Pアイドル{view === "hif" ? "＋H.I.F.ボーナス（既定+100）" : ""}</T>
              <Op>＋</Op>
              <T c="blue">レッスン</T>
              <Op>＋</Op>
              <T c="blue">
                {view === "hif" ? "選抜" : view === "niaMaster" ? "オーディション" : "試験"}
              </T>
              <Op>＋</Op>
              <T c="amber">サポカ（効果量×発動回数）</T>
              <Op>＋</Op>
              <T c="red">パラボ変換</T>
            </>
          }
          notes={[
            `パラボ（%）はメモリー・Pアイドル・サポカ${view === "hif" ? "・H.I.F.ボーナス（既定+10%）" : ""}を全部合算してから1回で固定値に変換する（獲得ごとに切り捨て。「パラボ変換表」で確認できる）。`,
            `各タイプに上限あり（評価値の式のカッコ内${view === "hif" ? "。H.I.F.は3000＋本戦上限ボーナス、既定3200" : ""}）。溢れた分は評価値には入らない。`,
          ]}
        />
        <Formula
          title="SPレッスン率と踏み方の実現確率"
          formula={
            <>
              <T c="emerald">画面の「SPレッスン率上昇」（サポカ＋Pアイドル。H.I.F.はH.I.F.ボーナスの+5%込み）</T>
              <Op>＋</Op>
              <T c="emerald">表記外推定SP率（既定: H.I.F. 10%・N.I.A.と初 15%）</T>
            </>
          }
          notes={[
            "例: 表示 +71% なら実際は 81% として計算。",
            "実現確率＝SP踏みの日の「踏むタイプのSP率」を全部掛け合わせたもの。H.I.F.は2ndタイプ（サブ）の出現も掛ける: 踏むタイプ以外の2タイプのうち審査基準が高い方が75%・低い方が25%。N.I.A.と初のレッスンにはサブが無いのでSP率どおり。",
          ]}
        />
        <Formula
          title="体力"
          formula={
            <>
              <T c="slate">Pアイドルの体力</T>
              <Op>＋</Op>
              <T c="amber">サポカの最大体力上昇</T>
            </>
          }
        />
      </div>

      <h3 className="mb-2 mt-6 text-base font-bold text-slate-800">
        数値表（{SCENARIO_LABELS[view]}）
      </h3>
      <NumbersTables scenario={view} />

      <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
        ⚠ 自動探索の精度は保証しません。時間制限つきの近似探索のため、より良い編成を取りこぼすことがあります。
        ゲーム本体と仕様が異なる部分もあるので、参考値としてお使いください。
      </p>
    </Modal>
  );
}
