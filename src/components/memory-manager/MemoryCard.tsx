import {
  ATTR_STYLES,
  PLAN_ICON_SRC,
  sortAbilities,
  type Memory,
} from "@/lib/memoryTypes";

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
  /** 指定すると右上に「×」が出る（スロットから外す）。カード本体のクリックは編集などに使える */
  onRemoveSlot?: () => void;
  /** ホバー時の説明（省略時は名前） */
  title?: string;
};

/** メモリー1枚の縦長カード。上=プランのアイコン、下=アビリティ一覧。 */
export default function MemoryCard({
  memory,
  onClick,
  disabled = false,
  selectedCount = 0,
  onRemoveOne,
  deleteMode = false,
  onRemoveSlot,
  title,
}: Props) {
  // アイコンは常にプランのもの（名前はプランと独立の自由入力）
  const iconSrc = PLAN_ICON_SRC[memory.plan] ?? PLAN_ICON_SRC.共通;
  const deletable = deleteMode && !memory.isTemplate;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || (deleteMode && memory.isTemplate)}
      title={title ?? memory.skillName ?? memory.plan}
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
      {/* 1枚解除の−ボタン（左上角。アイコンが小さくなったので枠の外側寄りに） */}
      {selectedCount > 0 && !deleteMode && onRemoveOne && (
        <span
          role="button"
          title="1枚解除"
          onClick={(e) => {
            e.stopPropagation();
            onRemoveOne();
          }}
          className="absolute -left-1.5 -top-1.5 z-10 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-red-500/90 text-sm font-bold leading-none text-white shadow hover:bg-red-400"
        >
          −
        </span>
      )}
      {/* スロットから外す×（右上角） */}
      {onRemoveSlot && (
        <span
          role="button"
          title="この枠から外す"
          onClick={(e) => {
            e.stopPropagation();
            onRemoveSlot();
          }}
          className="absolute -right-1.5 -top-1.5 z-10 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-slate-500/90 text-[11px] font-bold leading-none text-white shadow hover:bg-red-500"
        >
          ×
        </span>
      )}
      {/* 削除モードのバッジ */}
      {deletable && (
        <span className="absolute -right-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[11px] font-bold text-white">
          ×
        </span>
      )}

      {/* 上部: プランアイコン（ゲームのプラン画像・左寄せ）＋名前 */}
      <div className="flex items-center gap-1.5">
        <img
          src={iconSrc}
          alt={memory.plan}
          className="h-7 w-7 shrink-0 object-contain"
        />
        <span className="min-w-0 flex-1 truncate text-left text-[10px] font-medium text-slate-500">
          {memory.skillName ?? memory.plan}
        </span>
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
