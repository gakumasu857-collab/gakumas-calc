import { ATTR_STYLES, PLAN_ICON_SRC, sortAbilities, type Memory } from "@/lib/memoryTypes";
import { resolveParaboMemory, type ParaboAssign } from "@/lib/memoryTotals";

/**
 * メモリー1枚の1行表示（プランのアイコン＋名前＋アビリティのチップ）。
 * 4枠の一覧・保存したメモリーの一覧・セットの中身で共用する（2026-10-08。縦長のカードをやめた）。
 * メインパラボ（roleSpec）は、paraboAssign があれば今の踏み方で展開した中身も添える。
 */
export default function MemoryLine({
  memory,
  paraboAssign,
  size = "md",
}: {
  memory: Memory;
  /** 渡すとメインパラボを今の踏み方で展開して見せる */
  paraboAssign?: ParaboAssign;
  size?: "md" | "sm";
}) {
  const iconSrc = PLAN_ICON_SRC[memory.plan] ?? PLAN_ICON_SRC.共通;
  const chip =
    size === "sm"
      ? "rounded px-1 py-0.5 text-[10px] font-semibold whitespace-nowrap"
      : "rounded px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap";
  const resolved =
    memory.roleSpec && paraboAssign ? resolveParaboMemory(memory, paraboAssign) : null;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      <img
        src={iconSrc}
        alt={memory.plan}
        title={memory.plan}
        className={`${size === "sm" ? "h-5 w-5" : "h-6 w-6"} shrink-0 object-contain`}
      />
      {memory.roleSpec ? (
        <>
          <span className={`${chip} bg-indigo-500 text-white`}>
            {memory.skillName ?? "メインパラボ"}
          </span>
          {resolved ? (
            <>
              <span className="text-[10px] text-slate-400">→</span>
              {sortAbilities(resolved.abilities).map((a, i) => (
                <span key={i} className={`${chip} ${ATTR_STYLES[a.attr].chip}`}>
                  {a.attr} {a.value}
                </span>
              ))}
            </>
          ) : (
            <span className="text-[10px] text-slate-500">
              +{memory.roleSpec.mainPct}%×2タイプ・固定+{memory.roleSpec.subFlat}
            </span>
          )}
        </>
      ) : (
        <>
          {memory.skillName && (
            <span className="min-w-0 max-w-32 truncate text-xs text-slate-500">{memory.skillName}</span>
          )}
          {memory.abilities.length === 0 ? (
            <span className="text-xs text-slate-400">アビリティなし</span>
          ) : (
            sortAbilities(memory.abilities).map((a, i) => (
              <span key={i} className={`${chip} ${ATTR_STYLES[a.attr].chip}`}>
                {a.attr === "回復" ? `回復 ${a.value}` : `${a.attr} ${a.value}`}
              </span>
            ))
          )}
        </>
      )}
    </span>
  );
}
