import { SUPPORT_CARD_DB } from "@/data/supportCardsDb";
import { imageUrl } from "@/lib/config";
import { planAllows, type CardFlagSets } from "@/lib/formation";
import type { SelectedMember } from "@/lib/useCalcResult";

const CARD_PLAN_BY_ID = new Map(SUPPORT_CARD_DB.map((c) => [c.id, c.plan]));

/**
 * 選択サポカの1枠。画像クリック＝入れ替え（凸・固定・BAN・レンタルNGも選択画面で変える）。
 * 枠の左上に凸とレンタル・固定・BANの印。画像の下は「名前（長ければ…）｜+点数」の1行で、
 * 点数を押すと内訳が開く。
 */
export default function SupportSlot({
  member,
  plan,
  flags,
  onOpen,
  onDetail,
}: {
  member: SelectedMember | null;
  plan: string | null;
  flags: CardFlagSets;
  onOpen: () => void;
  onDetail: () => void;
}) {
  if (!member) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="flex aspect-video w-full flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-slate-300 text-xs font-semibold text-slate-400 transition hover:border-blue-400 hover:text-blue-500"
      >
        ＋ 選ぶ
      </button>
    );
  }
  const url = imageUrl(member.image);
  const planNg = !planAllows(CARD_PLAN_BY_ID.get(member.id) ?? "", plan);
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onOpen}
        title="クリックで入れ替え（凸・固定・BANは選択画面で）"
        className="block w-full text-left"
      >
        <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
          {url ? (
            <img
              src={url}
              alt={member.name}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center p-1 text-center text-[10px] text-slate-500">
              {member.name}
            </div>
          )}
          {planNg && (
            <span className="absolute bottom-1 left-1 rounded bg-red-600/90 px-1 py-0.5 text-[9px] font-bold text-white">
              プラン外
            </span>
          )}
        </div>
      </button>
      {/* 名前と点数は同じ行に並べ、名前は残り幅で省略（点数と重ならない） */}
      <div className="mt-0.5 flex items-center gap-1">
        <button
          type="button"
          onClick={onOpen}
          title={member.name}
          className="min-w-0 flex-1 truncate text-left text-[10px] text-slate-600 transition hover:text-blue-600"
        >
          {member.name}
        </button>
        <button
          type="button"
          onClick={onDetail}
          className="shrink-0 text-xs font-bold tabular-nums text-blue-600 underline decoration-blue-300 decoration-dotted underline-offset-2 hover:text-blue-500"
          title={`クリックで内訳を表示（基本 ${Math.round(member.points)} ＋ イベント相互作用 ${Math.round(member.synergy)}）`}
        >
          +{Math.round(member.points + member.synergy)}
        </button>
      </div>
      {/* 凸バッジ＋レンタル・固定・BANの印（表示のみ。変更は選択画面で） */}
      <span className="absolute left-1 top-1 z-10 rounded bg-black/60 px-1 py-0.5 text-[9px] font-bold text-white">
        {member.level}凸
        {member.rental && <span className="ml-0.5 text-amber-300">レンタル</span>}
        {flags.pinned.has(member.id) && <span className="ml-0.5 text-sky-300">📌固定</span>}
        {flags.banned.has(member.id) && <span className="ml-0.5 text-red-300">BAN</span>}
      </span>
    </div>
  );
}
