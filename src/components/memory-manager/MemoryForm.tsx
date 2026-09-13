import { useState } from "react";
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
  type Memory,
  type PlanKey,
} from "@/lib/memoryTypes";

/** メモリー1枚の中身（ID・テンプレ印を除いたもの）。作成フォームと編集モーダルで共用 */
export type MemoryDraft = Omit<Memory, "id" | "isTemplate" | "roleSpec">;

const MAX_ABILITIES = 3;

/**
 * メモリーの中身を選ぶフォーム（アビリティ最大3つ・プラン・名前）。
 * 新規作成（MemoryCreator）と、スロットのメモリーの編集（MemoryEditModal）で同じものを使う。
 * 値ボタンは「同じ属性は値の置き換え、同じ値なら解除」なので、1つのアビリティだけ変える操作もここで済む。
 */
export default function MemoryForm({
  initial,
  submitLabel,
  submitIcon,
  onSubmit,
  resetAfterSubmit = false,
  secondaryLabel,
  onSecondary,
}: {
  /** 編集のときの初期値。無ければ空から */
  initial?: MemoryDraft;
  submitLabel: string;
  submitIcon?: React.ReactNode;
  onSubmit: (draft: MemoryDraft) => void;
  /** 送信後にアビリティと名前を空に戻す（作成フォーム用。プランは維持） */
  resetAfterSubmit?: boolean;
  /** もう1つの送信先（例: 別のメモリーとして保存） */
  secondaryLabel?: string;
  onSecondary?: (draft: MemoryDraft) => void;
}) {
  const [abilities, setAbilities] = useState<Ability[]>(() =>
    initial ? sortAbilities(initial.abilities) : [],
  );
  const [plan, setPlan] = useState<PlanKey>(initial?.plan ?? "共通");
  const [name, setName] = useState(initial?.skillName ?? "");

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

  const draft = (): MemoryDraft => ({
    plan,
    skillName: name.trim() || undefined,
    // Vo→Da→Vi→P→回復 の順に揃えて保存する
    abilities: sortAbilities(abilities),
  });

  const submit = (handler: (d: MemoryDraft) => void) => {
    if (abilities.length === 0) return;
    handler(draft());
    if (resetAfterSubmit) {
      setAbilities([]); // プランは維持し、アビリティと名前だけリセット
      setName("");
    }
  };

  const empty = abilities.length === 0;

  return (
    <div>
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

      {/* プラン設定 */}
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
                onClick={() => setPlan(p)}
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

      {/* 名前（任意）。プランとは独立に自由につけられる */}
      <div className="mt-3">
        <p className="mb-1 text-xs text-slate-500">名前（任意）:</p>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: 咲季用パラボ"
          maxLength={20}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>

      {/* 送信ボタン */}
      <button
        type="button"
        onClick={() => submit(onSubmit)}
        disabled={empty}
        className={`mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition ${
          empty
            ? "cursor-not-allowed bg-slate-100 text-slate-400"
            : "bg-blue-600 text-white hover:bg-blue-500"
        }`}
      >
        {submitIcon}
        {submitLabel}
      </button>
      {secondaryLabel && onSecondary && (
        <button
          type="button"
          onClick={() => submit(onSecondary)}
          disabled={empty}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {secondaryLabel}
        </button>
      )}
    </div>
  );
}
