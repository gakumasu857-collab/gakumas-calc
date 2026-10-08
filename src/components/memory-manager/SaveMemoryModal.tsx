import { useState } from "react";
import { Save } from "lucide-react";
import Modal from "@/components/Modal";
import { BTN_PRIMARY, BTN_SECONDARY, FIELD, NOTE } from "@/components/ui";
import { PLAN_LIST, PLAN_STYLES, type Memory, type PlanKey } from "@/lib/memoryTypes";
import MemoryLine from "./MemoryLine";

/**
 * 枠の中身を「保存したメモリー（1枚ずつ）」に保存するときの小さな画面（2026-10-08）。
 * 名前とプランはここで付ける（どちらも任意。枠の編集には出さない。オーナー「単体で保存するときに設定」）。
 * 同じアビリティ・プランのメモリーが保存済みなら、ここで「保存済みを使う」も選べる。
 */
export default function SaveMemoryModal({
  memory,
  duplicate,
  onSave,
  onUseDuplicate,
  onClose,
}: {
  /** 保存する中身（枠の中身） */
  memory: Memory;
  /** 同じアビリティ・プランで保存済みのメモリー（あれば） */
  duplicate?: Memory;
  /** 名前・プランを付けて保存する */
  onSave: (patch: { plan: PlanKey; skillName?: string }) => void;
  /** 保存せず、保存済みの同じメモリーをこの枠につなぐ */
  onUseDuplicate: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(memory.skillName ?? "");
  const [plan, setPlan] = useState<PlanKey>(memory.plan);
  const dupName = duplicate ? (duplicate.skillName ?? duplicate.plan) : "";
  return (
    <Modal title="この中身をメモリーとして保存" onClose={onClose} widthClass="max-w-md">
      <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2">
        <MemoryLine memory={{ ...memory, skillName: undefined }} />
      </div>
      <p className={`mb-3 ${NOTE}`}>
        保存すると「一覧から選ぶ」でいつでも枠に入れられます。名前とプランは付けなくてもかまいません。
      </p>
      <label className="mb-3 flex items-center gap-2 text-xs text-slate-500">
        名前
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="任意（例: 咲季用パラボ）"
          maxLength={20}
          autoFocus
          className={`${FIELD} min-w-0 flex-1`}
        />
      </label>
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-slate-500">プラン</span>
        {PLAN_LIST.map((p) => {
          const s = PLAN_STYLES[p];
          return (
            <button
              key={p}
              type="button"
              onClick={() => setPlan(p)}
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition ${
                plan === p ? s.btnOn : s.btnOff
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>
      {duplicate && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-900">
          <b>同じアビリティのメモリー「{dupName}」がもう保存されています。</b>
          同じものなら「保存済みを使う」でつなげます。
          <div className="mt-2">
            <button
              type="button"
              onClick={() => {
                onUseDuplicate();
                onClose();
              }}
              className={BTN_SECONDARY}
            >
              保存済みの「{dupName}」を使う
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            onSave({ plan, skillName: name.trim() || undefined });
            onClose();
          }}
          className={BTN_PRIMARY}
        >
          <Save size={14} />
          保存
        </button>
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>
          やめる
        </button>
      </div>
    </Modal>
  );
}
