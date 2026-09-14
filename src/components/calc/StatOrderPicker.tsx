import { TYPE_SOLID } from "@/components/ui";
import { TYPE_KEYS, TYPE_LABELS, type TypeKey } from "@/lib/useCalcSettings";

/** 順位（0＝一番高い）ごとの柱の高さ */
const HEIGHTS = ["h-20", "h-13", "h-7"];

/**
 * 「ステの高さの順」を3本の柱で決める。
 * 柱は Vo・Da・Vi の位置固定で、高さが順位（左から Vo＞Da＞Vi が初期）。
 * - 一番高い柱を押す → 2番目に高いタイプが一番高くなる（1位と2位の入れ替え）
 * - それ以外の柱を押す → そのタイプが一番高くなる（ほかは相対順のまま下がる）
 * disabled のときは薄く表示して押せない（「指定なし」）。
 */
export default function StatOrderPicker({
  order,
  disabled,
  onChange,
}: {
  /** 高い→低い */
  order: TypeKey[];
  disabled: boolean;
  onChange: (order: TypeKey[]) => void;
}) {
  const rankOf = (t: TypeKey) => Math.max(0, order.indexOf(t));
  const click = (t: TypeKey) => {
    if (disabled) return;
    if (order[0] === t) {
      // 1位を押した: 2位を1位に
      onChange([order[1], order[0], order[2]]);
    } else {
      // それ以外: そのタイプを1位に、残りは今の順のまま
      onChange([t, ...order.filter((x) => x !== t)]);
    }
  };
  return (
    <div className={`flex flex-col gap-1.5 ${disabled ? "opacity-40" : ""}`}>
      <div className="flex items-end gap-3">
        {TYPE_KEYS.map((t) => {
          const rank = rankOf(t);
          return (
            <button
              key={t}
              type="button"
              disabled={disabled}
              onClick={() => click(t)}
              title={
                disabled
                  ? undefined
                  : rank === 0
                    ? "押すと2番目に高いタイプが一番高くなります"
                    : "押すとこのタイプが一番高くなります"
              }
              className="flex w-16 flex-col items-center gap-1 disabled:cursor-not-allowed"
            >
              <span className="text-[11px] font-bold tabular-nums text-slate-500">{rank + 1}位</span>
              <span
                className={`flex w-full items-end justify-center rounded-t-md pb-1 text-xs font-bold transition-all ${HEIGHTS[rank]} ${TYPE_SOLID[t]} ${
                  disabled ? "" : "hover:brightness-95"
                }`}
              >
                {TYPE_LABELS[t].slice(0, 2)}
              </span>
            </button>
          );
        })}
        <span className="pb-1 text-xs text-slate-600">
          {order.map((t) => TYPE_LABELS[t].slice(0, 2)).join("＞")}
        </span>
      </div>
    </div>
  );
}
