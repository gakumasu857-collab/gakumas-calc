/**
 * 計算ページのヘルプモーダル。
 * 使い方の流れ・操作のヒント・数値と計算式のまとめ・数値表（レッスン/選抜/本戦）を1か所に集約。
 */
import Modal from "@/components/Modal";
import { NumbersTables } from "@/components/calc/PlanEditDrawer";

const H = "mb-1 mt-4 text-sm font-bold text-slate-800 first:mt-0";
const P = "text-xs leading-relaxed text-slate-600";
const LI = "text-xs leading-relaxed text-slate-600";

export default function CalcHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="使い方・計算式ヘルプ" onClose={onClose} widthClass="max-w-3xl">
      <h3 className={H}>使い方の流れ</h3>
      <ol className="list-decimal space-y-1 pl-5">
        <li className={LI}>
          <b>所持状況入力</b>ページでサポカ・Pアイドルの所持と凸を入力する
          （「画面キャプチャで所持入力（β）」でゲーム画面から自動読み取りもできます）。
        </li>
        <li className={LI}>
          計算ページで<b>育成シナリオ・アイドル（Pアイドル）・育成（発動回数セット）・メモリー</b>
          を設定する。
        </li>
        <li className={LI}>
          <b>「理想の評価値編成を求める」</b>を押す（サポカ編成とレッスンの踏み方を自動探索）。
        </li>
        <li className={LI}>
          そこから<b>発動回数</b>（画面左の「発動回数」タブ）や<b>レッスンの踏み方</b>
          （「レッスン」タブ）を調節して、自分なりの育成を見つける。
          編成を手で入れ替えたいときはサポカ枠をクリック。
        </li>
      </ol>
      <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-xs leading-relaxed text-amber-800">
        ⚠ <b>理論編成（自動探索）を求める精度は保証しません。</b>
        時間制限つきの近似探索のため、押すたびに結果が少し変わったり、より良い編成を
        取りこぼすことがあります。ゲーム本体と仕様が異なる部分もあるので、参考値としてお使いください。
      </p>

      <h3 className={H}>操作のヒント</h3>
      <ul className="list-disc space-y-1 pl-5">
        <li className={LI}>
          <b>数値入力欄は右クリックでスライダー</b>が開く（大きい数字向け）。
          スライダーはドラッグしたまま上下に離すと微調整（×1/10・×1/100）、
          ホイールで±1（Shift=±10、Ctrl=±100）。
        </li>
        <li className={LI}>
          サポカ枠クリック＝カード選択、凸バッジクリック＝凸数変更。
          アイドル画像クリック＝Pアイドル選択、画像右上の歯車＝特訓・才能開花。
        </li>
        <li className={LI}>
          発動回数セットの「プラン」（【センス】など）は、条件設定の「試験補助を強める」で
          アイテム評価をどのスタイル向けに見るかの判定に使われる。
        </li>
        <li className={LI}>
          「画像で保存」で今の計算シート（評価値・ステ・編成・踏み方など）を1枚の画像にできる。
        </li>
      </ul>

      <h3 className={H}>数値と計算式のまとめ</h3>
      <ul className="list-disc space-y-1 pl-5">
        <li className={LI}>
          <b>評価値（H.I.F.）</b>＝ ステ合計（各3200まで）×2 ＋ floor(合計スター性×7.5)
          ＋ 本戦ラウンド点数の評価値 − 2000。
          N.I.A.＝ floor(ステ合計×2.3)＋ファン投票数換算、
          初レジェンド＝ floor(ステ合計×2.1)＋順位ボーナス＋試験スコア換算。
        </li>
        <li className={LI}>
          <b>合計スター性</b>＝ ワッペン ＋ レッスン ＋ 選抜 ＋ 本戦（R1:180＋R2:225）。
          ワッペンは札（スキルカード）取得1枚につき★15、<b>最大20発動</b>。
          札 ＝ 発動回数セットの「スキル獲得」＋ 編成サポカのスキル獲得分（前イベ・後イベ込み）。
        </li>
        <li className={LI}>
          <b>Pポイント（H.I.F.）</b>: 選抜 ＝ 開始時230 ＋ 差し入れ80×4 ＋ 選抜レッスン（30×6）
          ＋ サポカ ＋ メモリー ／ 本戦 ＝ 開始時200 ＋ 差し入れ80 ＋ 本戦レッスン（50×2）。
          レッスンPポイント率・タイプSPレッスンPポイント率の換算は、対象レッスンがある期間に計上。
        </li>
        <li className={LI}>
          <b>体力</b>＝ Pアイドルの体力 ＋ サポカの最大体力上昇。
        </li>
        <li className={LI}>
          <b>SPレッスン率</b>＝ 表記外推定SP率 ＋ サポカのSPレッスン率（枠の属性へ）＋
          PアイドルのSP率（特訓2・特訓6など）。
          <b>踏み方の実現確率</b>＝ SP踏みの日は「メイン属性のSP率」、サブ属性を指定した日は
          「2択で50%」を全部掛け合わせたもの。
        </li>
        <li className={LI}>
          <b>最終ステータス</b>＝ 授業 ＋ メモリー ＋ Pアイドル（固定値＋100）＋ レッスン ＋ 選抜
          ＋ サポカ（アビリティ効果量×発動回数）＋ パラメータボーナス変換
          （%は全ソース合算してから1回で変換）。
        </li>
      </ul>

      <h3 className={H}>数値表（レッスン・授業・本戦・選抜）</h3>
      <p className={P}>
        レッスン調整モーダルの「数値表・計算式」と同じ内容です。
      </p>
      <div className="mt-2">
        <NumbersTables />
      </div>
    </Modal>
  );
}
