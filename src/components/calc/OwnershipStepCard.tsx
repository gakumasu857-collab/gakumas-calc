import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { readOwnershipAck, readOwnershipVisited, writeOwnershipAck } from "@/lib/ownershipAck";
import { BUILTIN_ID, useOwnedSaves } from "@/lib/useOwnedSaves";

/**
 * 「まずここを設定」の次の一手＝所持状況。
 * 既定は全サポカ完凸なので、完凸でいい人は「完凸のままでOK」を1回押すだけ、
 * 手持ちに合わせたい人は所持状況ページへ。決まったら1行に畳む（いつでも変えられる）。
 */
export default function OwnershipStepCard() {
  const owned = useOwnedSaves();
  const [ack, setAck] = useState(() => readOwnershipAck() || readOwnershipVisited());
  const builtin = owned.activeId === BUILTIN_ID;
  const activeName = owned.saves.find((s) => s.id === owned.activeId)?.name;
  const decided = ack || !builtin;

  if (decided) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm">
        <span className="font-bold text-slate-700">所持状況</span>
        <span className="text-slate-800">
          {builtin ? (
            <>
              <b>全サポカ完凸</b>で計算中
            </>
          ) : (
            <>
              「<b>{activeName ?? "自分の所持状況"}</b>」で計算中
            </>
          )}
        </span>
        <Link
          to="/support"
          className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-blue-700 underline"
        >
          {builtin ? "自分の所持状況を入力する" : "所持状況を変える"}
          <ArrowRight size={12} />
        </Link>
      </div>
    );
  }

  return (
    <section className="rounded-xl border-2 border-amber-300 bg-amber-50/70 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-black text-amber-950">
          つぎに
        </span>
        <h2 className="text-base font-bold text-slate-900">所持状況を確認</h2>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-slate-700">
        今は<b>全サポカを完凸で持っている</b>想定で探索します。このままでよければ左、
        手持ちに合わせるなら右を押してください（あとからいつでも変えられます）。
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            writeOwnershipAck();
            setAck(true);
          }}
          className="flex flex-col items-center rounded-xl bg-blue-600 px-3 py-3 text-white transition hover:bg-blue-500"
        >
          <span className="flex items-center gap-1 text-base font-bold">
            <Check size={16} />
            完凸のままでOK
          </span>
          <span className="text-[11px] text-blue-100">全サポカ完凸の想定で探索する</span>
        </button>
        <Link
          to="/support"
          className="flex flex-col items-center rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-800 transition hover:border-blue-400 hover:bg-blue-50/40"
        >
          <span className="flex items-center gap-1 text-base font-bold">
            自分の所持状況を入力する
            <ArrowRight size={16} />
          </span>
          <span className="text-[11px] text-slate-500">持っているサポカと凸を登録（所持状況ページ）</span>
        </Link>
      </div>
    </section>
  );
}
