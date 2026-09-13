import { Save, Trash2 } from "lucide-react";
import { BTN_PRIMARY, BTN_SECONDARY, NOTE } from "@/components/ui";
import {
  ATTR_LABEL,
  ATTR_LIST,
  ATTR_STYLES,
  ATTR_VALUES,
  BTN_DISABLED,
  PLAN_LIST,
  PLAN_STYLES,
  sortAbilities,
  type AttrKey,
  type SlotMemory,
} from "@/lib/memoryTypes";
import type { SlotStatus } from "@/lib/useMemoryStore";

const MAX_ABILITIES = 3;

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
 */
export default function SlotEditor({
  index,
  value,
  status,
  sourceName,
  onChange,
  onClear,
  onSaveNew,
  onOverwrite,
}: {
  index: number;
  value: SlotMemory | null;
  status: SlotStatus;
  /** 保存元のメモリー名（上書き保存ボタンに出す） */
  sourceName?: string;
  onChange: (next: SlotMemory) => void;
  onClear: () => void;
  onSaveNew: () => void;
  onOverwrite: () => void;
}) {
  const base: SlotMemory = value ?? { plan: "共通", abilities: [] };
  const locked = status === "template";
  const abilities = base.abilities;
  const canSave = abilities.length > 0;

  /** 値ボタンのクリック: 同属性は値の置き換え、同じ値なら解除、新属性は3つまで追加 */
  const toggleValue = (attr: AttrKey, val: string) => {
    if (locked) return;
    const existing = abilities.find((a) => a.attr === attr);
    let next;
    if (existing) {
      next =
        existing.value === val
          ? abilities.filter((a) => a.attr !== attr)
          : abilities.map((a) => (a.attr === attr ? { attr, value: val } : a));
    } else {
      if (abilities.length >= MAX_ABILITIES) return;
      next = [...abilities, { attr, value: val }];
    }
    onChange({ ...base, abilities: sortAbilities(next) });
  };

  const badge = STATUS_BADGE[status];

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
        <>
          {/* アビリティ選択（最大3つ・同一属性の重複不可） */}
          <div className="flex flex-col gap-3">
            <p className={NOTE}>
              アビリティを最大3つ（同じ属性は1つまで）:{" "}
              <span className="font-semibold text-slate-700">
                {abilities.length}/{MAX_ABILITIES}
              </span>
            </p>
            {ATTR_LIST.map((attr) => {
              const style = ATTR_STYLES[attr];
              const current = abilities.find((a) => a.attr === attr);
              // この属性が未選択で、すでに3属性選ばれていたら選択不可
              const full = !current && abilities.length >= MAX_ABILITIES;
              return (
                <div key={attr}>
                  <span
                    className={`mb-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-bold ${style.chip} ${
                      full ? "opacity-40" : ""
                    }`}
                  >
                    {ATTR_LABEL[attr]}
                    {attr === "回復" && <span className="ml-1 font-normal">(対象を選択)</span>}
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {ATTR_VALUES[attr].map((val) => {
                      const on = current?.value === val;
                      return (
                        <button
                          key={val}
                          type="button"
                          disabled={full}
                          onClick={() => toggleValue(attr, val)}
                          className={`rounded-md border px-1 py-1.5 text-xs font-semibold transition ${
                            full ? BTN_DISABLED : on ? style.btnOn : style.btnOff
                          }`}
                        >
                          {val}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* プランと名前 */}
          <div className="mt-4">
            <p className={`mb-1 ${NOTE}`}>プラン:</p>
            <div className="flex flex-wrap gap-1.5">
              {PLAN_LIST.map((p) => {
                const s = PLAN_STYLES[p];
                const on = base.plan === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onChange({ ...base, plan: p })}
                    className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition ${
                      on ? s.btnOn : s.btnOff
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-3">
            <p className={`mb-1 ${NOTE}`}>名前（任意）:</p>
            <input
              type="text"
              value={base.skillName ?? ""}
              onChange={(e) =>
                onChange({ ...base, skillName: e.target.value || undefined })
              }
              placeholder="例: 咲季用パラボ"
              maxLength={20}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
        </>
      )}

      {/* 保存・空にする */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {status === "unsaved" && (
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
            <button
              type="button"
              onClick={onSaveNew}
              disabled={!canSave}
              className={BTN_SECONDARY}
            >
              別のメモリーとして保存
            </button>
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
