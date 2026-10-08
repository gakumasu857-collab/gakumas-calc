import {
  ATTR_STYLES,
  PLAN_ICON_SRC,
  sortAbilities,
  templateLabel,
  type Memory,
} from "@/lib/memoryTypes";
import { resolveParaboMemory, type ParaboAssign } from "@/lib/memoryTotals";

/**
 * メモリー1枚の1行表示。4枠の一覧・保存したメモリーの一覧・セットの中身で共用する。
 * - detail="name": プランのアイコン＋名前だけ（4枠の一覧。オーナー「アイコンと名前だけで良い」2026-10-08）。
 *   名前が無ければアビリティを文字で、汎用メモリーは「汎用メモリー60点」
 * - detail="full": アイコン＋名前＋アビリティのチップ（一覧・セットの中身）
 */
export default function MemoryLine({
  memory,
  detail = "full",
  paraboAssign,
  size = "md",
}: {
  memory: Memory;
  detail?: "name" | "full";
  /** full のとき、渡すと汎用メモリーを今の踏み方で展開して見せる */
  paraboAssign?: ParaboAssign;
  size?: "md" | "sm";
}) {
  const iconSrc = PLAN_ICON_SRC[memory.plan] ?? PLAN_ICON_SRC.共通;
  const iconCls = `${size === "sm" ? "h-5 w-5" : "h-6 w-6"} shrink-0 object-contain`;
  const abilityText = (m: Memory) =>
    sortAbilities(m.abilities)
      .map((a) => (a.attr === "回復" ? `回復 ${a.value}` : `${a.attr} ${a.value}`))
      .join(" / ");

  if (detail === "name") {
    const label = memory.roleSpec
      ? templateLabel(memory.roleSpec)
      : (memory.skillName ?? (memory.abilities.length ? abilityText(memory) : "アビリティなし"));
    return (
      <span className="flex min-w-0 items-center gap-2">
        <img src={iconSrc} alt={memory.plan} title={memory.plan} className={iconCls} />
        <span className={`min-w-0 truncate text-sm ${memory.skillName || memory.roleSpec ? "font-semibold text-slate-800" : "text-slate-700"}`}>
          {label}
        </span>
      </span>
    );
  }

  const chip =
    size === "sm"
      ? "rounded px-1 py-0.5 text-[10px] font-semibold whitespace-nowrap"
      : "rounded px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap";
  const resolved =
    memory.roleSpec && paraboAssign ? resolveParaboMemory(memory, paraboAssign) : null;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      <img src={iconSrc} alt={memory.plan} title={memory.plan} className={iconCls} />
      {memory.roleSpec ? (
        <>
          <span className={`${chip} bg-indigo-500 text-white`}>{templateLabel(memory.roleSpec)}</span>
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
              +{memory.roleSpec.mainPct}%×2・固定+{memory.roleSpec.subFlat}
            </span>
          )}
        </>
      ) : (
        <>
          {memory.skillName && (
            <span className="min-w-0 max-w-32 truncate text-xs font-semibold text-slate-700">
              {memory.skillName}
            </span>
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
