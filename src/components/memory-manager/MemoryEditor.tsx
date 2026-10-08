import { FIELD } from "@/components/ui";
import {
  ATTR_LABEL,
  ATTR_LIST,
  ATTR_STYLES,
  ATTR_VALUES,
  PLAN_LIST,
  PLAN_STYLES,
  type Ability,
  type AttrKey,
  type PlanKey,
} from "@/lib/memoryTypes";

export const MAX_ABILITIES = 3;

/** 入力欄が扱うメモリーの中身（プラン・名前・アビリティ） */
export type MemoryEditorValue = {
  plan: PlanKey;
  skillName?: string;
  abilities: Ability[];
};

/**
 * メモリーの中身を入れる共通の入力欄。
 * ゲームのメモリーと同じ「アビリティ3行」で、行ごとに属性と値を選ぶ（同じ属性は1つまで。「なし」でその行が消える）。
 * プランと名前は withMeta のときだけ（1枚ずつ保存するときに付けるもの。枠の編集では出さない。オーナー 2026-10-08）。
 */
export default function MemoryEditor({
  value,
  onChange,
  withMeta = true,
}: {
  value: MemoryEditorValue;
  onChange: (next: MemoryEditorValue) => void;
  /** プランと名前の欄も出すか */
  withMeta?: boolean;
}) {
  const abilities = value.abilities;

  /** i 行目の属性・値を変える（attr が "" なら行を消す。値を省くと属性が同じなら今の値、違えば先頭の値） */
  const setLine = (index: number, attr: AttrKey | "", val?: string) => {
    const next = [...abilities];
    if (attr === "") {
      next.splice(index, 1);
    } else {
      const current = next[index];
      const ability: Ability = {
        attr,
        value: val ?? (current?.attr === attr ? current.value : ATTR_VALUES[attr][0]),
      };
      if (index < next.length) next[index] = ability;
      else next.push(ability);
    }
    onChange({ ...value, abilities: next });
  };

  const lines = Array.from({ length: MAX_ABILITIES }, (_, i) => abilities[i] ?? null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        {lines.map((ab, i) => {
          const usedElsewhere = new Set(abilities.filter((_, j) => j !== i).map((a) => a.attr));
          const style = ab ? ATTR_STYLES[ab.attr] : null;
          // 前の行が空のままなら、次の行はまだ選べない（上から順に入れる）
          const disabled = !ab && i > abilities.length;
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <span
                className={`w-20 shrink-0 rounded px-1.5 py-0.5 text-center text-[11px] font-bold ${
                  style ? style.chip : "bg-slate-100 text-slate-400"
                }`}
              >
                アビリティ{i + 1}
              </span>
              <select
                value={ab?.attr ?? ""}
                disabled={disabled}
                onChange={(e) => setLine(i, e.target.value as AttrKey | "")}
                title="属性（Vo／Da／Vi／Pポイント／回復）。同じ属性は1つまで"
                className={`${FIELD} w-28 disabled:bg-slate-50 disabled:text-slate-300`}
              >
                <option value="">なし</option>
                {ATTR_LIST.map((attr) => (
                  <option key={attr} value={attr} disabled={usedElsewhere.has(attr)}>
                    {ATTR_LABEL[attr]}
                  </option>
                ))}
              </select>
              <select
                value={ab?.value ?? ""}
                disabled={!ab}
                onChange={(e) => ab && setLine(i, ab.attr, e.target.value)}
                title={ab?.attr === "回復" ? "回復の対象" : "値"}
                className={`${FIELD} w-24 disabled:bg-slate-50 disabled:text-slate-300`}
              >
                {ab ? (
                  ATTR_VALUES[ab.attr].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))
                ) : (
                  <option value="">—</option>
                )}
              </select>
            </div>
          );
        })}
      </div>

      {withMeta && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500">プラン</span>
            {PLAN_LIST.map((p) => {
              const s = PLAN_STYLES[p];
              const on = value.plan === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => onChange({ ...value, plan: p })}
                  className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition ${
                    on ? s.btnOn : s.btnOff
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-slate-500">
            名前
            <input
              type="text"
              value={value.skillName ?? ""}
              onChange={(e) => onChange({ ...value, skillName: e.target.value || undefined })}
              placeholder="任意（例: 咲季用パラボ）"
              maxLength={20}
              className={`${FIELD} min-w-0 flex-1`}
            />
          </label>
        </div>
      )}
    </div>
  );
}
