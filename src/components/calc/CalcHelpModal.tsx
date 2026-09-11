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

/** よくある質問の1項目 */
function QA({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5">
      <p className="text-sm font-bold text-slate-800">Q. {q}</p>
      <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{children}</p>
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
          title="育成の前提を入れる"
          visual={
            <>
              <MockChip className="border border-slate-300 bg-white text-slate-700">
                育成シナリオ ▾
              </MockChip>
              <MockChip className="border border-slate-300 bg-white text-slate-700">
                アイドル・Pアイドル ▾
              </MockChip>
              <MockChip className="border border-slate-300 bg-white text-slate-700">
                育成パターン ▾
              </MockChip>
              <MockChip className="border border-slate-300 bg-white text-slate-700">
                メモリー ▾
              </MockChip>
            </>
          }
        >
          「育成の前提」ブロックで、育成シナリオ・アイドル（Pアイドル）・育成パターン（発動回数）・メモリー・本戦の点数を入れます。
          黄色の欄が未選択です。全部そろうと青いボタンが押せるようになります。
          所持状況（サポカの凸）は上のタブ「所持状況」からいつでも入力できます（未入力なら全サポカ完凸として計算）。
        </Step>
        <Step
          no={2}
          title="青いボタンで求める"
          visual={
            <>
              <MockChip className="bg-blue-600 text-white">
                <Sparkles size={13} />
                理想の編成と踏み方を求める ▾
              </MockChip>
              <MockChip className="border border-slate-300 bg-white text-slate-700">
                探索の条件
              </MockChip>
            </>
          }
        >
          評価値の下の青いボタンで、サポカ6枚とレッスンの踏み方を自動で探索し、評価値が高い組み合わせを「サポカ編成と踏み方」に反映します。
          右の ▾ から「編成だけ」「踏み方だけ」も選べます。「探索の条件」でタイプ割合・最低/最高ステ・SP率持ちの枚数などを指定できます。
          所持状況が未入力のときは、最初の1回だけ確認が出ます。
        </Step>
        <Step
          no={3}
          title="「サポカ編成と踏み方」で結果を見る"
          visual={
            <>
              <MockChip className="border border-emerald-200 bg-emerald-50 text-emerald-700">
                ▲ 入ったサポカ
              </MockChip>
              <MockChip className="border border-slate-200 bg-slate-100 text-slate-500">
                ▼ 外れたサポカ
              </MockChip>
              <MockChip className="bg-emerald-50 text-emerald-700">✓ タイプ割合</MockChip>
            </>
          }
        >
          サポカ6枚・レッスン（メイン｜サブ・SP）・授業・選抜の配分が一度に見えます。評価値の下には条件の達成状況、
          ボタンの下には前回の探索の内訳（何通り・何秒・前後の評価値）が出ます。納得できないときは「診断ログをコピー」して送ってください。
        </Step>
        <Step
          no={4}
          title="自分の育成に合わせて調整する"
          visual={
            <>
              <MockChip className="border border-slate-300 bg-white text-slate-700">
                <CalendarCheck size={13} />
                踏み方を編集
              </MockChip>
              <MockChip className="border border-slate-300 bg-white text-slate-700">
                <ListOrdered size={13} />
                発動回数
              </MockChip>
              <MockChip className="border border-slate-300 bg-white text-slate-700">
                <MousePointerClick size={13} />
                サポカ枠クリックで入れ替え
              </MockChip>
            </>
          }
        >
          ここからが本番です。「サポカ編成と踏み方」の「踏み方を編集」「発動回数」で実際の育成に寄せ、
          サポカ枠をクリックして入れ替え（凸・固定・BANも選択画面で）たり、黄色い「前イベ・後イベ・ステイベの発動を調整」で
          イベントの発動を変えたりしながら、評価値と育成後のステータスの変化を見てください。
        </Step>
      </div>
      <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2.5 text-sm leading-relaxed text-amber-800">
        ⚠ <b>自動探索の精度は保証しません。</b>
        時間制限つきの近似探索のため、より良い編成を取りこぼすことがあります。
        ゲーム本体と仕様が異なる部分もあるので、参考値としてお使いください。
      </p>

      <h3 className={H}>よくある質問</h3>
      <div className="flex flex-col gap-2">
        <QA q="評価値が出ない">
          サポカを6枚編成し、育成パターン（発動回数）を選ぶと表示されます。
        </QA>
        <QA q="「求める」ボタンが押せない">
          「育成の前提」の黄色い欄（未選択）を埋めてください。押せない理由はボタンの下にも出ます。
        </QA>
        <QA q="所持状況はいつ入れればいい？">
          いつでも大丈夫です。未入力のうちは全サポカ完凸として計算します（最初の探索前に一度だけ確認が出ます）。
          所持状況ページで保存先スロットを作っておくと、入力した変更はそこへ自動で保存されます。
        </QA>
        <QA q="押しても編成が変わらない／評価値が下がった">
          今の編成が探索の条件を満たしていて、探索結果がそれを下回ったときは変更しません（結果カードに「今の編成のまま」と出ます）。
          条件を厳しくした直後は、条件を満たす編成に置き換わるため評価値が下がることがあります。
        </QA>
        <QA q="条件（タイプ割合・最低ステなど）どおりにならない">
          結果カードの「条件」に ✗ が出ているときは、所持サポカや踏み方ではその条件に届かなかった場合です。
          SP率持ちの枚数や最低ステを緩めるか、所持状況を確認してください。タイプ割合は必ず守られます（アシストは自由枠）。
        </QA>
        <QA q="トレーナーはSP率持ちに数えますか">
          数えます。「全SPレッスン率」持ちのアシストは全タイプの1枚として扱います。
        </QA>
        <QA q="スマホでの見方">
          上から「育成の前提」→「求める」ボタン→「サポカ編成と踏み方」→評価値・ステータスの順に並びます。
        </QA>
        <QA q="入力したデータはどこに保存されますか">
          すべてお使いのブラウザの中（localStorage）です。サーバーには送られません。
          別の端末や履歴削除では消えるので、大事な状態は右上の「セーブデータ」で保存し、所持状況はCSVで控えを取ってください。
        </QA>
      </div>

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
          <b>踏み方のチップ</b>は、左がメイン、右がサブ、黄色の枠がSPレッスンです。授業（営業）は順番どおり、
          選抜はタイプ別スコアの配分バーです。チップをクリックすると編集できます。
        </li>
        <li className={LI}>
          育成パターンの<b>【プラン】</b>（【センス】など）は、探索の条件「試験補助を強める」で
          アイテム評価をどのスタイル向けに見るかの判定に使われます。
        </li>
        <li className={LI}>
          右上の<b>「セーブデータ」</b>から、今の育成の状態をまるごと（シナリオ・アイドル・踏み方・
          メモリー4枚・サポカ編成・前イベ/後イベ設定・発動回数・所持状況）保存でき、読み込めば
          <b>評価値まで同じ状態に戻ります</b>。同じ場所の<b>「画像で保存」</b>で計算シートを1枚の画像にできます。
        </li>
        <li className={LI}>
          <b>「パラボ変換表」</b>（開始時のステータスの右上）で、
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
              <b>評価値</b>＝ ステ合計（各3200まで）×2 ＋ floor(合計スター性×7.5)
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
              <b>評価値</b>＝ floor(ステ合計（各2600まで）×2.3) ＋ ファン投票数換算。
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
              <b>評価値</b>＝ floor(ステ合計（各3000まで）×2.1) ＋
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
