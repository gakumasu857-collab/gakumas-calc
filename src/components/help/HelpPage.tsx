import { useEffect } from "react";
import { ArrowDown, ArrowRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

/**
 * ヘルプページ（/help）。使い方の流れ・ページの構成・画面つきの手順・プロデュースと発動回数の関係・
 * 用語・よくある質問・データの保存の注意。
 * 「#produce」などのハッシュ付きで開くと、その見出しまでスクロールする（計算ページの ⓘ から飛ぶ）。
 * 画面写真は public/help/*.webp（開発時に vite.config.ts の /__shot で撮ったもの）。
 */
const SECTIONS = [
  { id: "flow", label: "全体の流れ" },
  { id: "pages", label: "ページの構成" },
  { id: "steps", label: "使い方（画面つき）" },
  { id: "produce", label: "プロデュースと発動回数" },
  { id: "terms", label: "用語" },
  { id: "faq", label: "よくある質問" },
  { id: "storage", label: "データの保存と注意" },
];

const H2 = "mb-3 mt-10 scroll-mt-20 text-lg font-bold text-slate-900 first:mt-0";
const P = "text-sm leading-relaxed text-slate-700";
const CARD = "rounded-xl border border-slate-200 bg-white p-4";

/** 流れ図の1コマ */
function FlowBox({
  no,
  title,
  body,
  tone = "slate",
}: {
  no?: number;
  title: string;
  body?: React.ReactNode;
  tone?: "blue" | "amber" | "slate" | "emerald";
}) {
  const TONE = {
    blue: "border-blue-500 bg-blue-50",
    amber: "border-amber-400 bg-amber-50",
    slate: "border-slate-300 bg-white",
    emerald: "border-emerald-400 bg-emerald-50",
  }[tone];
  return (
    <div className={`min-w-0 flex-1 rounded-xl border-2 p-3 ${TONE}`}>
      {no !== undefined && (
        <div className="text-[10px] font-black tracking-wide text-slate-400">STEP {no}</div>
      )}
      <div className="text-sm font-bold text-slate-900">{title}</div>
      {body && <div className="mt-0.5 text-xs leading-relaxed text-slate-600">{body}</div>}
    </div>
  );
}

/** 横に並べる流れ（スマホでは縦） */
function Flow({ children }: { children: React.ReactNode[] }) {
  const items = children.filter(Boolean);
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-stretch sm:gap-2">
      {items.map((item, i) => (
        <div key={i} className="flex flex-col items-center gap-1.5 sm:flex-1 sm:flex-row sm:gap-2">
          {item}
          {i < items.length - 1 && (
            <>
              <ArrowDown size={18} className="shrink-0 text-slate-400 sm:hidden" />
              <ArrowRight size={18} className="hidden shrink-0 text-slate-400 sm:block" />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/** 画面写真＋「ここを押す」の印（印の位置は写真に対する%） */
export type Callout = { x: number; y: number; label: string };
function Shot({
  src,
  alt,
  callouts = [],
  caption,
}: {
  src: string;
  alt: string;
  callouts?: Callout[];
  caption?: React.ReactNode;
}) {
  return (
    <figure className="my-3">
      <div className="relative inline-block max-w-full overflow-hidden rounded-xl border border-slate-300 shadow-sm">
        <img src={src} alt={alt} className="block max-w-full" loading="lazy" />
        {callouts.map((c, i) => (
          <span
            key={i}
            style={{ left: `${c.x}%`, top: `${c.y}%` }}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-red-500 text-xs font-black text-white shadow">
              {i + 1}
            </span>
          </span>
        ))}
      </div>
      {callouts.length > 0 && (
        <ol className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
          {callouts.map((c, i) => (
            <li key={i} className="flex items-center gap-1">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white">
                {i + 1}
              </span>
              {c.label}
            </li>
          ))}
        </ol>
      )}
      {caption && <figcaption className="mt-1 text-xs text-slate-500">{caption}</figcaption>}
    </figure>
  );
}

/** 画面写真の一覧（撮り直したらここを更新。印の位置は撮影時に測った%） */
export const SHOTS: Record<string, { src: string; alt: string; callouts: Callout[] }> = {
  nav: {
    src: "/help/nav.webp",
    alt: "上のナビ: 計算／探索の設定（所持状況・発動回数・サポカ設定）／表（サポカ点数表・サポカDB）／ヘルプ",
    callouts: [
      { x: 15.5, y: 49.3, label: "計算（メイン）" },
      { x: 32.4, y: 49.3, label: "探索の設定（所持状況・発動回数・サポカ設定）" },
      { x: 48.7, y: 49.3, label: "表（サポカ点数表・サポカDB）" },
      { x: 95.8, y: 49.3, label: "ヘルプ" },
    ],
  },
  premise: {
    src: "/help/premise.webp",
    alt: "「まずここを設定」のカード。育成シナリオ・アイドル・プロデュース・メモリーの4つの欄",
    callouts: [
      { x: 25.6, y: 29.6, label: "育成シナリオ" },
      { x: 74.4, y: 29.6, label: "アイドル（Pアイドル）" },
      { x: 25.6, y: 50.7, label: "プロデュース" },
      { x: 74.4, y: 50.7, label: "メモリー" },
      { x: 12.9, y: 41.3, label: "ⓘ プロデュースの説明（このページの「プロデュースと発動回数」へ）" },
      { x: 7.1, y: 62.1, label: "発動回数（編成が決まったあとの、この育成での回数）" },
    ],
  },
  ownership: {
    src: "/help/ownership.webp",
    alt: "「つぎに 所持状況を確認」のカード。完凸のままでOK と 自分の所持状況を入力する の2つのボタン",
    callouts: [
      { x: 25.8, y: 72.8, label: "完凸のままでOK（全サポカ完凸の想定で探索）" },
      { x: 74.2, y: 72.8, label: "自分の所持状況を入力する（所持状況ページへ）" },
    ],
  },
  action: {
    src: "/help/action.webp",
    alt: "探索のボタンの行。青いボタン・▾・探索の条件",
    callouts: [
      { x: 41.6, y: 24.2, label: "探索のボタン（前提がそろうと押せる）" },
      { x: 84, y: 24.2, label: "▾ 編成だけ／踏み方だけ" },
      { x: 92.8, y: 24.2, label: "探索の条件（SP率持ち・タイプ割合・最低/最高ステなど）" },
    ],
  },
  formation: {
    src: "/help/formation.webp",
    alt: "「サポカ編成と踏み方」のカード。サポカ6枚・踏み方のチップ・開始時のステータス",
    callouts: [
      { x: 69.9, y: 6.8, label: "レッスン等の踏み方" },
      { x: 84.2, y: 6.8, label: "発動回数（この育成での回数）" },
      { x: 9.6, y: 19.8, label: "サポカ枠（クリックで入れ替え・凸・固定・BAN）" },
      { x: 50, y: 49.6, label: "踏み方のチップ（クリックでも編集できる）" },
      { x: 90.6, y: 73.2, label: "パラボ変換表" },
      { x: 50, y: 92.8, label: "前イベ・後イベ・ステイベの発動を調整" },
    ],
  },
  plan: {
    src: "/help/plan.webp",
    alt: "「レッスン等の踏み方」で開く画面。レッスン8回・授業・選抜の入力",
    callouts: [
      { x: 12.2, y: 11.8, label: "レッスンごとにメイン／サブ／SPを選ぶ" },
      { x: 48.7, y: 11.8, label: "授業のタイプ" },
      { x: 15.8, y: 68.9, label: "選抜はスコアか、ログの上昇幅（ステ）で入力" },
    ],
  },
  counts: {
    src: "/help/counts.webp",
    alt: "「発動回数」で開く画面。この育成での回数を分類ごとに±で変える",
    callouts: [
      { x: 50, y: 13.8, label: "この育成での回数（発動回数ページのデフォルトは変わらない）" },
      { x: 12.5, y: 25.9, label: "分類を選ぶ" },
      { x: 61, y: 24.5, label: "サポカのイベント分（緑）を反映" },
      { x: 48.3, y: 34.5, label: "±で回数を変える（変えたものは「調整中」の印）" },
    ],
  },
  memory: {
    src: "/help/memory.webp",
    alt: "メモリーを4枚選ぶ画面。4つの枠・編集枠・保存したメモリーの一覧",
    callouts: [
      { x: 6.7, y: 9.2, label: "枠（クリックで編集する枠を選ぶ・×で外す）" },
      { x: 89.2, y: 4.5, label: "4枚そろえばセットとして保存" },
      { x: 89.2, y: 14.2, label: "保存したセットから入れる" },
      { x: 5.8, y: 40.1, label: "値のボタンを押すと、その場で枠に入る（保存は任意）" },
      { x: 43.3, y: 30.9, label: "保存したメモリー（クリックで枠に入れる・✎で編集）" },
    ],
  },
};

function ShotIf({ id, caption }: { id: string; caption?: React.ReactNode }) {
  const s = SHOTS[id];
  if (!s) return null;
  return <Shot src={s.src} alt={s.alt} callouts={s.callouts} caption={caption} />;
}

/** よくある質問の1項目 */
function QA({ id, q, children }: { id?: string; q: string; children: React.ReactNode }) {
  return (
    <div id={id} className={`${CARD} scroll-mt-20`}>
      <p className="text-sm font-bold text-slate-900">Q. {q}</p>
      <div className={`mt-1 ${P}`}>{children}</div>
    </div>
  );
}

/** 用語の1項目 */
function Term({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-2 last:border-b-0 sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-sm font-bold text-slate-900 sm:w-40">{name}</dt>
      <dd className={P}>{children}</dd>
    </div>
  );
}

export default function HelpPage() {
  const { hash } = useLocation();
  // ハッシュ付きで来たら、その見出しへ（App の ScrollToTop が先頭に戻したあとで動かす）
  useEffect(() => {
    if (!hash) return;
    // 親（App）の ScrollToTop が先頭へ戻したあとに動かす。画像の読み込みで位置がずれるので2回合わせる
    const jump = () => document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
    const t1 = setTimeout(jump, 120);
    const t2 = setTimeout(jump, 700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [hash]);

  return (
    <div className="max-w-3xl">
      {/* 目次 */}
      <nav className="mb-6 flex flex-wrap gap-1.5">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-blue-400 hover:text-blue-700"
          >
            {s.label}
          </a>
        ))}
      </nav>

      {/* ---------------------------------------------------------------- 全体の流れ */}
      <h2 id="flow" className={H2}>
        全体の流れ
      </h2>
      <p className={`mb-3 ${P}`}>
        計算ページは「前提を入れる → 所持状況を決める → 青いボタンで探索 → 手で調整」の順に上から並んでいます。
      </p>
      <Flow>
        <FlowBox
          no={1}
          tone="blue"
          title="まずここを設定"
          body="育成シナリオ・アイドル（Pアイドル）・プロデュース・メモリーの4つ。黄色の欄が未選択です。"
        />
        <FlowBox
          no={2}
          tone="amber"
          title="所持状況を確認"
          body="既定は全サポカ完凸。それでよければ「完凸のままでOK」、手持ちに合わせるなら所持状況ページで入力。"
        />
        <FlowBox
          no={3}
          tone="blue"
          title="青いボタンで探索"
          body="サポカ6枚とレッスンの踏み方を自動で探し、評価値が高い組み合わせを「サポカ編成と踏み方」に入れます。"
        />
        <FlowBox
          no={4}
          tone="emerald"
          title="手で調整する"
          body="レッスン等の踏み方・発動回数・サポカ枠のクリック・前イベ後イベ。変えるとその場で評価値が動きます。"
        />
      </Flow>
      <p className={`mt-3 ${P}`}>
        結果は右（スマホでは編成の上）の<b>評価値</b>と<b>育成後のステータス</b>に出ます。
        気に入った状態は右上の<b>「セーブデータ」</b>で保存、<b>「画像に出力」</b>で1枚の画像にできます。
      </p>

      {/* ---------------------------------------------------------------- ページの構成 */}
      <h2 id="pages" className={H2}>
        ページの構成
      </h2>
      <p className={`mb-3 ${P}`}>
        メインは計算ページです。ほかのページは「探索の設定」と「表」の2種類に分かれます（上のナビも同じ並びです）。
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr]">
        <div className={`${CARD} border-blue-300 bg-blue-50/40`}>
          <p className="text-sm font-bold text-slate-900">計算</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            前提の入力・探索・調整・評価値。ふだん使うのはここだけです。
          </p>
        </div>
        <div className={CARD}>
          <p className="text-sm font-bold text-slate-900">探索の設定</p>
          <ul className="mt-1 list-disc pl-4 text-xs leading-relaxed text-slate-600">
            <li>
              <Link to="/support" className="font-semibold text-blue-700 underline">
                所持状況
              </Link>
              : 持っているサポカと凸。探索はここから編成します
            </li>
            <li>
              <Link to="/ability-counts" className="font-semibold text-blue-700 underline">
                発動回数
              </Link>
              : プロデュースごとの発動回数のデフォルト（探索の条件）
            </li>
            <li>
              <Link to="/card-settings" className="font-semibold text-blue-700 underline">
                サポカ設定
              </Link>
              : 前イベ・後イベの既定、固定・BAN・レンタルNG（上級者向け）
            </li>
          </ul>
        </div>
        <div className={CARD}>
          <p className="text-sm font-bold text-slate-900">表（見るだけ）</p>
          <ul className="mt-1 list-disc pl-4 text-xs leading-relaxed text-slate-600">
            <li>
              <Link to="/card-scores" className="font-semibold text-blue-700 underline">
                サポカ点数表
              </Link>
              : 全カードの点数を一覧で
            </li>
            <li>
              <Link to="/database" className="font-semibold text-blue-700 underline">
                サポカDB
              </Link>
              : アビリティ・イベントの一覧
            </li>
          </ul>
        </div>
      </div>
      <ShotIf id="nav" caption="上のナビ。左から順に、計算 → 探索の設定 → 表。右端がヘルプ" />

      {/* ---------------------------------------------------------------- 使い方（画面つき） */}
      <h2 id="steps" className={H2}>
        使い方（画面つき）
      </h2>
      <div className="flex flex-col gap-6">
        <div>
          <h3 className="text-base font-bold text-slate-900">1. まずここを設定</h3>
          <p className={`mt-1 ${P}`}>
            青い帯のカードの4つの欄を上から埋めます。黄色い欄が未選択です。
            プロデュースはPアイドルのプランで使えるものだけが出ます。メモリーは枠をクリックしてその場で作れます（保存は任意）。
          </p>
          <ShotIf id="premise" caption="4つそろうと、すぐ下の青いボタンが押せるようになります" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-900">2. 所持状況を確認</h3>
          <p className={`mt-1 ${P}`}>
            前提の下に「つぎに 所持状況を確認」が出ます。全サポカ完凸のままでよければ
            <b>「完凸のままでOK」</b>を押すだけ。手持ちに合わせたいときは<b>「自分の所持状況を入力する」</b>
            で所持状況ページへ（あとからいつでも変えられます）。
          </p>
          <ShotIf id="ownership" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-900">3. 青いボタンで探索</h3>
          <p className={`mt-1 ${P}`}>
            前提がそろうと押せます。右の ▾ から「編成だけ」「踏み方だけ」も選べ、「探索の条件」でSP率持ちの枚数・タイプ割合・最低/最高ステなどを指定できます。
            結果は「サポカ編成と踏み方」に入り、評価値が動きます。
          </p>
          <ShotIf id="action" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-900">4. 手で調整する</h3>
          <p className={`mt-1 ${P}`}>
            「サポカ編成と踏み方」の<b>「レッスン等の踏み方」</b>でレッスン・授業・選抜を、<b>「発動回数」</b>でこの育成でのアビリティ発動回数を変えられます。
            サポカ枠をクリックすると入れ替え（凸・固定・BANも）。黄色い「前イベ・後イベ・ステイベの発動を調整」でイベントの発動も変えられます。
            どれも変えるとその場で評価値と育成後のステータスが動きます。
          </p>
          <ShotIf id="formation" />
          <ShotIf id="plan" caption="「レッスン等の踏み方」で開く画面" />
          <ShotIf id="counts" caption="「発動回数」で開く画面（この育成での回数。発動回数ページのデフォルトは変わりません）" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-900">5. メモリーを作る</h3>
          <p className={`mt-1 ${P}`}>
            メモリー欄を開くと4つの枠が出ます。枠をクリック → 下の値のボタンを押すと、その場で中身が入ります（保存しなくても計算に使えます）。
            保存すると「保存したメモリー」の一覧から何度でも入れられ、4枚そろえば「セット」としても保存できます。
            テンプレ「メインパラボ◯点」は、実物が決まっていないときの目安です。
          </p>
          <ShotIf id="memory" />
        </div>
      </div>

      {/* ---------------------------------------------------------------- プロデュースと発動回数 */}
      <h2 id="produce" className={H2}>
        プロデュースと発動回数
      </h2>
      <p className={`mb-3 ${P}`}>
        「プロデュース」は、サポカのアビリティが<b>何回発動する想定で探索するか</b>の条件（発動回数セット）です。
        差し入れやお出かけの回数、ドリンク獲得、スキル強化・削除の回数などが入っています。
        発動回数ページで自分のプロデュースを作ったり、デフォルトの回数を変えたりできます。
      </p>
      <Flow>
        <FlowBox
          tone="slate"
          title="発動回数ページ"
          body="プロデュースごとの「デフォルトの回数」＝探索の条件。所持状況と同じ立ち位置です。"
        />
        <FlowBox tone="blue" title="探索" body="プロデュースの回数と所持状況から、サポカ6枚と踏み方を決めます。" />
        <FlowBox
          tone="emerald"
          title="計算ページの「発動回数」ボタン"
          body="編成が決まったあとの「この育成での回数」を調整。ここで変えてもデフォルトは変わりません。"
        />
      </Flow>
      <p className={`mt-3 ${P}`}>
        発動回数ページで変えた回数は探索の条件になるほか、計算ページの「発動回数」ボタンでまだ変えていないアビリティにもそのまま使われます。
        「発動回数」ボタンで変えた回数は、そちらが優先されます（調整中の印が付きます）。
      </p>

      {/* ---------------------------------------------------------------- 用語 */}
      <h2 id="terms" className={H2}>
        用語
      </h2>
      <dl className={CARD}>
        <Term name="評価値">
          プロデュース評価の目安。ステータス合計×係数＋スター性などで決まります（式は計算ページの「使い方・計算式ヘルプ」）。
        </Term>
        <Term name="プロデュース">
          サポカのアビリティが何回発動する想定かの条件（発動回数セット）。「センス花ロボ（黄）」などはゲーム内の育成スタイルの通称です。
        </Term>
        <Term name="発動回数">
          アビリティごとの発動回数。発動回数ページ＝デフォルト（探索の条件）、計算ページの「発動回数」ボタン＝この育成での回数。
        </Term>
        <Term name="メモリー／メインパラボ">
          育成開始時に持ち込むメモリー4枚。「メインパラボ◯点」は、パラボ%を踏み方で母数が大きい上位2タイプに、残り1タイプに固定値を割り当てるテンプレです。
        </Term>
        <Term name="前イベ・後イベ・ステイベ">
          サポカのイベント。前イベはスキルやアイテム、後イベはランダム強化やチェンジ、ステイベはパラメータ上昇が起こるイベントです。
        </Term>
        <Term name="BAN・固定・レンタルNG">
          探索の条件。BAN＝そのサポカを入れない、固定＝必ず入れる、レンタルNG＝レンタルで入れない（自前のものを入れるか編成しない）。
        </Term>
        <Term name="パラボ（パラメータボーナス）">
          レッスン・試験で上がるステに%で上乗せされる分。「パラボ変換表」で、今の踏み方だと何点になるかが見られます。
        </Term>
        <Term name="SPレッスン率">
          ゲーム内の表示（サポカ＋Pアイドル＋5%）に、表記外推定SP率（既定10%）を足したものを実際の確率として計算します。
        </Term>
      </dl>

      {/* ---------------------------------------------------------------- よくある質問 */}
      <h2 id="faq" className={H2}>
        よくある質問
      </h2>
      <div className="flex flex-col gap-2">
        <QA q="プロデュース計算機って何？">
          サポカを6枚編成し、レッスンの踏み方や試験の点数、メモリーや育成するPアイドルを入力すると評価値が求められる計算ツールです。現在は「H.I.F」、「N.I.A/マスター」、「初/レジェンド」の3シナリオを実装しています。
          <br />
          サポカ等の所持状況を入力することで、あなたの手持ちでもっとも評価値が高くなるような編成を自動で求める機能もあります。
        </QA>
        <QA id="faq-produce" q="まずここを設定、の 「プロデュース」って何？">
          編成の自動探索において、サポカのアビリティが何回発動するかの条件設定です。差し入れやお出かけの回数や、ドリンク獲得、スキル強化や削除の回数などが設定されています。自分で設定することも可能です（→
          <Link to="/ability-counts" className="font-semibold text-blue-700 underline">
            発動回数ページ
          </Link>
          ）。編成が決まった後にアビリティ発動回数を調節したい場合は発動回数ボタンから設定できます（発動回数ページで変えた回数は探索の条件になるほか、発動回数ボタンでまだ変えていないアビリティにもそのまま使われます。発動回数ボタンで変えた回数はそちらが優先です）。
        </QA>
        <QA q="前イベ、後イベ、ステイベって何？">
          サポカのイベントで、例えば前イベはスキルやアイテム、後イベはランダム強化やチェンジ、ステイベはパラメータ上昇が起こるイベントを指します。
        </QA>
        <QA q="探索で出てきたサポカ編成がおかしい">
          探索のされ方によっては誤った編成を算出する可能性があります。何回か押してみるか、後述するBAN・固定機能を使って調節してみてください。
        </QA>
        <QA q="BAN・固定・レンタルNGって何？">
          サポカの探索における設定で、
          <br />
          ・BAN：そのサポカを編成に含まないように組む
          <br />
          ・固定：そのサポカを編成に含むように組む
          <br />
          ・レンタルNG：そのサポカがレンタルされないように組む（自前のものを入れるか編成しない）
          <br />
          と決める設定のことです。
          <br />
          例：おいしい顔いただきが編成に入ってくるけど札が弱いから入れたくない→BAN
          <br />
          クールダウンが編成に入らないけど札が強いから入れたい→固定
          <br />
          新しいコインガチャサポカで、完凸で持っている人がいない。→レンタルNG
        </QA>
        <QA q="入力したデータはどこに保存されますか">
          すべてお使いのブラウザの中に保存されます（localStorage）。サーバーに送られたりするといったことはありません。別の端末や履歴削除では消えるので、大事な状態は右上の「セーブデータ」で保存し、所持状況はCSVで控えを取ってください。詳しくは下の「データの保存と注意」を読んでください。
        </QA>
      </div>

      {/* ---------------------------------------------------------------- データの保存と注意 */}
      <h2 id="storage" className={H2}>
        データの保存と注意
      </h2>
      <div className={`${CARD} flex flex-col gap-3`}>
        <p className={P}>
          所持状況・メモリー・発動回数・セーブデータなど、このサイトで入力した内容は
          <b>すべてお使いのブラウザの中（localStorage）</b>に保存されます。サーバーには送られず、運営者も見られません。
        </p>
        <div>
          <p className="text-sm font-bold text-slate-900">消えることがあります</p>
          <ul className="mt-1 list-disc pl-5 text-sm leading-relaxed text-slate-700">
            <li>ブラウザの「閲覧履歴・サイトデータの削除」をすると消えます（Cookie やキャッシュと一緒に消えることが多いです）。</li>
            <li>別の端末・別のブラウザ・シークレット（プライベート）モードには引き継がれません。</li>
            <li>スマホのブラウザは、長く開かないと自動でサイトデータを消すことがあります（Safari など）。</li>
            <li>ブラウザの保存容量がいっぱいのときは保存に失敗することがあります。</li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">更新や不具合で使えなくなることもあります</p>
          <ul className="mt-1 list-disc pl-5 text-sm leading-relaxed text-slate-700">
            <li>
              サイトの更新で保存の形式を変えることがあります。できるだけ古いデータを引き継ぐようにしていますが、
              <b>引き継げないときは初期状態に戻る</b>ことがあります。
            </li>
            <li>不具合で保存が壊れることもゼロではありません。壊れたデータは読み飛ばして初期状態にします。</li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">おすすめの控え方</p>
          <ul className="mt-1 list-disc pl-5 text-sm leading-relaxed text-slate-700">
            <li>大事な育成の状態は、計算ページ右上の<b>「セーブデータ」</b>で保存しておく。</li>
            <li>所持状況は、所持状況ページの<b>CSV書き出し</b>で控えを取っておく（別の端末に持っていくときもこれで）。</li>
            <li>評価値や編成は<b>「画像に出力」</b>で残しておくと、消えても見返せます。</li>
          </ul>
        </div>
      </div>

      <p className="mt-8 text-xs text-slate-500">
        計算式や数値表は、計算ページ右上の「使い方・計算式ヘルプ」にあります。
      </p>
    </div>
  );
}
