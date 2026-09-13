import { NOTE } from "@/components/ui";
import {
  ATTR_LABEL,
  ATTR_LIST,
  ATTR_STYLES,
  ATTR_VALUES,
  BTN_DISABLED,
  PLAN_LIST,
  PLAN_STYLES,
  sortAbilities,
  type Ability,
  type AttrKey,
  type PlanKey,
} from "@/lib/memoryTypes";

export const MAX_ABILITIES = 3;

/** 入力欄が扱うメモリーの中身（プラン・名前・アビリティ） */
export type MemoryFieldsValue = {
  plan: PlanKey;
  skillName?: string;
  abilities: Ability[];
};

/**
 * メモリーの中身を選ぶ共通の入力欄（アビリティ最大3つ・プラン・名前）。
 * 枠の編集（SlotEditor）と保存したメモリーの編集（LibraryEditModal）で同じものを使う。
 * 値ボタンは「同じ属性は値の置き換え、同じ値なら解除」。
 */
export default function MemoryFields({
  value,
  onChange,
}: {
  value: MemoryFieldsValue;
  onChange: (next: MemoryFieldsValue) => void;
}) {
  const abilities = value.abilities;

  const toggleValue = (attr: AttrKey, val: string) => {
    const existing = abilities.find((a) => a.attr === attr);
    let next: Ability[];
    if (existing) {
      next =
        existing.value === val
          ? abilities.filter((a) => a.attr !== attr)
          : abilities.map((a) => (a.attr === attr ? { attr, value: val } : a));
    } else {
      if (abilities.length >= MAX_ABILITIES) return;
      next = [...abilities, { attr, value: val }];
    }
    onChange({ ...value, abilities: sortAbilities(next) });
  };

  return (
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
            const on = value.plan === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onChange({ ...value, plan: p })}
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
        <p className={`mb-1 ${NOTE}`}>名前（任意。付けると一覧で見分けやすい）:</p>
        <input
          type="text"
          value={value.skillName ?? ""}
          onChange={(e) => onChange({ ...value, skillName: e.target.value || undefined })}
          placeholder="例: 咲季用パラボ"
          maxLength={20}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>
    </>
  );
}
