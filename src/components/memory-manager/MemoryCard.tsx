import {
  Atom,
  Brain,
  Circle,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import {
  ATTR_STYLES,
  PLAN_STYLES,
  sortAbilities,
  type Memory,
  type PlanKey,
} from "@/lib/memoryTypes";

const PLAN_ICONS: Record<PlanKey, LucideIcon> = {
  共通: Circle,
  センス: Sparkles,
  ロジック: Brain,
  アノマリー: Atom,
};

type Props = {
  memory: Memory;
  onClick?: () => void;
  /** スロットが満杯などで選択できないとき true（暗転/透過） */
  disabled?: boolean;
  /** 選択中の枚数バッジ（0なら非表示） */
  selectedCount?: number;
  /** 指定すると「−」ボタンが出て、選択を1枚解除できる */
  onRemoveOne?: () => void;
  /** 削除モードのとき true（赤い見た目に） */
  deleteMode?: boolean;
};

/** メモリー1枚の縦長カード。上=プランのアイコン、下=アビリティ一覧。 */
export default function MemoryCard({
  memory,
  onClick,
  disabled = false,
  selectedCount = 0,
  onRemoveOne,
  deleteMode = false,
}: Props) {
  const plan = PLAN_STYLES[memory.plan] ?? PLAN_STYLES.共通;
  // アイコンは常にプランのもの（名前はプランと独立の自由入力）
  const Icon = PLAN_ICONS[memory.plan] ?? Circle;
  const deletable = deleteMode && !memory.isTemplate;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || (deleteMode && memory.isTemplate)}
      title={memory.skillName ?? memory.plan}
      className={`relative flex w-full flex-col gap-1.5 rounded-lg border bg-white p-1.5 text-left transition ${
        disabled
          ? "cursor-not-allowed border-slate-200 opacity-40"
          : deletable
            ? "border-red-300 hover:border-red-500 hover:bg-red-50"
            : deleteMode
              ? "cursor-not-allowed border-slate-200 opacity-40"
              : "border-slate-200 hover:border-blue-400 hover:shadow-sm"
      }`}
    >
      {/* 選択枚数バッジ */}
      {selectedCount > 0 && !deleteMode && (
        <span className="absolute -right-1.5 -top-1.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
          ×{selectedCount}
        </span>
      )}
      {/* 1枚解除の−ボタン（カード内側に置いて×nバッジと被らないように） */}
      {selectedCount > 0 && !deleteMode && onRemoveOne && (
        <span
          role="button"
          title="1枚解除"
          onClick={(e) => {
            e.stopPropagation();
            onRemoveOne();
          }}
          className="absolute left-2.5 top-2.5 z-10 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-red-500/90 text-sm font-bold leading-none text-white shadow hover:bg-red-400"
        >
          −
        </span>
      )}
      {/* 削除モードのバッジ */}
      {deletable && (
        <span className="absolute -right-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[11px] font-bold text-white">
          ×
        </span>
      )}

      {/* 上部: プランの画像/アイコン（正方形・角丸） */}
      <div
        className={`flex aspect-square w-full items-center justify-center rounded-md ${plan.icon}`}
      >
        <Icon className="h-1/3 w-1/3 text-white" strokeWidth={2.2} />
      </div>
      <div className="truncate text-center text-[10px] font-medium text-slate-500">
        {memory.skillName ?? memory.plan}
      </div>

      {/* 下部: アビリティ（最大3つ・属性色・Vo→Da→Vi→P→回復順）。行の高さは18pxで統一 */}
      <div className="flex flex-col gap-1">
        {memory.roleSpec ? (
          // パラボ追従メモリー: %はパラボ母数上位2タイプ、固定値は残り1タイプに自動で付く
          <>
            <span className="flex h-4.5 items-center justify-center overflow-hidden whitespace-nowrap rounded bg-indigo-500 px-1 text-[10px] font-semibold text-white">
              パラボ1位 +{memory.roleSpec.mainPct}%
            </span>
            <span className="flex h-4.5 items-center justify-center overflow-hidden whitespace-nowrap rounded bg-indigo-500 px-1 text-[10px] font-semibold text-white">
              パラボ2位 +{memory.roleSpec.mainPct}%
            </span>
            <span className="flex h-4.5 items-center justify-center overflow-hidden whitespace-nowrap rounded bg-indigo-400 px-1 text-[10px] font-semibold text-white">
              残り +{memory.roleSpec.subFlat}
            </span>
          </>
        ) : (
          <>
            {sortAbilities(memory.abilities).map((a, i) => (
              <span
                key={i}
                className={`flex h-4.5 items-center justify-center overflow-hidden whitespace-nowrap rounded px-1 text-[10px] font-semibold ${ATTR_STYLES[a.attr].chip}`}
              >
                {a.attr === "回復" ? `回復 ${a.value}` : `${a.attr} ${a.value}`}
              </span>
            ))}
            {/* 3枠に満たない分は空行で高さを揃える */}
            {Array.from({ length: 3 - memory.abilities.length }).map((_, i) => (
              <span key={`e-${i}`} className="h-4.5" />
            ))}
          </>
        )}
      </div>
    </button>
  );
}
