import { Save, Trash2 } from "lucide-react";
import { BTN_PRIMARY, BTN_SECONDARY, NOTE } from "@/components/ui";
import type { Memory, SlotMemory } from "@/lib/memoryTypes";
import type { SlotStatus } from "@/lib/useMemoryStore";
import MemoryFields from "./MemoryFields";

/** 保存状態のバッジ */
const STATUS_BADGE: Record<SlotStatus, { label: string; cls: string } | null> = {
  empty: null,
  template: { label: "テンプレ", cls: "bg-indigo-100 text-indigo-700" },
  unsaved: { label: "未保存", cls: "bg-amber-100 text-amber-800" },
  saved: { label: "保存済み ✓", cls: "bg-emerald-100 text-emerald-700" },
  modified: { label: "変更あり（未保存）", cls: "bg-amber-100 text-amber-800" },
};

/**
 * 選んだ枠のメモリーをその場で作る・変える編集枠。
 * 値のボタンを押すとそのまま枠の中身が変わる（保存は任意。保存しなくても計算に使える）。
 * 保存元がある枠で中身を変えたら「上書き保存」か「別のメモリーとして保存」。
 * 同じアビリティ・プランのメモリーが保存済みなら、保存の前に注意を出す。
 */
export default function SlotEditor({
  index,
  value,
  status,
  sourceName,
  duplicate,
  onChange,
  onClear,
  onSaveNew,
  onOverwrite,
  onUseDuplicate,
}: {
  index: number;
  value: SlotMemory | null;
  status: SlotStatus;
  /** 保存元のメモリー名（上書き保存ボタンに出す） */
  sourceName?: string;
  /** 同じアビリティ・プランで保存済みのメモリー（あれば注意を出す） */
  duplicate?: Memory;
  onChange: (next: SlotMemory) => void;
  onClear: () => void;
  onSaveNew: () => void;
  onOverwrite: () => void;
  /** 保存済みの同じメモリーをこの枠に使う（保存せずにつなぐ） */
  onUseDuplicate: () => void;
}) {
  const base: SlotMemory = value ?? { plan: "共通", abilities: [] };
  const locked = status === "template";
  const canSave = base.abilities.length > 0;
  const badge = STATUS_BADGE[status];
  const dupName = duplicate ? (duplicate.skillName ?? duplicate.plan) : "";
  const showDup = !!duplicate && canSave && (status === "unsaved" || status === "modified");

  return (
    <section className="rounded-xl border-2 border-blue-300 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold text-slate-900">枠{index + 1} のメモリー</h2>
        {badge && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${badge.cls}`}>
            {badge.label}
          </span>
        )}
      </div>

      {locked ? (
        <p className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
          テンプレ「{base.skillName ?? "メインパラボ"}」が入っています。中身は踏み方から自動で決まるので、ここでは変えられません。
          別のメモリーにするには、一覧から選ぶか、この枠を空にしてから作ってください。
        </p>
      ) : (
        <MemoryFields
          value={{ plan: base.plan, skillName: base.skillName, abilities: base.abilities }}
          onChange={(next) => onChange({ ...base, ...next })}
        />
      )}

      {/* 同じ中身がもう保存されているときの注意 */}
      {showDup && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-900">
          <b>同じアビリティ・プランのメモリー「{dupName}」がもう保存されています。</b>
          <br />
          同じものなら「保存済みを使う」でつなげます。別物として残したいときは、名前を付けるかプランを変えてから保存してください。
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={onUseDuplicate} className={BTN_PRIMARY}>
              保存済みの「{dupName}」を使う
            </button>
            <button type="button" onClick={onSaveNew} className={BTN_SECONDARY}>
              それでも別に保存
            </button>
          </div>
        </div>
      )}

      {/* 保存・空にする */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {status === "unsaved" && !showDup && (
          <button
            type="button"
            onClick={onSaveNew}
            disabled={!canSave}
            title={canSave ? undefined : "アビリティを1つ以上選ぶと保存できます"}
            className={BTN_PRIMARY}
          >
            <Save size={14} />
            メモリーとして保存
          </button>
        )}
        {status === "modified" && (
          <>
            <button
              type="button"
              onClick={onOverwrite}
              disabled={!canSave}
              className={BTN_PRIMARY}
            >
              <Save size={14} />
              上書き保存{sourceName ? `（${sourceName}）` : ""}
            </button>
            {!showDup && (
              <button
                type="button"
                onClick={onSaveNew}
                disabled={!canSave}
                className={BTN_SECONDARY}
              >
                別のメモリーとして保存
              </button>
            )}
          </>
        )}
        {status !== "empty" && (
          <button type="button" onClick={onClear} className={`${BTN_SECONDARY} ml-auto`}>
            <Trash2 size={13} />
            この枠を空にする
          </button>
        )}
      </div>
      <p className={`mt-2 ${NOTE}`}>
        {status === "empty"
          ? "値のボタンを押すと、この枠にメモリーが入ります。保存しなくても計算に使えます。"
          : status === "saved"
            ? "保存済みです。値を変えると「上書き保存」か「別のメモリーとして保存」ができます。"
            : status === "template"
              ? "テンプレはそのまま計算に使えます。"
              : "保存しなくても計算に使えます。保存すると「保存したメモリー」からいつでも入れられます。"}
      </p>
    </section>
  );
}
