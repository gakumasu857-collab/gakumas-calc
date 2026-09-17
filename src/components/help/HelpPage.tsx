import { useEffect, useRef, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
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
 * プロデュースとは（＝アビリティ発動回数）・操作のヒント・用語（画面に出る言葉はここで全部説明する。よくある質問と重複させない）・
 * よくある質問・データの保存の注意。
 * 「#produce」「#term-flags」などのハッシュ付きで開くと、その見出しまでスクロールする（ページ内リンク用。
 * 計算ページの ⓘ はその場で説明を出すので、ここへは飛ばない）。
 * 画面写真は使わない（小さくて見づらいため）。要点だけを大きめの文字で描いた模式図にする。
 */
const SECTIONS = [
  { id: "flow", label: "全体の流れ" },
  { id: "pages", label: "ページの構成" },
  { id: "steps", label: "使い方" },
  { id: "produce", label: "プロデュースとは" },
  { id: "tips", label: "操作のヒント" },
  { id: "terms", label: "用語" },
  { id: "faq", label: "Q & A" },
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
  tone?: "primary" | "secondary" | "action" | "indigo" | "tab";
  children: React.ReactNode;
}) {
  const TONE = {
    primary: "bg-blue-600 text-white",
    secondary: "border border-slate-300 bg-white text-slate-700",
    action: "border border-blue-300 bg-blue-50 text-blue-800",
    indigo: "bg-indigo-600 text-white",
    tab: "bg-sky-500 text-white",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-bold ${TONE}`}
    >
      {children}
    </span>
  );
}

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

/**
 * 用語の1項目（id はページ内リンク用）。説明が長いので閉じておき、言葉を押すと開く。
 * ページ内リンク（#term-flags など）で来たときは開いておく。
 */
function Term({ id, name, children }: { id?: string; name: string; children: React.ReactNode }) {
  const { hash } = useLocation();
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (id && hash === `#${id}` && ref.current) ref.current.open = true;
  }, [hash, id]);
  return (
    <details ref={ref} id={id} className="group scroll-mt-20 border-b border-slate-100 last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 py-2 text-sm font-bold text-slate-900 hover:text-blue-700 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          size={14}
          className="shrink-0 text-slate-400 transition group-open:rotate-90"
        />
        {name}
      </summary>
      <div className={`pb-2.5 pl-5 ${P}`}>{children}</div>
    </details>
  );
}

/** 用語をまとめて開く・閉じる */
function TermsToggle() {
  const setAll = (open: boolean) => {
    document
      .querySelectorAll<HTMLDetailsElement>("#terms-list details")
      .forEach((d) => {
        d.open = open;
      });
  };
  const btn =
    "rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:border-blue-400 hover:text-blue-700";
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
      <span>言葉を押すと説明が開きます。</span>
      <button type="button" onClick={() => setAll(true)} className={btn}>
        すべて開く
      </button>
      <button type="button" onClick={() => setAll(false)} className={btn}>
        すべて閉じる
      </button>
    </div>
  );
}

/** 用語のグループ（見出し＋用語の一覧） */
function TermGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={CARD}>
      <p className="mb-1 text-xs font-black tracking-wide text-slate-400">{title}</p>
      <div>{children}</div>
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
      <Flow>
        <FlowBox
          no={1}
          tone="blue"
          title="設定欄を埋める"
          body="育成シナリオ・Pアイドル・プロデュース・メモリー・所持状況を設定。黄色の欄が未選択です。"
        />
        <FlowBox
          no={2}
          tone="blue"
          title="ボタンを押して探索"
          body="サポカ6枚とレッスンの踏み方等を自動で探索し、評価値が高い組み合わせを入れます。"
        />
        <FlowBox
          no={3}
          tone="emerald"
          title="自分で微調整する"
          body="レッスン等の踏み方・発動回数・サポカの前イベ、後イベ等。変更がすぐに評価値に適用されます。"
        />
      </Flow>
      <p className={`mt-3 ${P}`}>
        結果は画面右側（スマホでは編成の上）に出ます。
        気に入った編成は右上の<b>「セーブデータ」</b>から保存、<b>「画像に出力」</b>で1枚の画像で見ることができます。
      </p>

      {/* ---------------------------------------------------------------- ページの構成 */}
      <h2 id="pages" className={H2}>
        ページの構成
      </h2>
      <p className={`mb-3 ${P}`}>
        メインは計算ページです。ほかのページは「自動編成機能の設定」（探索が参照する設定）と「見るだけの表」の2種類で、上のナビも左からこの順（計算｜自動編成機能の設定｜点数表・データベース｜ヘルプ）に並んでいます。
        ナビの「自動編成機能の設定」を押すと、所持状況・プロデュース設定・サポカ設定の3つが出ます。
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr]">
        <div className={`${CARD} border-blue-300 bg-blue-50/40`}>
          <p className="text-sm font-bold text-slate-900">計算</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            設定・探索・調整・評価値。主に使う場所。
          </p>
        </div>
        <div className={CARD}>
          <p className="text-sm font-bold text-slate-900">自動編成機能の設定</p>
          <ul className="mt-1 list-disc pl-4 text-xs leading-relaxed text-slate-600">
            <li>
              <Link to="/support" className="font-semibold text-blue-700 underline">
                所持状況
              </Link>
              : 持っているサポカの凸を入力できます。自動探索はここを参照します。
            </li>
            <li>
              <Link to="/ability-counts" className="font-semibold text-blue-700 underline">
                プロデュース設定
              </Link>
              : サポカのアビリティ発動回数を設定できます。計算ページ設定欄のプロデュースで選択可能。
            </li>
            <li>
              <Link to="/card-settings" className="font-semibold text-blue-700 underline">
                サポカ設定
              </Link>
              : 前イベ・後イベの既定、固定・BAN・レンタルNGなどの設定（→
              <a href="#term-flags" className="font-semibold text-blue-700 underline">
                用語
              </a>
              ）
            </li>
          </ul>
        </div>
        <div className={CARD}>
          <p className="text-sm font-bold text-slate-900">表（見るだけ）</p>
          <ul className="mt-1 list-disc pl-4 text-xs leading-relaxed text-slate-600">
            <li>
              <Link to="/card-scores" className="font-semibold text-blue-700 underline">
                点数表
              </Link>
              : 全サポカの点数が一覧で見れます。
            </li>
            <li>
              <Link to="/database" className="font-semibold text-blue-700 underline">
                データベース
              </Link>
              : サポカとPアイドルのデータが見れます。
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
            「設定欄」を埋めます。黄色い欄が未選択です。
            1〜4がそろうと、下の青いボタンが押せるようになります。
          </p>
          <Mock title="設定欄">
            <div className="grid gap-x-3 sm:grid-cols-2">
              <MockRow no={1} label="育成シナリオ" value="H.I.F" />
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
              <b>アイドル・Pアイドル</b>: 育成するPアイドルを選択。特訓・才能開花を変えられます。
            </li>
            <li>
              <b>プロデュース</b>: サポカのアビリティ発動回数を設定します。（
              <a href="#produce" className="font-semibold text-blue-700 underline">
                詳しくはここ
              </a>
              ）
            </li>
            <li>
              <b>メモリー</b>: 枠をクリックして入力できます。作ったメモリーを保存することもできます。メインのタイプ二つが自動でパラボになる汎用メモリーもあります。
            </li>
            <li>
              <b>所持状況</b>: 既定は全サポカ完凸です。プルダウンで保存してある所持状況に切り替えられ、一番下の
              <b>「自分の所持状況を入力・編集」</b>で所持状況ページへ遷移します。探索はここで登録したサポカから編成します。
            </li>
          </ul>
        </div>

        <div>
          <h3 className={H3}>2. ボタンを押して探索</h3>
          <p className={`mt-1 ${P}`}>
            設定欄を埋めると押せます。サポカ6枚とレッスンの踏み方を自動で探索します。
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
              <MockBtn tone="primary">▾</MockBtn> から「編成だけ探索」「踏み方だけ探索」も選べます。
            </li>
            <li>
              <MockBtn>
                <Settings size={11} />
                探索の条件
              </MockBtn>で、タイプの割合・SP率持ちの枚数・最低/最高ステなどを指定できます。
            </li>
            <li>
              探索は近似なので、納得できないときは何回か押すか、BAN・固定で調整してください（
              <a href="#term-flags" className="font-semibold text-blue-700 underline">
                詳しくはここ
              </a>
              ）。
            </li>
          </ul>
        </div>

        <div>
          <h3 className={H3}>3. 結果を見る</h3>
          <Mock>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-lg border-2 border-blue-600 bg-white px-4 py-2 text-center">
                <div className="text-[10px] font-semibold text-slate-500">評価値</div>
                <div className="text-2xl font-bold text-blue-600">35,318</div>
              </div>
              <div className="flex-1 text-xs text-slate-600">
                発動回数やレッスンの踏み方を変えるたびに、評価値に適用されます。この数字がその場で動きます。気に入ったら右上の「セーブデータ」で保存。
              </div>
            </div>
          </Mock>
        </div>

        <div>
          <h3 className={H3}>4. 自分で微調整する</h3>
          <p className={`mt-1 ${P}`}>
            「サポカ編成と踏み方」で、実際の育成に寄せていきます。
          </p>
          <Mock title="サポカ編成と踏み方">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-500">画面の左端のタブ:</span>
              <MockBtn tone="tab">
                <ListOrdered size={11} />
                プロデュース
              </MockBtn>
              <MockBtn tone="tab">
                <CalendarCheck size={11} />
                レッスン等の踏み方
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
              <b>レッスン等の踏み方</b>: レッスン8回のメイン／サブ／SP、授業のタイプ、選抜のスコア（またはステ）を入れる画面。
            </li>
            <li>
              <b>プロデュース</b>: この育成でのアビリティ発動回数。ここで変えても探索に使用される回数は変わりません。（
              <a href="#produce" className="font-semibold text-blue-700 underline">
                くわしくは下
              </a>
              ）。
            </li>
            <li>
              <b>サポカ枠をクリック</b>: サポカを入れ替えられます。凸・固定・BAN・レンタルNGの設定も選択画面で設定可能です。
            </li>
            <li>
              <b>踏み方の場所をクリック</b>: 「レッスン等の踏み方」と同じ画面が開きます。
            </li>
            <li>
              <b>前イベ・後イベ・ステイベの発動を調整</b>（黄色い帯）: 編成サポカのイベントの発動を変えられます。
            </li>
          </ul>
        </div>

        <div>
          <h3 className={H3}>5. メモリーを作る</h3>
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
              <b>汎用メモリーを入れる</b>: 「メインパラボ60点」のメモリーを4枠すべてに入れます。メインパラボは、パラボを価値が高い上位2タイプに、残り1タイプに固定値を付けるもので、踏み方を変えると付け先も自動で変わります。
            </li>
            <li>
              <b>メモリーを保存</b>: 「メモリーとして保存」すると一覧からいつでも選択できるようになります。
            </li>
            <li>
              <b>メモリーセットとして保存</b>: メモリーセットはメモリー4枚のセットです。保存すれば、以降メモリーセットを選択することで4枚まとめて入力できます。
            </li>
            <li>
              <b>メモリーの編集・操作</b>: 一覧からクリックで枠に入れられます。✎で中身を直接編集、−で外す。
            </li>
          </ul>
        </div>
      </div>

      {/* ---------------------------------------------------------------- プロデュースとは */}
      <h2 id="produce" className={H2}>
        プロデュースとは
      </h2>
      <p className={`mb-3 ${P}`}>
        「プロデュース」は、サポカのアビリティが<b>何回発動する想定か</b>の設定です（＝アビリティ発動回数）。
        差し入れやお出かけの回数、ドリンク獲得、スキル強化・削除の回数などの数値が入っていて、探索と評価値の計算に使います。
        「センス花ロボ（黄）」などはゲーム内の育成スタイルの通称で、選んだPアイドルのプランで使えるものだけ選べます。
      </p>
      <Flow>
        <FlowBox
          tone="slate"
          title="プロデュース設定ページ"
          body="プロデュースごとの「デフォルトの回数」。探索はこの回数で編成を決めます。自分のプロデュースを作ったり、回数を変えたりできます。"
        />
        <FlowBox tone="blue" title="探索" body="プロデュースの回数と所持状況から、サポカ6枚と踏み方を決めます。" />
        <FlowBox
          tone="emerald"
          title="計算ページ左端の「プロデュース」タブ"
          body="編成が決まったあとの「この育成での回数」を調整。変えたものは黄色い背景と「変更」の印になり、「上書き保存」を押すとデフォルトにもなります（緑の数字＝サポカのイベント分は含まずに保存）。"
        />
      </Flow>
      <p className={`mt-3 ${P}`}>
        プロデュース設定ページの回数は探索の条件になるほか、左端のタブでまだ変えていないアビリティにもそのまま使われます。
        左端のタブで変えた回数は、そちらが優先されます。どちらの回数にも、サポカの前イベ・後イベによる上乗せ分は含めません（計算のときに編成に合わせて自動で足されます）。
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
        <Tip icon={<CalendarCheck size={16} />} title="踏み方の表示">
          大きい四角がメイン、右下の小さい印がサブ、薄い点線の枠がSPなし（通常レッスン）。授業（営業）は順番どおり、選抜はタイプ別スコアの配分バーです。チップをクリックすると編集できます。
        </Tip>
        <Tip icon={<Save size={16} />} title="セーブデータと画像出力">
          右上の「セーブデータ」で今の育成の状態をまるごと保存。読み込めば<b>評価値まで同じ状態に戻ります</b>。評価値の下の「画像に出力」で1枚の画像にできます。
        </Tip>
        <Tip icon={<Table2 size={16} />} title="パラボ変換表">
          「サポカ編成と踏み方」の開始時のステータスの右にあります。パラメータボーナス%が今の踏み方で何点ぶんのステになるかを確認できます。
        </Tip>
        <Tip icon={<ListOrdered size={16} />} title="左端のタブ">
          画面の左端に「プロデュース」「レッスン等の踏み方」のタブがあります。開いて実際の育成に合わせて変えると、評価値がその場で動きます。
        </Tip>
        <Tip icon={<Info size={16} />} title="ⓘ と計算式">
          用語の横の ⓘ を押すと、その項目の説明が出ます。計算式は計算ページ右上の「計算式・数値表」にあります。
        </Tip>
        <Tip icon={<SlidersHorizontal size={16} />} title="詳細設定">
          設定欄の一番下の「調整」から、<b>親愛度</b>（スター性・初期Pポイント・最大体力）と、H.I.Fでは<b>H.I.Fボーナス</b>のレベルを変えられます。どちらも既定は最大です。
        </Tip>
      </div>

      {/* ---------------------------------------------------------------- 用語 */}
      <h2 id="terms" className={H2}>
        用語
      </h2>
      <p className={`mb-3 ${P}`}>
        画面に出てくる言葉の説明です。画面の ⓘ を押すと、その場でも説明が出ます。
      </p>
      <TermsToggle />
      <div id="terms-list" className="flex flex-col gap-3">
        <TermGroup title="設定欄と探索">
          <Term id="term-premise" name="設定欄">
            計算ページの左上にある、育成の前提を入れる欄。育成シナリオ・アイドル（Pアイドル）・プロデュース・メモリー・所持状況と、本戦や試験の点数。黄色い欄が未選択で、1〜4がそろうと探索のボタンが押せます。
          </Term>
          <Term name="育成シナリオ">
            H.I.F・N.I.A（マスター）・初（レジェンド）の3つ。試験の種類や評価値の式がシナリオごとに違います（式は計算ページ右上の「計算式・数値表」）。
          </Term>
          <Term id="term-produce" name="プロデュース">
            サポカのアビリティが何回発動する想定かの設定（＝アビリティ発動回数）。「センス花ロボ（黄）」などは育成スタイルの通称で、選んだPアイドルのプランで使えるものだけ選べます（
            <a href="#produce" className="font-semibold text-blue-700 underline">
              くわしくは上
            </a>
            ）。
          </Term>
          <Term id="term-counts" name="アビリティ発動回数">
            サポカのアビリティ（差し入れ・お出かけ・ドリンク獲得・スキル強化など）が育成中に発動する回数。プロデュース設定ページの値がデフォルト（探索の条件）、計算ページ左端の「プロデュース」タブの値がこの育成での回数です。サポカの前イベ・後イベによる上乗せ分は含めず、計算のときに自動で足されます。
          </Term>
          <Term name="上書き保存・「変更」の印">
            左端の「プロデュース」タブで回数やスケジュールを変えたものは、薄い黄色の背景と「変更」の印で表示されます。「上書き保存」を押すと、その回数がプロデュースのデフォルトになり、次の探索からその回数で計算します。保存されるのはプロデュースの回数だけで、緑の数字（サポカの前イベ・後イベによる上乗せ）は含みません。
          </Term>
          <Term name="スケジュール（週ごとの選択）">
            お出かけ・相談・差し入れ（初レジェンドは活動支給）・特別指導の回数は、週（日）ごとに1つ選ぶ形式で決めます。選んだ回数がそのまま発動回数になり、差し入れを踏むと獲得するPポイントの量が増えます。デフォルトはプロデュース設定ページで、セット名を押して「スケジュール」を開くか、それらのアビリティのどれかを押します。計算ページ左端の「プロデュース」タブで選び直すとこの育成だけに適用されます（「上書き保存」で次回以降参照）。
          </Term>
          <Term name="テンプレ・セーブデータ用">
            プロデュースの種類。テンプレはもともと用意されているプロデュース、セーブデータ用はセーブデータと一緒に保存された控え（プロデュース設定ページでは普段隠れています）。
          </Term>
          <Term name="プラン（センス・ロジック・アノマリー）">
            Pアイドルの育成プラン。プロデュースはプランに合うもの（センス→センス・好調・集中、ロジック→ロジック・好印象・やる気、アノマリー→アノマリー・全力・強気）だけ選べます。プラン外のサポカが編成に入っていると画像に出力できません。
          </Term>
          <Term name="特訓・才能開花">
            Pアイドルの強化。特訓はアイテムで上げる段階（最大6）、才能開花は同じPアイドルを重ねた回数（最大4）。設定欄のアイドル欄の右のボタン、または所持状況ページで変えられます。
          </Term>
          <Term id="term-memory" name="メモリー・メインパラボ・汎用メモリー">
            育成開始時に持ち込むメモリー4枚。ステータスの固定値とパラボが評価値に大きく効きます。「メインパラボ◯点」は、パラボを影響が大きい上位2タイプに、残り1タイプに固定値を割り当てるテンプレで、踏み方を変えると付け先も自動で変わります。「汎用メモリーを入れる」はメインパラボ60点を4枠すべてに入れます。
          </Term>
          <Term name="メモリーセット">
            メモリー4枚のセット。保存しておくと、一覧から4枚まとめて入れられます。
          </Term>
          <Term id="term-ownership" name="所持状況・凸・完凸">
            持っているサポカと凸（同じサポカを重ねた回数。最大4、4凸が完凸）、Pアイドルの特訓・才能開花。探索はここに登録したサポカから編成します。既定は「全サポカ完凸」で、所持状況ページで入力すると自分の所持状況に切り替わります。
          </Term>
          <Term name="レンタル">
            他のユーザーから借りる1枚（完凸扱い）。1育成に1枚まで。所持状況を変えて未所持になったサポカが編成に残っているときもレンタル扱いになり、2枚以上になると評価値の下の条件に「レンタル」のNGが出ます（探索し直すと1枚までに組み直します）。
          </Term>
          <Term id="term-flags" name="BAN・固定・レンタルNG">
            探索の条件。BAN＝そのサポカを編成に入れない、固定＝必ず入れる、レンタルNG＝レンタルで入れない（自前のものを入れるか編成しない）。サポカの選択画面の行の右のボタンで切り替えます。
            <br />
            例：「おいしい顔いただき～！」が編成に入ってくるけど札が弱いから入れたくない→BAN
            <br />
            「クールダウンは大切よ！」が編成に入らないけど札が強いから入れたい→固定
            <br />
            新しいコインガチャサポカで、完凸で持っている人がいない→レンタルNG
          </Term>
          <Term id="term-search" name="探索・探索の条件">
            「評価値が最も高くなる編成と踏み方を求める」ボタンで、所持状況のサポカから6枚とレッスンの踏み方を自動で選びます。近似なので、押し直すと結果が変わることがあります。「探索の条件」で、SP率持ちの枚数・タイプ割合・ステの高さの順・試験補助・ステージ用BAN・選抜の点数配分（H.I.F）・最低/最高ステ・取得回数を指定できます。
          </Term>
          <Term name="SP率持ちの枚数・タイプ割合">
            探索の条件（基本）。SP率持ちは「SPレッスン率上昇」を持つサポカを、レッスンを多く踏む上位2タイプにそれぞれ何枚入れるか。タイプ割合はサポカ6枠をタイプ別に何枚にするか（合計6未満なら残りは自由。アシストは自由枠）。
          </Term>
          <Term name="ステの高さの順">
            探索の条件（基本）。育成後のステータスがこの順（高い→低い）になる編成・踏み方を選びます。
          </Term>
          <Term name="試験補助・ステージ用BAN">
            探索の条件（基本）。「試験補助を強めにする」は試験に強いアイテム・ドリンク・SP率持ちのサポカを優先します。「ステージに入るPアイテム・スキルのサポカを編成しない」は、試験中に持ち込むPアイテムやスキルカードをくれるサポカを候補から外します（固定したサポカは残ります）。
          </Term>
          <Term name="選抜の点数配分（H.I.F）">
            探索の条件（基本。H.I.Fのときだけ出ます）。「選抜の点数配分を手で変えていたら、探索の前に確認する」がONだと、選抜のスコアやステ入力を手で変えたあとに探索（全自動・踏み方だけ）を押したとき、「このままの点数配分で探索する」か「点数配分も探索で決め直す」かを選べます。このままを選ぶと、点数配分は固定して、サポカ編成・レッスン・授業だけを探索します（実際の試験で思った通りに寄せられないとき用）。OFFにすると確認せず、いつも探索が決め直します。「選抜は3つとも極振りで探索する」は、選抜ごとにスコアを1つのタイプへ全部振った配分だけを試します（どのタイプに振るかは探索が決めます）。
          </Term>
          <Term name="最低/最高ステ・取得回数">
            探索の条件（詳細）。最低ステは各タイプの育成後ステータスの下限。最高ステは目標の上限で、探索はほかの2タイプを上限まで上げてから余る分だけそのタイプに回します（ほかの2タイプが上限なら、超えても条件を満たした扱い）。取得回数は、6枚のうち前イベを何枚取得し、後イベを何枚発動させるか（探索が終わると、その通りの取得状況が「サポカ編成と踏み方」の黄色い帯に反映されます。制限しないときは、探索のたびに前イベ・後イベはすべて発動する設定になります）。
          </Term>
        </TermGroup>

        <TermGroup title="サポカとイベント">
          <Term id="term-events" name="前イベ・後イベ・ステイベ">
            サポカのイベント。前イベはスキルやアイテム、後イベはランダム強化やチェンジ、ステイベはパラメータ上昇が起こるイベントです。既定はサポカ設定ページで決め、この育成での発動は「サポカ編成と踏み方」の黄色い帯で変えられます。探索（全自動・編成だけ・踏み方だけ）のたびに、前イベの取得・前イベの回数・後イベの発動は探索が書き換えます（取得回数の制限があればその通り、無ければすべて発動）。黄色い帯で手で変えた分は次の探索まで有効です。ステイベと強化のM/Aは手で決めたまま残ります。
          </Term>
          <Term name="点数（サポカの点数）">
            サポカ1枚が評価値にどれだけ効くかの目安（アビリティの効果量×発動回数などの合計）。点数表ページで全サポカを見られ、サポカの選択画面は点数順に並びます。点数の元になる表（ティア表）が無いカード（R・アシストなど）は点数が出ません。サポカの選択画面では、点数の下に「合計 +◯／−◯」（その枠をそのサポカに入れ替えたときの育成後の合計ステータスの増減。ほかの5枚との組み合わせと上限まで入れた値）も出て、並びを「合計ステの増減順」に変えられます。
          </Term>
          <Term name="アシスト">
            トレーナーなど、Vo/Da/Viのタイプを持たないサポカ。タイプ割合では自由枠に入り、「全タイプSPレッスン率」持ちは全タイプの1枚として数えます。
          </Term>
          <Term name="ワッペン">
            H.I.Fの用語。スキルカードを1枚取るごとにスター性+15（最大20回）されます。プロデュースの「スキル獲得」＋編成サポカの前イベ・後イベ分で発動回数が決まります。
          </Term>
        </TermGroup>

        <TermGroup title="踏み方と試験">
          <Term id="term-stepping" name="レッスン等の踏み方">
            レッスンでどのタイプを踏むか（メイン／サブ／SP）と、授業（営業）のタイプ、選抜（オーディション／試験）のスコア。左端の「レッスン等の踏み方」タブか、踏み方チップのクリックで編集します。「一括入力」でレッスン8回をまとめて入れられます。
          </Term>
          <Term name="メイン・サブ・SP・通常レッスン">
            レッスンはメインのタイプが大きく上がり、サブのタイプも少し上がります。SPレッスンは上昇が大きいレッスン、通常レッスンはSPでないレッスン。大きい四角がメイン、右下の小さい印がサブ、薄い点線の枠がSPなし。
          </Term>
          <Term id="term-sprate" name="SPレッスン率・表記外推定SP率・実現確率">
            SPレッスン率はゲーム内の表示と同じ値（サポカ＋Pアイドル。H.I.FはH.I.Fボーナスの+5%込み）。実際にSPレッスンが出る確率は、これに表記外推定SP率（既定: H.I.F 10%、N.I.Aと初 15%。「サポカ編成と踏み方」で変えられます）を足したものとして計算します。実現確率は、表示している踏み方通りにSP（とサブのタイプ）が出る確率です。
          </Term>
          <Term name="授業・営業">
            レッスン以外に、選んだ1タイプのステが上がる週（H.I.Fは授業、N.I.Aは営業。パラボは掛かりません）。
          </Term>
          <Term name="選抜・オーディション・試験・本戦">
            シナリオごとの試験。H.I.Fは選抜（3回）と本戦、N.I.Aはオーディション（1次・2次・最終。最終はFINALEかQUARTET）、初は中間試験と最終試験。スコアや順位を入れると、上がるステと評価値の加点が決まります。
          </Term>
          <Term name="パラボ込みのステ・パラボ抜きのステ（素点）">
            試験で上がるステの入れ方。ゲームのログに出る上昇幅はパラボ込みなので、「パラボ込みのステ」に入れると今の編成のパラボ%で素点（パラボ抜きのステ＝計算に使う値）に逆算します。素点を直接入れることもできます。
          </Term>
          <Term name="ステ上限・★上限・投票上限">
            試験のスコアは、これ以上入れても結果が伸びない所で止まります。上限に達すると欄の横に「ステ上限」「★上限」「投票上限」の印が出ます。
          </Term>
          <Term name="スター性">
            H.I.Fの評価値の加点。選抜のスコア（★）・レッスン・ワッペン・本戦から決まります。本戦のスター性はラウンドの点数で変わります。親愛度のボーナスが全部に掛かります。
          </Term>
          <Term id="term-affection" name="親愛度">
            育成するアイドルの親愛度Lv。<b>スター性</b>（Lv28から+5%ずつ、36・37で+50%）・<b>初期Pポイント</b>（STEP3。Lv21から+10〜+30）・<b>最大体力</b>（Lv22から+1〜+2）が変わります。設定欄の「詳細設定」で変えられます（既定は37）。Lv20以下はどれも0で同じなので1つにまとめています。
          </Term>
          <Term name="H.I.Fボーナス">
            H.I.Fボーナスのレベル（Vo/Da/Viの固定値とパラボ、SP率、本戦のステ上限）。設定欄の「詳細設定」で親愛度と一緒に変えられます（既定は全部最大）。
          </Term>
          <Term name="ファン投票数・獲得ボーナス・FINALE/QUARTET">
            N.I.Aの用語。ファン投票数はオーディションのスコアと営業、札取得枚数で決まり、評価値に換算されます（育成後のステータスの下に合計と内訳）。獲得ボーナスはチャレンジPアイテム3枠の%で、オーディションの素点に上乗せします（設定欄の「調整」。既定は各枠の最大）。最終オーディションはFINALEとQUARTETを選択できます。
          </Term>
          <Term name="パーフェクト・クリア（初のレッスン）">
            初のレッスンは、レッスン中の点数で入力します。上限がパーフェクトで、クリアラインを超えた分は残りの2タイプにも入ります。
          </Term>
        </TermGroup>

        <TermGroup title="結果">
          <Term id="term-rating" name="評価値">
            プロデュース評価。シナリオによって計算式が違います（式は計算ページ右上の「計算式・数値表」）。探索はこれが最も高くなる編成と踏み方を求めます。
          </Term>
          <Term name="開始時のステータス・育成後のステータス・内訳">
            開始時は育成を始める時点のステ（Pアイドル・メモリー・サポカの初期値）。育成後は授業・レッスン・試験・サポカ・パラボ変換を足した最終のステで、各タイプに上限があります。「内訳の数字」で区分ごとの値が見られます。
          </Term>
          <Term id="term-parabo" name="パラボ（パラメータボーナス）・パラボ変換表">
            レッスン・試験で上がるステに割合で上乗せされる分。ステが上がるたび（レッスン1回・試験1回ごと）に「獲得ステ×パラボ」を切り捨てて合算します。「パラボ変換表」（開始時のステータスの右）で、今の踏み方だとパラボ+1%が何点のステになるかを見られます。
          </Term>
          <Term name="Pポイント">
            その育成で手に入るPポイントの合計です。1行目の「Pポイント（サポカ分）」はサポカ由来（固定P・前イベP・レッスンのP率換算）だけ、2行目の「Pポイント」はそこにレッスン・H.I.Fボーナスの初期Pポイント・親愛度（STEP3。H.I.Fは選抜の開始時だけ）・メモリー・差し入れ（初レジェンドは活動支給）を足した値です。差し入れ1回の量はH.I.F 80・初レジェンド（活動支給）180で、N.I.Aだけ踏む週で変わります（17週目まで110・18週目から120）。プロデュースの「スケジュール」で選んだ週（日）から計算します。サポカの「レッスンPポイント率」「タイプSPレッスンPポイント率」の分は、ゲームと同じくレッスン1回ごとに切り捨てて足します。
          </Term>
          <Term name="セーブデータ・画像に出力・計算式・数値表">
            セーブデータ（右上）は今の育成の状態をまるごと保存し、読み込めば評価値まで同じ状態に戻ります。画像に出力（評価値の下）は評価値・編成・踏み方・アビリティ発動回数を1枚の画像にします。計算式・数値表（右上）は評価値やステの式と数値表です。
          </Term>
        </TermGroup>
      </div>

      {/* ---------------------------------------------------------------- よくある質問 */}
      <h2 id="faq" className={H2}>
        Q & A
      </h2>
      <div className="flex flex-col gap-2">
        <QA q="プロデュース計算機って何？">
          サポカを6枚編成し、レッスンの踏み方や試験の点数、メモリーや育成するPアイドルを入力すると評価値が求められる計算ツールです。現在は「H.I.F」、「N.I.A/マスター」、「初/レジェンド」の3シナリオを実装しています。
          <br />
          サポカ等の所持状況を入力することで、あなたの手持ちでもっとも評価値が高くなるような編成を自動で求める機能もあります。
        </QA>
        <QA q="探索で出てきたサポカ編成がおかしい">
          探索のされ方によっては誤った編成を算出する可能性があります。何回か押してみるか、BAN・固定（→
          <a href="#term-flags" className="font-semibold text-blue-700 underline">
            用語
          </a>
          ）を使って調節してみてください。
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
          所持状況・メモリー・プロデュース・セーブデータなど、このサイトで入力した内容は
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
