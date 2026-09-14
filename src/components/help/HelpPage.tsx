import { useEffect, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  CalendarCheck,
  ChevronDown,
  Dumbbell,
  Info,
  LayoutGrid,
  ListOrdered,
  Save,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Table2,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";

/**
 * ヘルプページ（/help）。使い方の流れ・ページの構成・手順（画面の要点を簡単な図で）・
 * プロデュースと発動回数の関係・用語・よくある質問・データの保存の注意。
 * 「#produce」などのハッシュ付きで開くと、その見出しまでスクロールする（計算ページの ⓘ から飛ぶ）。
 * 画面写真は使わない（小さくて見づらいため）。要点だけを大きめの文字で描いた模式図にする。
 */
const SECTIONS = [
  { id: "flow", label: "全体の流れ" },
  { id: "pages", label: "ページの構成" },
  { id: "steps", label: "使い方" },
  { id: "produce", label: "プロデュースと発動回数" },
  { id: "tips", label: "操作のヒント" },
  { id: "terms", label: "用語" },
  { id: "faq", label: "よくある質問" },
  { id: "storage", label: "データの保存と注意" },
];

const H2 = "mb-3 mt-10 scroll-mt-20 text-lg font-bold text-slate-900 first:mt-0";
const H3 = "text-base font-bold text-slate-900";
const P = "text-sm leading-relaxed text-slate-700";
const CARD = "rounded-xl border border-slate-200 bg-white p-4";

/* ---------------------------------------------------------------- 流れ図 */

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

/* ---------------------------------------------------------------- 画面の模式図（押せない） */

/** 模式図の外枠 */
function Mock({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div
      aria-hidden
      className="my-3 max-w-xl select-none rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm text-slate-800 shadow-sm"
    >
      {title && (
        <div className="mb-2 -mx-3 -mt-3 rounded-t-xl bg-blue-600 px-3 py-1.5 text-sm font-bold text-white">
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

/** 設定欄の1行（番号・ラベル・値） */
function MockRow({
  no,
  label,
  value,
  unset,
  aside,
}: {
  no: number;
  label: string;
  value: string;
  unset?: boolean;
  /** 欄の右に添えるボタンなど */
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-2">
      <div className="mb-0.5 flex items-center gap-1.5">
        <span
          className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-black ${
            unset ? "bg-amber-400 text-amber-950" : "bg-blue-600 text-white"
          }`}
        >
          {no}
        </span>
        <span className="text-xs font-bold text-slate-700">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div
          className={`flex min-w-0 flex-1 items-center justify-between rounded-md border px-2 py-1 text-sm ${
            unset ? "border-amber-400 bg-amber-50 font-bold text-amber-700" : "border-slate-300 bg-white"
          }`}
        >
          <span className="truncate">{value}</span>
          <ChevronDown size={14} className="shrink-0 text-slate-400" />
        </div>
        {aside}
      </div>
    </div>
  );
}

/** ボタンの模式 */
function MockBtn({
  tone = "secondary",
  children,
}: {
  tone?: "primary" | "secondary" | "action" | "indigo";
  children: React.ReactNode;
}) {
  const TONE = {
    primary: "bg-blue-600 text-white",
    secondary: "border border-slate-300 bg-white text-slate-700",
    action: "border border-blue-300 bg-blue-50 text-blue-800",
    indigo: "bg-indigo-600 text-white",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-bold ${TONE}`}
    >
      {children}
    </span>
  );
}

/** 用語の1項目 */
/** 操作のヒントのカード（アイコン＋短い見出し＋本文） */
function Tip({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
      <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-slate-900">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
          {icon}
        </span>
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-slate-600">{children}</p>
    </div>
  );
}

function Term({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-2 last:border-b-0 sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-sm font-bold text-slate-900 sm:w-40">{name}</dt>
      <dd className={P}>{children}</dd>
    </div>
  );
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

export default function HelpPage() {
  const { hash } = useLocation();
  // ハッシュ付きで来たら、その見出しへ（親 App の ScrollToTop が先頭へ戻したあとに動かす）
  useEffect(() => {
    if (!hash) return;
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
        計算ページは「設定欄を上から埋める → 青いボタンで探索 → 手で調整」の順に上から並んでいます。
      </p>
      <Flow>
        <FlowBox
          no={1}
          tone="blue"
          title="設定欄を埋める"
          body="育成シナリオ・アイドル（右に特訓・才能開花）・プロデュース・メモリー・所持状況。黄色の欄が未選択です。"
        />
        <FlowBox
          no={2}
          tone="blue"
          title="青いボタンで探索"
          body="サポカ6枚とレッスンの踏み方を自動で探し、評価値が高い組み合わせを「サポカ編成と踏み方」に入れます。"
        />
        <FlowBox
          no={3}
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
        メインは計算ページです。ほかのページは「探索に使う設定」と「見るだけの表」の2種類で、上のナビも左からこの順（計算｜所持状況・発動回数・サポカ設定｜サポカ点数表・データベース｜ヘルプ）に並んでいます。
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr]">
        <div className={`${CARD} border-blue-300 bg-blue-50/40`}>
          <p className="text-sm font-bold text-slate-900">計算</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            設定・探索・調整・評価値。ふだん使うのはここだけです。
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
                データベース
              </Link>
              : アビリティ・イベントの一覧
            </li>
          </ul>
        </div>
      </div>

      {/* ---------------------------------------------------------------- 使い方 */}
      <h2 id="steps" className={H2}>
        使い方
      </h2>
      <div className="flex flex-col gap-8">
        <div>
          <h3 className={H3}>1. 設定欄を上から埋める</h3>
          <p className={`mt-1 ${P}`}>
            青い帯の「設定欄」の欄を上から順に押して選びます。黄色い欄が未選択です。
            1〜4がそろうと、すぐ下の青いボタンが押せるようになります。
          </p>
          <Mock title="設定欄">
            <div className="grid gap-x-3 sm:grid-cols-2">
              <MockRow no={1} label="育成シナリオ" value="H.I.F.（マスター）" />
              <MockRow
                no={2}
                label="アイドル・Pアイドル"
                value="花海咲季 / Fighting My Way"
                aside={
                  <MockBtn>
                    <Settings size={11} />
                    特訓6・開花4
                  </MockBtn>
                }
              />
              <MockRow no={3} label="プロデュース" value="センス 花ロボ(黄)" />
              <MockRow no={4} label="メモリー" value="選んでください" unset />
              <MockRow no={5} label="所持状況" value="全サポカ完凸（既定）" unset />
            </div>
          </Mock>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-700">
            <li>
              <b>アイドル・Pアイドル</b>: 選ぶと、欄の右のボタンで<b>特訓・才能開花</b>を変えられます。
            </li>
            <li>
              <b>プロデュース</b>: Pアイドルのプランで使えるものだけが出ます（
              <a href="#produce" className="font-semibold text-blue-700 underline">
                くわしくは下
              </a>
              ）。
            </li>
            <li>
              <b>メモリー</b>: 枠をクリックしてその場で作れます（保存は任意）。実物が決まっていなければ
              <b>「汎用メモリーを入れる」</b>。
            </li>
            <li>
              <b>所持状況</b>: 既定は全サポカ完凸。プルダウンで保存してある所持状況に切り替えられ、一番下の
              <b>「自分の所持状況を入力・編集」</b>で所持状況ページへ。探索はここに登録したサポカから編成します。
            </li>
          </ul>
        </div>

        <div>
          <h3 className={H3}>2. 青いボタンで探索</h3>
          <p className={`mt-1 ${P}`}>
            設定欄がそろうと押せます。サポカ6枚とレッスンの踏み方を自動で探して「サポカ編成と踏み方」に入れ、評価値が動きます。
          </p>
          <Mock>
            <div className="flex flex-wrap items-center gap-2">
              <MockBtn tone="primary">
                <Sparkles size={12} />
                評価値が最も高くなる編成と踏み方を求める
              </MockBtn>
              <MockBtn tone="primary">▾</MockBtn>
              <MockBtn>
                <Settings size={11} />
                探索の条件
              </MockBtn>
            </div>
          </Mock>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-700">
            <li>
              <b>▾</b> から「編成だけ」「踏み方だけ」も選べます。
            </li>
            <li>
              <b>探索の条件</b>で、SP率持ちの枚数・タイプ割合・最低/最高ステなどを指定できます。
            </li>
            <li>探索は近似なので、納得できないときは何回か押すか、BAN・固定で調整してください。</li>
          </ul>
        </div>

        <div>
          <h3 className={H3}>3. 結果を見る</h3>
          <p className={`mt-1 ${P}`}>
            <b>評価値</b>（右上。スマホでは編成の上）と<b>育成後のステータス</b>が結果です。「サポカ編成と踏み方」には、サポカ6枚・レッスンの踏み方・授業・選抜の配分が入ります。
          </p>
          <Mock>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-lg border-2 border-blue-600 bg-white px-4 py-2 text-center">
                <div className="text-[10px] font-semibold text-slate-500">評価値</div>
                <div className="text-2xl font-bold text-blue-600">35,318</div>
              </div>
              <div className="flex-1 text-xs text-slate-600">
                手で変えるたびに、この数字がその場で動きます。気に入ったら右上の「セーブデータ」で保存。
              </div>
            </div>
          </Mock>
        </div>

        <div>
          <h3 className={H3}>4. 手で調整する</h3>
          <p className={`mt-1 ${P}`}>
            「サポカ編成と踏み方」のカードで、実際の育成に寄せていきます。どれも変えるとその場で評価値と育成後のステータスが動きます。
          </p>
          <Mock title="サポカ編成と踏み方">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <MockBtn tone="action">
                <CalendarCheck size={11} />
                レッスン等の踏み方
              </MockBtn>
              <MockBtn tone="action">
                <ListOrdered size={11} />
                発動回数
              </MockBtn>
              <MockBtn>全て外す</MockBtn>
            </div>
            <div className="mb-2 grid grid-cols-6 gap-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex aspect-[4/3] items-center justify-center rounded-md border border-slate-300 bg-white text-[10px] text-slate-400"
                >
                  サポカ
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <span className="w-12 font-bold text-slate-500">レッスン</span>
              {["Da", "Da", "Vi", "Da", "Vi", "Da", "Da", "Vi"].map((t, i) => (
                <span
                  key={i}
                  className={`flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold text-white ${
                    t === "Da" ? "bg-blue-500" : "bg-yellow-400 text-yellow-950"
                  }`}
                >
                  {t}
                </span>
              ))}
            </div>
          </Mock>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-700">
            <li>
              <b>レッスン等の踏み方</b>: レッスン8回のメイン／サブ／SP、授業のタイプ、選抜のスコア（またはログの上昇幅）を入れる画面。
            </li>
            <li>
              <b>発動回数</b>: この育成でのアビリティ発動回数。ここで変えても発動回数ページのデフォルトは変わりません（
              <a href="#produce" className="font-semibold text-blue-700 underline">
                くわしくは下
              </a>
              ）。
            </li>
            <li>
              <b>サポカ枠をクリック</b>: 入れ替え。凸・固定・BAN・レンタルNGも選択画面で。
            </li>
            <li>
              <b>踏み方のチップをクリック</b>: 「レッスン等の踏み方」と同じ画面が開きます。
            </li>
            <li>
              <b>前イベ・後イベ・ステイベの発動を調整</b>（黄色い帯）: サポカごとのイベントの発動を変えられます。
            </li>
          </ul>
        </div>

        <div>
          <h3 className={H3}>5. メモリーを作る</h3>
          <p className={`mt-1 ${P}`}>
            設定欄のメモリーを押すと、4つの枠が出ます。枠をクリック → 下の値のボタンを押すと、その場で中身が入ります（保存しなくても計算に使えます）。
          </p>
          <Mock title="メモリーを4枚選ぶ">
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-2">
              <MockBtn tone="indigo">
                <Sparkles size={11} />
                汎用メモリーを入れる
              </MockBtn>
              <span className="text-xs text-slate-600">メインパラボ60点×4が入る（実物が決まっていないとき）</span>
            </div>
            <div className="mb-2 grid w-64 grid-cols-4 gap-1.5">
              {["Vo+2.8%", "Da+2.1%", "編集中", "＋"].map((t, i) => (
                <div
                  key={i}
                  className={`flex h-14 items-center justify-center rounded-md border text-[10px] font-semibold ${
                    i === 2
                      ? "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-300"
                      : i === 3
                        ? "border-dashed border-slate-300 bg-white text-blue-600"
                        : "border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  {t}
                </div>
              ))}
            </div>
            <div className="rounded-lg border-2 border-blue-300 bg-white p-2">
              <div className="mb-1 text-xs font-bold">枠3 のメモリー</div>
              <div className="flex flex-wrap gap-1">
                {["+1.4%", "+2.1%", "+2.8%", "+3.5%", "+10", "+15", "+20", "+25"].map((v) => (
                  <span
                    key={v}
                    className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600"
                  >
                    {v}
                  </span>
                ))}
              </div>
              <div className="mt-1.5 flex gap-1.5">
                <MockBtn tone="primary">メモリーとして保存</MockBtn>
                <MockBtn>この枠を空にする</MockBtn>
              </div>
            </div>
          </Mock>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-700">
            <li>
              <b>汎用メモリーを入れる</b>: 「メインパラボ60点」のテンプレを4枠すべてに入れます。メインパラボは、パラボ+2.8%を踏み方で母数が大きい上位2タイプに、残り1タイプに固定+20を付けるもので、踏み方を変えると付け先も自動で変わります。
            </li>
            <li>
              <b>保存は任意</b>: 「メモリーとして保存」すると一覧から何度でも入れられ、4枚そろえば「セット」としても保存できます。
            </li>
            <li>
              <b>保存したメモリー</b>: 一覧のカードをクリックで枠に入れる、✎で中身を直接編集、−で外す。
            </li>
          </ul>
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

      {/* ---------------------------------------------------------------- 操作のヒント */}
      <h2 id="tips" className={H2}>
        操作のヒント
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Tip icon={<SlidersHorizontal size={16} />} title="数値の入力">
          数値の欄は<b>右クリックでスライダー</b>が開きます（大きい数字向け）。ドラッグしたまま上下に離すと微調整（×1/10・×1/100）、ホイールで±1（Shift＝±10、Ctrl＝±100）。
        </Tip>
        <Tip icon={<LayoutGrid size={16} />} title="サポカ枠">
          枠をクリックするとカードを選べます。選択画面の行の右のボタンで<b>凸・固定・BAN・レンタルNG</b>も変えられます。
        </Tip>
        <Tip icon={<Dumbbell size={16} />} title="特訓・才能開花">
          設定欄のアイドル・Pアイドルの欄の右のボタンから。評価値の横のアイドル画像の歯車からも開けます。
        </Tip>
        <Tip icon={<CalendarCheck size={16} />} title="踏み方のチップ">
          大きい四角がメイン、右下の小さい印がサブ、薄い点線の枠がSPなし（通常レッスン）。授業（営業）は順番どおり、選抜はタイプ別スコアの配分バーです。チップをクリックすると編集できます。
        </Tip>
        <Tip icon={<Sparkles size={16} />} title="プロデュースの【プラン】">
          【センス】などのプラン名は、探索の条件「試験補助を強める」で、アイテムをどのスタイル向けに評価するかの判定に使います。
        </Tip>
        <Tip icon={<Save size={16} />} title="セーブデータと画像出力">
          右上の「セーブデータ」で今の育成の状態をまるごと保存。読み込めば<b>評価値まで同じ状態に戻ります</b>。評価値の下の「画像に出力」で1枚の画像にできます。
        </Tip>
        <Tip icon={<Table2 size={16} />} title="パラボ変換表">
          「サポカ編成と踏み方」の開始時のステータスの右にあります。パラメータボーナス%が今の踏み方で何点ぶんのステになるかを確認できます。
        </Tip>
        <Tip icon={<Info size={16} />} title="ⓘ と計算式">
          用語の横の ⓘ を押すと、その項目の説明が出ます。計算式は計算ページ右上の「計算式・数値表」にあります。
        </Tip>
      </div>

      {/* ---------------------------------------------------------------- 用語 */}
      <h2 id="terms" className={H2}>
        用語
      </h2>
      <dl className={CARD}>
        <Term name="評価値">
          プロデュース評価の目安。ステータス合計×係数＋スター性などで決まります（式は計算ページの「計算式・数値表」）。
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
        <QA id="faq-produce" q="設定欄の「プロデュース」って何？">
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
        計算式や数値表は、計算ページ右上の「計算式・数値表」にあります。
      </p>
    </div>
  );
}
