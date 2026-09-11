import { useState } from "react";
import { CalendarCheck, ListChecks, Sparkles } from "lucide-react";
import Modal from "@/components/Modal";
import { BTN_PRIMARY, BTN_SECONDARY, NOTE } from "@/components/ui";

const ONBOARD_KEY = "gakumas:onboarded:v1";

/** 初回だけガイドを出すか（一度「はじめる」を押したら出さない） */
export function shouldOnboard(): boolean {
  try {
    return localStorage.getItem(ONBOARD_KEY) !== "1";
  } catch {
    return false;
  }
}

function markOnboarded(): void {
  try {
    localStorage.setItem(ONBOARD_KEY, "1");
  } catch {
    /* 保存できなければ次回また出るだけ */
  }
}

const STEPS = [
  {
    icon: <ListChecks size={26} />,
    title: "① 持っているものを登録する",
    body: "所持しているサポカと凸数、メモリーを登録します。計算ページ上部の「準備」バーから、その場で設定できます（所持状況は後回しでもOK。その場合は全サポカ完凸として計算します）。",
  },
  {
    icon: <Sparkles size={26} />,
    title: "② 前提を選んで「求める」",
    body: "育成シナリオ・Pアイドル・育成パターン（発動回数）を選び、青い「理想の編成と踏み方を求める」ボタンを押します。サポカ6枚とレッスンの踏み方を自動で探して、評価値が高い組み合わせを反映します。",
  },
  {
    icon: <CalendarCheck size={26} />,
    title: "③ 自分の育成に合わせて調整する",
    body: "結果カードで何が変わったかを確認し、「レッスンの踏み方」の編集や発動回数の調整で実際の育成に寄せていきます。細かい条件（タイプ割合・最低ステなど）は「探索の条件」から。",
  },
];

/** 初回だけ表示する3ステップのガイド */
export default function OnboardingModal({
  onClose,
  onOpenHelp,
}: {
  onClose: () => void;
  onOpenHelp: () => void;
}) {
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;
  const finish = () => {
    markOnboarded();
    onClose();
  };
  const s = STEPS[step];
  return (
    <Modal title="はじめての方へ（3ステップ）" onClose={finish} widthClass="max-w-lg">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white">
          {s.icon}
        </span>
        <p className="text-base font-bold text-slate-900">{s.title}</p>
        <p className="text-sm leading-relaxed text-slate-600">{s.body}</p>
        <div className="mt-1 flex items-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-6 rounded-full ${i === step ? "bg-blue-600" : "bg-slate-200"}`}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((v) => v - 1)}
              className={BTN_SECONDARY}
            >
              戻る
            </button>
          )}
          {last ? (
            <button type="button" onClick={finish} className={BTN_PRIMARY}>
              はじめる
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep((v) => v + 1)}
              className={BTN_PRIMARY}
            >
              次へ
            </button>
          )}
        </div>
        <p className={NOTE}>
          詳しい使い方・計算式は右上の「使い方・計算式ヘルプ」からいつでも見られます。
          <button
            type="button"
            onClick={() => {
              finish();
              onOpenHelp();
            }}
            className="ml-1 text-blue-600 underline"
          >
            今すぐ開く
          </button>
        </p>
      </div>
    </Modal>
  );
}
