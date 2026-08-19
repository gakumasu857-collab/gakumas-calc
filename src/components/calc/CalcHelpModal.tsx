/**
 * 計算ページのヘルプモーダル。
 * 使い方の流れ（番号つきステップカード）・操作のヒント・数値と計算式のまとめ・
 * 数値表（レッスン/選抜/本戦）を1か所に集約。
 * ステップ内の「ボタン風・タブ風」の要素は実際のUIを模したもので、機能はない。
 */
import { CalendarCheck, ListOrdered, MousePointerClick, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import Modal from "@/components/Modal";
import { NumbersTables } from "@/components/calc/PlanEditDrawer";
import type { ScenarioKey } from "@/data/scenarios";

const H = "mb-2 mt-6 text-base font-bold text-slate-800 first:mt-0";
const LI = "text-sm leading-relaxed text-slate-600";

/** 実UIを模した飾りチップ（押せない） */
function MockChip({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-bold ${className}`}
    >
      {children}
    </span>
  );
}

/** 使い方の1ステップ（番号・タイトル・説明・ビジュアル） */
function Step({
  no,
  title,
  children,
  visual,
}: {
  no: number;
  title: string;
  children: React.ReactNode;
  visual?: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-base font-black text-white">
        {no}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-800">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-slate-600">
          {children}
        </p>
        {visual && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">{visual}</div>
        )}
      </div>
    </div>
  );
}

export default function CalcHelpModal({
  onClose,
  scenario = "hif",
}: {
  onClose: () => void;
  scenario?: ScenarioKey;
}) {
  return (
    <Modal title="使い方・計算式ヘルプ" onClose={onClose} widthClass="max-w-3xl">
      <h3 className={H}>使い方の流れ</h3>
      <div className="flex flex-col gap-2">
        <Step
          no={1}
          title="所持状況を入力する"
          visual={
            <>
              <Link
                to="/support"
                className="inline-flex items-center rounded-lg bg-blue-600 px-2 py-1 text-xs font-bold text-white hover:bg-blue-500"
              >
                所持状況ページを開く →
              </Link>
              <MockChip className="border border-blue-300 bg-blue-50 text-blue-700">
                📷 画面キャプチャで所持入力（β）
              </MockChip>
            </>
          }
        >
          上のタブの「所持状況」で、サポカとPアイドルの所持・凸（特訓/開花）を入力します。
          ゲーム画面を映して自動読み取りする機能もあります。
        </Step>
        <Step
          no={2}
          title="育成の前提を設定する"
          visual={
            <>
              <MockChip className="border border-slate-300 bg-white text-slate-700">
                育成シナリオ ▾
              </MockChip>
              <MockChip className="border border-slate-300 bg-white text-slate-700">
                アイドル・Pアイドル ▾
              </MockChip>
              <MockChip className="border border-slate-300 bg-white text-slate-700">
                育成（発動回数セット）▾
              </MockChip>
              <MockChip className="border border-slate-300 bg-white text-slate-700">
                メモリー
              </MockChip>
            </>
          }
        >
          計算ページ右上の「設定」ブロックで、シナリオ・アイドル（Pアイドル）・
          育成（発動回数セット）を選び、メモリーを設定します。
          発動回数セットは「この育成でアビリティが何回発動するか」のテンプレです。
        </Step>
        <Step
          no={3}
          title="自動探索ボタンを押す"
          visual={
            <MockChip className="bg-blue-600 text-white">
              <Sparkles size={13} />
              理想の評価値編成を求める（サポカ編成＋踏み方を自動探索）
            </MockChip>
          }
        >
          サポカ編成とレッスンの踏み方を自動で探索し、評価値が高い組み合わせを反映します。
          隣の歯車（条件設定）で取得回数・編成割合・試験補助などの条件を変えられます。
        </Step>
        <Step
          no={4}
          title="調節して自分なりの育成を見つける"
          visual={
            <>
              <MockChip className="bg-emerald-600 text-white">
                <ListOrdered size={13} />
                発動回数（画面左のタブ）
              </MockChip>
              <MockChip className="bg-sky-600 text-white">
                <CalendarCheck size={13} />
                レッスン（画面左のタブ）
              </MockChip>
              <MockChip className="border border-slate-300 bg-white text-slate-700">
                <MousePointerClick size={13} />
                サポカ枠クリックで入れ替え
              </MockChip>
            </>
          }
        >
          ここからが本番です。画面左の「発動回数」タブでアビリティの回数を実際の育成に
          寄せたり、「レッスン」タブで踏み方や選抜スコアを変えたりして、
          評価値と最終ステータスの変化を見ながら自分なりの育成を見つけてください。
        </Step>
      </div>
      <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2.5 text-sm leading-relaxed text-amber-800">
        ⚠ <b>理論編成（自動探索）を求める精度は保証しません。</b>
        時間制限つきの近似探索のため、押すたびに結果が少し変わったり、より良い編成を
        取りこぼすことがあります。ゲーム本体と仕様が異なる部分もあるので、参考値としてお使いください。
      </p>

      <h3 className={H}>操作のヒント</h3>
      <ul className="list-disc space-y-1.5 pl-5">
        <li className={LI}>
          <b>数値入力欄は右クリックでスライダー</b>が開きます（大きい数字向け）。
          スライダーはドラッグしたまま上下に離すと微調整（×1/10・×1/100）、
          ホイールで±1（Shift=±10、Ctrl=±100）。
        </li>
        <li className={LI}>
          <b>サポカ枠クリック</b>＝カード選択、<b>凸バッジクリック</b>＝凸数変更。
        </li>
        <li className={LI}>
          <b>アイドル画像クリック</b>＝Pアイドル選択、<b>画像右上の歯車</b>＝特訓・才能開花の設定。
        </li>
        <li className={LI}>
          発動回数セットの<b>【プラン】</b>（【センス】など）は、条件設定の
          「試験補助を強める」でアイテム評価をどのスタイル向けに見るかの判定に使われます。
        </li>
        <li className={LI}>
          <b>「画像で保存」</b>で今の計算シート（評価値・ステ・編成・踏み方など）を
          1枚の画像にできます。<b>「セーブデータ」</b>で入力状態の保存・読み込みもできます。
        </li>
      </ul>

      <h3 className={H}>数値と計算式のまとめ</h3>
      <ul className="list-disc space-y-1.5 pl-5">
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
          <b>踏み方の実現確率</b>＝ SP踏みの日は「踏むタイプのSP率」を全部掛け合わせたもの。
          H.I.F.は2ndタイプ（サブ属性）の出現も掛ける: 踏むタイプ以外の2タイプのうち
          審査基準が高い方が75%・低い方が25%で抽選される
          （N.I.A.と初のレッスンにはサブ属性が無いのでSP率どおり）。
        </li>
        <li className={LI}>
          <b>最終ステータス</b>＝ 授業 ＋ メモリー ＋ Pアイドル（固定値＋100）＋ レッスン ＋ 選抜
          ＋ サポカ（アビリティ効果量×発動回数）＋ パラメータボーナス変換
          （%は全ソース合算してから1回で変換）。
        </li>
      </ul>

      <h3 className={H}>数値表（選択中のシナリオ）</h3>
      <div className="mt-2">
        <NumbersTables scenario={scenario} />
      </div>
    </Modal>
  );
}
