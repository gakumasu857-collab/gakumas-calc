/**
 * 計算ページのヘルプモーダル（操作のヒント・数値と計算式のまとめ・数値表）。
 * 使い方の流れ・用語・よくある質問はヘルプページ（/help）に移した。
 */
import { BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import Modal from "@/components/Modal";
import { NumbersTables } from "@/components/calc/PlanEditDrawer";
import type { ScenarioKey } from "@/data/scenarios";

const H = "mb-2 mt-6 text-base font-bold text-slate-800 first:mt-0";
const LI = "text-sm leading-relaxed text-slate-600";

export default function CalcHelpModal({
  onClose,
  scenario = "hif",
}: {
  onClose: () => void;
  scenario?: ScenarioKey;
}) {
  return (
    <Modal title="使い方・計算式ヘルプ" onClose={onClose} widthClass="max-w-3xl">
      {/* 使い方の流れ・用語・よくある質問はヘルプページ（図・画面つき） */}
      <Link
        to="/help"
        onClick={onClose}
        className="flex items-center justify-between gap-3 rounded-xl border-2 border-blue-300 bg-blue-50 px-4 py-3 text-slate-900 transition hover:bg-blue-100"
      >
        <span>
          <span className="block text-sm font-bold">使い方・用語・よくある質問はヘルプページへ</span>
          <span className="block text-xs text-slate-600">
            全体の流れ・画面つきの手順・プロデュースと発動回数の関係・データの保存の注意
          </span>
        </span>
        <BookOpen size={20} className="shrink-0 text-blue-600" />
      </Link>
      <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2.5 text-sm leading-relaxed text-amber-800">
        ⚠ <b>自動探索の精度は保証しません。</b>
        時間制限つきの近似探索のため、より良い編成を取りこぼすことがあります。
        ゲーム本体と仕様が異なる部分もあるので、参考値としてお使いください。
      </p>

      <h3 className={H}>操作のヒント</h3>
      <ul className="list-disc space-y-1.5 pl-5">
        <li className={LI}>
          <b>数値入力欄は右クリックでスライダー</b>が開きます（大きい数字向け）。
          スライダーはドラッグしたまま上下に離すと微調整（×1/10・×1/100）、
          ホイールで±1（Shift=±10、Ctrl=±100）。
        </li>
        <li className={LI}>
          <b>サポカ枠クリック</b>＝カード選択。選択画面で<b>凸・固定・BAN・レンタルNG</b>も変えられます（行の右のボタン）。
        </li>
        <li className={LI}>
          <b>アイドル画像クリック</b>＝Pアイドル選択、<b>画像右上の歯車</b>＝特訓・才能開花の設定。
        </li>
        <li className={LI}>
          <b>踏み方のチップ</b>は、大きい四角がメイン、右下の小さい印がサブ、薄い点線の枠がSPなし（通常レッスン）です。授業（営業）は順番どおり、
          選抜はタイプ別スコアの配分バーです。チップをクリックすると編集できます。
        </li>
        <li className={LI}>
          プロデュースの<b>【プラン】</b>（【センス】など）は、探索の条件「試験補助を強める」で
          アイテム評価をどのスタイル向けに見るかの判定に使われます。
        </li>
        <li className={LI}>
          右上の<b>「セーブデータ」</b>から、今の育成の状態をまるごと（シナリオ・アイドル・踏み方・
          メモリー4枚・サポカ編成・前イベ/後イベ設定・発動回数・所持状況）保存でき、読み込めば
          <b>評価値まで同じ状態に戻ります</b>。評価値の下の<b>「画像に出力」</b>で、今の計算を1枚の画像にできます。
        </li>
        <li className={LI}>
          <b>「パラボ変換表」</b>（「サポカ編成と踏み方」の開始時のステータスの右）で、
          パラメータボーナス%が今の踏み方で何点ぶんのステになるかを確認できます。
        </li>
        <li className={LI}>
          用語の横の <b>ⓘ</b> を押すと、その項目の説明が出ます。
        </li>
      </ul>

      <h3 className={H}>数値と計算式のまとめ（選択中のシナリオ）</h3>
      <ul className="list-disc space-y-1.5 pl-5">
        {scenario === "hif" && (
          <>
            <li className={LI}>
              <b>評価値</b>＝ ステ合計（各3200まで）×2 ＋ 合計スター性×7.5（小数点以下は切り捨て）
              ＋ 本戦ラウンド点数の評価値 − 2000。
            </li>
            <li className={LI}>
              <b>合計スター性</b>＝ ワッペン ＋ レッスン ＋ 選抜 ＋ 本戦（R1:180＋R2:225）。
              ワッペンは札（スキルカード）取得1枚につき★15、<b>最大20発動</b>。
              札 ＝ 発動回数セットの「スキル獲得」＋ 編成サポカのスキル獲得分（前イベ・後イベ込み）。
            </li>
            <li className={LI}>
              <b>Pポイント（サポカ分）</b>: 画面の数字はサポカ由来の分だけ
              （サポカの固定Pポイント ＋ 前イベのPポイント ＋ レッスンPポイント率の換算 ＋
              タイプSPレッスンPポイント率の換算）。
              <br />
              参考: 実際の育成ではこれに加えて、選抜・本戦それぞれ
              <b>開始時230</b>（HIFボーナス200＋STEP3の30）、差し入れ80×5（うち1回は本戦）、
              レッスン（選抜30×6・本戦50×2）、メモリーのPポイントが入ります。
            </li>
          </>
        )}
        {scenario === "niaMaster" && (
          <>
            <li className={LI}>
              <b>評価値</b>＝ ステ合計（各2600まで）×2.3（小数点以下は切り捨て）＋ ファン投票数換算。
              投票数→評価値は区分線形（〜2万は×0.1、以降は段階的に倍率が下がり、
              14万超は 5,200＋超過分×0.03）。
            </li>
            <li className={LI}>
              <b>ファン投票数</b>＝ 営業（営業先と成功/大成功で決まる）＋
              1次・2次オーディション（手入力）＋ 最終オーディション（合計スコアから換算）＋
              札（スキルカード）2枚取得ごとに3,000票（奇数の最後の1枚は無効）。
            </li>
            <li className={LI}>
              <b>オーディションのステ</b>: 1次・2次は上がるステを手入力
              （上限は流行順位とバランス/特化で決まる。例: バランス1次 92/76/62）。
              最終はVo/Da/Viそれぞれのスコアを流行順位別の式（区分線形）に当てはめて算出
              （上限: バランス 172/142/116・特化 215/129/86）。
              流行順位＝そのタイプの審査基準ランクです。
            </li>
          </>
        )}
        {scenario === "hatsuLegend" && (
          <>
            <li className={LI}>
              <b>評価値</b>＝ ステ合計（各3000まで）×2.1（小数点以下は切り捨て）＋
              最終順位分（1位1,700／2位900／3位500）＋
              中間スコア換算 ＋ 最終スコア換算（どちらも区分線形。中間は20万で頭打ち）。
            </li>
            <li className={LI}>
              <b>試験のステ上昇</b>＝ 順位に応じて全タイプ一律
              （中間: 1位80／2位40／3位20、最終: 1位160／2位80／3位40。スコア分配はなし）。
            </li>
            <li className={LI}>
              <b>レッスン</b>＝ クリアで選んだタイプに上昇、パーフェクトなら
              残り2タイプにも上昇（数値表参照）。
            </li>
          </>
        )}
        <li className={LI}>
          <b>体力</b>＝ Pアイドルの体力 ＋ サポカの最大体力上昇。
        </li>
        <li className={LI}>
          <b>SPレッスン率</b>＝ 画面の「SPレッスン率上昇」（サポカ＋Pアイドル＋5%。ゲーム内表示と同じ）＋
          表記外推定SP率（既定10%）。例: 表示 +71% なら実際は 81%。
          <b>踏み方の実現確率</b>＝ SP踏みの日は「踏むタイプのSP率」を全部掛け合わせたもの。
          H.I.F.は2ndタイプ（サブ属性）の出現も掛ける: 踏むタイプ以外の2タイプのうち
          審査基準が高い方が75%・低い方が25%で抽選される
          （N.I.A.と初のレッスンにはサブ属性が無いのでSP率どおり）。
        </li>
        <li className={LI}>
          <b>最終ステータス</b>＝ 授業{scenario === "niaMaster" ? "・営業" : ""} ＋ メモリー ＋
          Pアイドル{scenario === "hif" ? "（固定値＋100）" : ""} ＋ レッスン ＋
          {scenario === "hif" ? "選抜" : scenario === "niaMaster" ? "オーディション" : "試験"}
          ＋ サポカ（アビリティ効果量×発動回数）＋ パラメータボーナス変換
          （%は全ソース合算してから1回で変換
          {scenario === "hif" ? "。H.I.F.はパラボ+10%のボーナスあり" : ""}）。
        </li>
      </ul>

      <h3 className={H}>数値表（選択中のシナリオ）</h3>
      <div className="mt-2">
        <NumbersTables scenario={scenario} />
      </div>
    </Modal>
  );
}
