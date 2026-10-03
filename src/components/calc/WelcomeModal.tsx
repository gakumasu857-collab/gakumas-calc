import { BookOpen, CalendarCheck, ListOrdered, Sparkles, X } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * 初めて計算ページに来た人への「プロデュース計算機へようこそ」。
 * 最初に必ず目に入るようにモーダルで出す。共通の Modal は使わず、青い見出し帯＋ヘルプの「使い方」の
 * 超かんたん版（3ステップ）の専用デザイン（オーナー要望 2026-10-03）。
 * 閉じる（×・背景・「はじめる」・ヘルプへ）か、探索を押すまで。出すかどうかは CalcPage が決める。
 */
export default function WelcomeModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="welcome-title"
        className="welcome-pop flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 見出し帯（青のグラデーション＋薄い円の飾り） */}
        <div className="relative shrink-0 overflow-hidden bg-linear-to-br from-blue-600 via-blue-600 to-indigo-600 px-6 pb-6 pt-7 text-white">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-white/10"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-16 right-20 h-32 w-32 rounded-full bg-white/10"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="absolute right-3 top-3 rounded-md p-1 text-white/80 transition hover:bg-white/15 hover:text-white"
          >
            <X size={18} />
          </button>
          <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/20">
            <Sparkles size={24} />
          </div>
          <p className="text-[11px] font-bold tracking-widest text-blue-100">ほぺマス</p>
          <h2 id="welcome-title" className="mt-0.5 text-xl font-black leading-tight sm:text-2xl">
            プロデュース計算機へようこそ
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-blue-50">
            育成の設定をして、自分の最高評価値を求められます。
          </p>
        </div>

        {/* 使い方（ヘルプの「使い方」の超かんたん版） */}
        <div className="min-h-0 overflow-y-auto px-6 py-5">
          <p className="text-xs font-bold tracking-wide text-slate-500">使い方はかんたん 3ステップ</p>
          <ol className="mt-3 flex flex-col gap-3">
            <Step no={1} title="設定欄を上から埋める">
              育成シナリオ・Pアイドル・プロデュース（サポカのアビリティの発動回数）を選びます。黄色い欄が未選択です。メモリーは最初から汎用のものが入っています。
            </Step>
            <Step no={2} title="青いボタンを押して探索">
              評価値が最も高くなるサポカ6枚の編成と、レッスン等の踏み方を自動で探します。
            </Step>
            <Step no={3} title="実際の育成に合わせて微調整">
              画面の左端のタブ
              <TabChip icon={<ListOrdered size={11} />} label="プロデュース設定" />
              <TabChip icon={<CalendarCheck size={11} />} label="レッスン等の踏み方" />
              で、アビリティの発動回数やレッスンの踏み方を自分の育成に寄せられます。
            </Step>
          </ol>
          <p className="mt-4 text-xs leading-relaxed text-slate-600">
            困ったら右上の
            <Link
              to="/help"
              onClick={onClose}
              className="mx-1 inline-flex items-center gap-1 rounded-md border border-blue-400 bg-white px-1.5 py-0.5 align-middle font-bold text-blue-700 transition hover:bg-blue-50"
            >
              <BookOpen size={13} />
              ヘルプ
            </Link>
            へ。
          </p>
        </div>

        {/* 足 */}
        <div className="flex shrink-0 items-center justify-end border-t border-slate-200 bg-slate-50 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-500"
          >
            <Sparkles size={15} />
            はじめる
          </button>
        </div>
      </div>
    </div>
  );
}

/** 番号つきのステップ（設定欄の番号バッジと同じ見た目） */
function Step({ no, title, children }: { no: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white">
        {no}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-900">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{children}</p>
      </div>
    </li>
  );
}

/** 左端のタブの見本（ヘルプの見本と同じ小さなチップ） */
function TabChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="mx-0.5 inline-flex items-center gap-0.5 rounded bg-slate-100 px-1 py-0.5 align-middle text-[11px] font-bold text-slate-700">
      {icon}
      {label}
    </span>
  );
}
