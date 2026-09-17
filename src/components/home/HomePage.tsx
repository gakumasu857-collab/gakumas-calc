import { Link } from "react-router-dom";
import { Calculator, Camera } from "lucide-react";

/**
 * サイトのホーム画面（ほぺマス）。
 * 中央にツールへの入口ボタンを並べる。ツールを増やすときは TOOLS に足す。
 */
const TOOLS: {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  ready: boolean;
  /** タイトル横の小さな注記（β・開発中など） */
  badge?: string;
}[] = [
  {
    href: "/calc",
    title: "プロデュース計算機",
    description:
      "シナリオ・アイドル・プロデュース・メモリーを設定すると、理想のサポートカード編成とレッスンの踏み方、評価値を自動で求めます。所持サポカを登録すれば手持ちに沿った編成に。",
    icon: <Calculator size={28} />,
    ready: true,
  },
  {
    href: "/event-counter",
    title: "イベントカウンター",
    description:
      "育成画面をキャプチャして、サポカイベント（前イベ・後イベ・ステイベ）の発生を自動で記録し、発生率を集計するツール（PC専用）。編成サポカの読み取りからイベント判定・統計・CSV出力まで全自動です。",
    icon: <Camera size={28} />,
    // 開発中のため入口は押せない（ページ自体は /event-counter に残っている）
    ready: false,
    badge: "開発中",
  },
];

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-gradient-to-b from-sky-50 via-white to-blue-50 px-4">
      {/* ヘッダー */}
      <div className="mt-16 flex flex-col items-center text-center sm:mt-24">
        <img
          src="/icon-192.png"
          alt=""
          className="h-20 w-20 object-contain"
        />
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          ほぺマス
        </h1>
        <p className="mt-1 text-xs font-medium tracking-wide text-slate-400">
          学マス育成・評価値計算の非公式ツール
        </p>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-500">
          学園アイドルマスターのプロデュース（育成）を助ける非公式ツール集です。
          使いたいツールを選んでください。
        </p>
      </div>

      {/* ツール一覧 */}
      <div className="mt-10 flex w-full max-w-xl flex-col gap-4 pb-16">
        {TOOLS.map((tool) =>
          tool.ready ? (
            <Link
              key={tool.title}
              to={tool.href}
              className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-400 hover:shadow-md"
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition group-hover:bg-blue-500">
                {tool.icon}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-base font-bold text-slate-900 group-hover:text-blue-700">
                  {tool.title}
                  {tool.badge && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      {tool.badge}
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                  {tool.description}
                </span>
              </span>
            </Link>
          ) : (
            <div
              key={tool.title}
              aria-disabled="true"
              title="開発中のため、まだ使えません"
              className="flex cursor-not-allowed select-none items-center gap-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5"
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-300 text-white">
                {tool.icon}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-base font-bold text-slate-400">
                  {tool.title}
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                    {tool.badge ?? "準備中"}
                  </span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-400">
                  {tool.description}
                </span>
              </span>
            </div>
          ),
        )}
        {/* 権利表記・免責 */}
        <div className="mt-6 flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-white/70 p-4 text-[11px] leading-relaxed text-slate-500">
          <p>
            本サイトは個人が運営する非公式のファンサイトです。
            株式会社バンダイナムコエンターテインメント・株式会社QualiArtsとは一切関係ありません。
          </p>
          <p>
            『学園アイドルマスター』に関する画像・名称等の著作権・商標権その他の知的財産権は、
            それぞれの権利者に帰属します。
          </p>
          <p>
            著作権元（権利者）からの削除申請には、いつでも速やかに応じます。
            掲載内容についてのご連絡は X（旧Twitter）の{" "}
            <a
              href="https://x.com/hoppe_hanami873"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline"
            >
              @hoppe_hanami873
            </a>{" "}
            までお願いします。
          </p>
          <p>
            本サイトは収益を目的としていません。計算結果・掲載データの正確性は保証せず、
            利用により生じた損害について運営者は責任を負いません。
          </p>
          <p>
            <b className="text-slate-600">入力したデータの保存場所について:</b>{" "}
            所持状況・メモリー・プロデュース・セーブデータなど、このサイトで入力した内容はすべて
            お使いのブラウザの中（localStorage）に保存され、サーバーには送られません。
            ブラウザのデータ削除・別の端末やブラウザ・シークレットモードでは引き継がれず、
            消えることがあります。大事なデータはCSVやセーブデータの書き出しで控えを取ってください。
          </p>
        </div>
      </div>
    </main>
  );
}
