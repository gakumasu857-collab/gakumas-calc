import { Link } from "react-router-dom";
import { Calculator, Camera } from "lucide-react";

/**
 * サイトのホーム画面（学マスプロデュースお助けサイト）。
 * 中央にツールへの入口ボタンを並べる。ツールを増やすときは TOOLS に足す。
 */
const TOOLS: {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  ready: boolean;
}[] = [
  {
    href: "/calc",
    title: "サポカ編成計算機",
    description:
      "理想のサポートカード編成・レッスンの踏み方・理論評価値を自動計算。所持サポカやメモリーを登録して、育成の最大値を探れます。",
    icon: <Calculator size={28} />,
    ready: true,
  },
  {
    href: "#",
    title: "イベントカウンター",
    description:
      "育成画面をキャプチャして、サポカイベント（前イベ・後イベ・ステイベ）の発生を自動で記録・集計するツール。",
    icon: <Camera size={28} />,
    ready: false,
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
          学マスプロデュースお助けサイト
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-500">
          学園アイドルマスターのプロデュースを助ける非公式ツール集です。
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
                <span className="block text-base font-bold text-slate-900 group-hover:text-blue-700">
                  {tool.title}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                  {tool.description}
                </span>
              </span>
            </Link>
          ) : (
            <div
              key={tool.title}
              className="flex items-center gap-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5"
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-300 text-white">
                {tool.icon}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-base font-bold text-slate-400">
                  {tool.title}
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                    準備中
                  </span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-400">
                  {tool.description}
                </span>
              </span>
            </div>
          ),
        )}
        <p className="mt-4 text-center text-[11px] text-slate-400">
          本サイトは個人が運営する非公式ツールです。ゲーム内画像等の権利は各権利者に帰属します。
        </p>
      </div>
    </main>
  );
}
