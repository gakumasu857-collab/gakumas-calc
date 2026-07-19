import { useState } from "react";
import { Plus } from "lucide-react";
import {
  ATTR_LABEL,
  ATTR_LIST,
  ATTR_STYLES,
  ATTR_VALUES,
  BTN_DISABLED,
  PLAN_LIST,
  PLAN_STYLES,
  SKILL_PICKER_STYLE,
  sortAbilities,
  type Ability,
  type AttrKey,
  type Memory,
  type PlanKey,
} from "@/lib/memoryTypes";
import PlanSelectorModal from "./PlanSelectorModal";

type Props = {
  onAdd: (memory: Omit<Memory, "id" | "isTemplate">) => void;
};

const MAX_ABILITIES = 3;

/** 画面右側のメモリー作成フォーム。 */
export default function MemoryCreator({ onAdd }: Props) {
  const [abilities, setAbilities] = useState<Ability[]>([]);
  const [plan, setPlan] = useState<PlanKey>("共通");
  const [skillName, setSkillName] = useState<string | undefined>(undefined);
  const [skillModalOpen, setSkillModalOpen] = useState(false);

  const selectedAttrs = abilities.map((a) => a.attr);

  /** 値ボタンのクリック: 同属性は値の置き換え、同じ値なら解除、新属性は3つまで追加 */
  const toggleValue = (attr: AttrKey, value: string) => {
    setAbilities((prev) => {
      const existing = prev.find((a) => a.attr === attr);
      if (existing) {
        if (existing.value === value) {
          return prev.filter((a) => a.attr !== attr); // 同じ値を再クリック→解除
        }
        return prev.map((a) => (a.attr === attr ? { attr, value } : a)); // 値を置き換え
      }
      if (prev.length >= MAX_ABILITIES) return prev; // 属性は最大3つ
      return [...prev, { attr, value }];
    });
  };

  // プランを直接選ぶとスキル選択は解除される
  const choosePlan = (p: PlanKey) => {
    setPlan(p);
    setSkillName(undefined);
  };

  const handleAdd = () => {
    if (abilities.length === 0) return;
    // Vo→Da→Vi→P→回復 の順に揃えて保存する
    onAdd({ plan, skillName, abilities: sortAbilities(abilities) });
    setAbilities([]); // プランは維持し、アビリティだけリセット
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-bold text-slate-900">メモリー追加</h2>

      {/* アビリティ選択（最大3つ・同一属性の重複不可） */}
      <div className="flex flex-col gap-3">
        <p className="text-xs text-slate-500">
          アビリティを最大3つ選択（同じ属性は1つまで）:{" "}
          <span className="font-semibold text-slate-700">
            {abilities.length}/{MAX_ABILITIES}
          </span>
        </p>

        {ATTR_LIST.map((attr) => {
          const style = ATTR_STYLES[attr];
          const current = abilities.find((a) => a.attr === attr);
          // この属性が未選択で、すでに3属性選ばれていたら選択不可
          const locked = !current && abilities.length >= MAX_ABILITIES;
          return (
            <div key={attr}>
              <span
                className={`mb-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-bold ${style.chip} ${
                  locked ? "opacity-40" : ""
                }`}
              >
                {ATTR_LABEL[attr]}
                {attr === "回復" && (
                  <span className="ml-1 font-normal">(対象を選択)</span>
                )}
              </span>
              {/* 4列のボタンレイアウト */}
              <div className="grid grid-cols-4 gap-1.5">
                {ATTR_VALUES[attr].map((value) => {
                  const on = current?.value === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={locked}
                      onClick={() => toggleValue(attr, value)}
                      className={`rounded-md border px-1 py-1.5 text-xs font-semibold transition ${
                        locked ? BTN_DISABLED : on ? style.btnOn : style.btnOff
                      }`}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* プラン設定（スキル選択時はそのスキルの所属プランが自動で入る） */}
      <div className="mt-4">
        <p className="mb-1 text-xs text-slate-500">プラン設定:</p>
        <div className="flex flex-wrap gap-1.5">
          {PLAN_LIST.map((p) => {
            const s = PLAN_STYLES[p];
            const on = plan === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => choosePlan(p)}
                className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition ${
                  on ? s.btnOn : s.btnOff
                }`}
              >
                {s.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setSkillModalOpen(true)}
            className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition ${
              skillName ? SKILL_PICKER_STYLE.btnOn : SKILL_PICKER_STYLE.btnOff
            }`}
          >
            {skillName ? `スキル: ${skillName}` : "スキルから選択"}
          </button>
        </div>
      </div>

      {/* 追加ボタン */}
      <button
        type="button"
        onClick={handleAdd}
        disabled={abilities.length === 0}
        className={`mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition ${
          abilities.length === 0
            ? "cursor-not-allowed bg-slate-100 text-slate-400"
            : "bg-blue-600 text-white hover:bg-blue-500"
        }`}
      >
        <Plus size={16} />
        メモリー追加
      </button>

      {skillModalOpen && (
        <PlanSelectorModal
          onSelect={(skill) => {
            // スキルの所属プランをメモリーのプランにする
            setPlan(skill.plan);
            setSkillName(skill.name);
            setSkillModalOpen(false);
          }}
          onClose={() => setSkillModalOpen(false)}
        />
      )}
    </section>
  );
}
