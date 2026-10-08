import { useState } from "react";
import { BookMarked, Save } from "lucide-react";
import { BTN_SECONDARY, NOTE } from "@/components/ui";
import { resolveParaboMemory, type ParaboAssign } from "@/lib/memoryTotals";
import {
  MAIN_PARABO_OPTIONS,
  slotToMemory,
  type Memory,
  type PlanKey,
  type SlotMemory,
} from "@/lib/memoryTypes";
import type { SlotStatus } from "@/lib/useMemoryStore";
import MemoryEditor from "./MemoryEditor";
import SaveMemoryModal from "./SaveMemoryModal";

/**
 * 開いている枠の編集欄（4枠の一覧の行のすぐ下に出る）。2026-10-08 に整理（オーナー「画面がうるさい」）:
 * - 上の帯「汎用メモリーにする」45点・60点・70点（押すとその枠が汎用メモリーになる。切り替えのタブはやめた）
 * - アビリティ3行（属性と値）。汎用メモリーの枠は今の踏み方で展開した中身が入っていて、変えると普通のメモリーになる
 * - プラン・名前は枠では出さず、「この中身を保存」のときに付ける（SaveMemoryModal）
 * - 「この枠を空にする」は無し（行の×で空にする）。説明文も無し
 */
export default function SlotEditor({
  index,
  value,
  status,
  sourceName,
  duplicate,
  paraboAssign,
  libraryCount,
  onChange,
  onPickParabo,
  onSaveNew,
  onOverwrite,
  onUseDuplicate,
  onOpenLibrary,
}: {
  index: number;
  value: SlotMemory | null;
  status: SlotStatus;
  /** 保存元のメモリー名（上書き保存ボタンに出す） */
  sourceName?: string;
  /** 同じアビリティ・プランで保存済みのメモリー（あれば保存のときに知らせる） */
  duplicate?: Memory;
  /** テンプレ（パラボ追従）の中身を今の踏み方で展開するための割当 */
  paraboAssign: ParaboAssign;
  /** 保存したメモリー（1枚ずつ）の枚数（「一覧から選ぶ」のバッジ） */
  libraryCount: number;
  onChange: (next: SlotMemory) => void;
  /** 汎用メモリー（テンプレのID）をこの枠に入れる */
  onPickParabo: (templateId: string) => void;
  /** 名前・プランを付けて新しいメモリーとして保存 */
  onSaveNew: (patch: { plan: PlanKey; skillName?: string }) => void;
  onOverwrite: () => void;
  /** 保存済みの同じメモリーをこの枠に使う（保存せずにつなぐ） */
  onUseDuplicate: () => void;
  /** 保存したメモリーの一覧（モーダル）を開く */
  onOpenLibrary: () => void;
}) {
  const base: SlotMemory = value ?? { plan: "共通", abilities: [] };
  const isTemplate = status === "template";
  // 汎用メモリーは今の踏み方で展開した中身を出発点にする（値を変えた時点で普通のメモリーになる）
  const shown = isTemplate
    ? resolveParaboMemory(slotToMemory(base, index), paraboAssign).abilities
    : base.abilities;
  const canSave = !isTemplate && base.abilities.length > 0;
  const currentParabo = base.roleSpec
    ? MAIN_PARABO_OPTIONS.find(
        (o) => o.mainPct === base.roleSpec!.mainPct && o.subFlat === base.roleSpec!.subFlat,
      )
    : undefined;
  const [saveOpen, setSaveOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {/* 汎用メモリー */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
        <span className="text-xs font-bold text-indigo-900">汎用メモリーにする</span>
        {MAIN_PARABO_OPTIONS.map((o) => {
          const on = isTemplate && currentParabo?.id === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onPickParabo(o.id)}
              title={`+${o.mainPct}%×2タイプ・固定+${o.subFlat}`}
              className={`rounded-md border px-3 py-1 text-sm font-bold transition ${
                on
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-indigo-300 bg-white text-indigo-800 hover:bg-indigo-100"
              }`}
            >
              {o.points}点
            </button>
          );
        })}
      </div>

      {/* アビリティ3行 */}
      <MemoryEditor
        withMeta={false}
        value={{ plan: base.plan, skillName: base.skillName, abilities: shown }}
        onChange={(next) =>
          isTemplate
            ? // 汎用メモリーから外れて普通のメモリーに（追従の印と保存元は外す）
              onChange({ plan: base.plan, abilities: next.abilities })
            : onChange({ ...base, abilities: next.abilities })
        }
      />

      {/* 保存したメモリー（1枚ずつ）。使う機会が少ないので小さく */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-slate-200 pt-2">
        <span className="text-[11px] font-bold text-slate-500">保存したメモリー:</span>
        <button type="button" onClick={onOpenLibrary} className={BTN_SECONDARY}>
          <BookMarked size={13} />
          一覧から選ぶ{libraryCount > 0 ? `（${libraryCount}）` : ""}
        </button>
        {status === "unsaved" && (
          <button
            type="button"
            onClick={() => setSaveOpen(true)}
            disabled={!canSave}
            title={canSave ? "名前とプランを付けて保存します（どちらも任意）" : "アビリティを1つ以上選ぶと保存できます"}
            className={BTN_SECONDARY}
          >
            <Save size={13} />
            この中身を保存
          </button>
        )}
        {status === "modified" && (
          <>
            <button type="button" onClick={onOverwrite} disabled={!canSave} className={BTN_SECONDARY}>
              <Save size={13} />
              上書き保存{sourceName ? `（${sourceName}）` : ""}
            </button>
            <button type="button" onClick={() => setSaveOpen(true)} disabled={!canSave} className={BTN_SECONDARY}>
              別のメモリーとして保存
            </button>
          </>
        )}
        {status === "saved" && (
          <span className={NOTE}>「{sourceName ?? "保存したメモリー"}」として保存済み</span>
        )}
      </div>

      {saveOpen && (
        <SaveMemoryModal
          memory={slotToMemory(base, index)}
          duplicate={duplicate}
          onSave={onSaveNew}
          onUseDuplicate={onUseDuplicate}
          onClose={() => setSaveOpen(false)}
        />
      )}
    </div>
  );
}
