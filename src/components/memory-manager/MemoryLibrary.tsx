import { useMemo, useState } from "react";
import { Filter, Pencil, Trash2 } from "lucide-react";
import { BTN_SECONDARY } from "@/components/ui";
import {
  ATTR_LABEL,
  ATTR_LIST,
  ATTR_STYLES,
  ATTR_VALUES,
  PLAN_LIST,
  type AttrKey,
  type Memory,
  type PlanKey,
} from "@/lib/memoryTypes";
import MemoryLine from "./MemoryLine";

type Props = {
  memories: Memory[];
  /** id -> 枠に入っている枚数 */
  selectedCounts: Map<string, number>;
  /** 入れる先の枠 */
  activeIndex?: number;
  /** 「枠に入れる」 */
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  /** ✎で保存したメモリーの中身を直接編集 */
  onEdit?: (id: string) => void;
};

/**
 * 保存したメモリー（1枚ずつ）の一覧。1枚1行（2026-10-08 にカードの並びから作り直し）。
 * 「枠に入れる」で編集中の枠に入れる。✎で中身を編集、ゴミ箱で消す（押すとその場で確認）。フィルター付き。
 * テンプレのメインパラボは枠の設定に移したので、ここには出さない。
 */
export default function MemoryLibrary({
  memories,
  selectedCounts,
  activeIndex,
  onSelect,
  onDelete,
  onEdit,
}: Props) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [planFilter, setPlanFilter] = useState<PlanKey | "すべて">("すべて");
  const [attrFilters, setAttrFilters] = useState<AttrKey[]>([]);
  /** 属性ごとの値の絞り込み（空配列 or 未設定なら値は問わない） */
  const [valueFilters, setValueFilters] = useState<Partial<Record<AttrKey, string[]>>>({});
  /** 消す前の確認を出しているメモリー */
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const toggleAttrFilter = (attr: AttrKey) => {
    setAttrFilters((prev) => {
      if (prev.includes(attr)) {
        // 属性を外したら値の絞り込みも消す
        setValueFilters((vf) => {
          const next = { ...vf };
          delete next[attr];
          return next;
        });
        return prev.filter((a) => a !== attr);
      }
      return [...prev, attr];
    });
  };

  const toggleValueFilter = (attr: AttrKey, value: string) => {
    setValueFilters((prev) => {
      const current = prev[attr] ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [attr]: next };
    });
  };

  const visible = useMemo(
    () =>
      memories.filter((m) => {
        if (planFilter !== "すべて" && m.plan !== planFilter) return false;
        // 選択中の属性をすべて含み、値の絞り込みがあればそれにも一致するもの
        for (const attr of attrFilters) {
          const ability = m.abilities.find((a) => a.attr === attr);
          if (!ability) return false;
          const values = valueFilters[attr];
          if (values && values.length > 0 && !values.includes(ability.value)) return false;
        }
        return true;
      }),
    [memories, planFilter, attrFilters, valueFilters],
  );
  const filtering = planFilter !== "すべて" || attrFilters.length > 0;

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold text-slate-900">
          保存したメモリー
          <span className="ml-2 text-xs font-normal text-slate-500">{memories.length}枚</span>
        </h2>
        <button
          type="button"
          onClick={() => setFilterOpen((v) => !v)}
          className={`ml-auto flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition ${
            filterOpen || filtering
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Filter size={13} />
          絞り込み
        </button>
      </div>

      {/* フィルターUI */}
      {filterOpen && (
        <div className="mb-3 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500">プラン:</span>
            {(["すべて", ...PLAN_LIST] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlanFilter(p)}
                className={`rounded-md border px-2 py-0.5 text-xs transition ${
                  planFilter === p
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500">アビリティ:</span>
            {ATTR_LIST.map((attr) => {
              const on = attrFilters.includes(attr);
              const s = ATTR_STYLES[attr];
              return (
                <button
                  key={attr}
                  type="button"
                  onClick={() => toggleAttrFilter(attr)}
                  className={`rounded-md border px-2 py-0.5 text-xs font-medium transition ${
                    on ? s.btnOn : s.btnOff
                  }`}
                >
                  {attr}
                </button>
              );
            })}
          </div>
          {/* 選択中の属性ごとの値絞り込み */}
          {attrFilters.map((attr) => {
            const s = ATTR_STYLES[attr];
            const selected = valueFilters[attr] ?? [];
            return (
              <div key={attr} className="flex flex-wrap items-center gap-1.5">
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${s.chip}`}>
                  {ATTR_LABEL[attr]}の値
                </span>
                {ATTR_VALUES[attr].map((value) => {
                  const on = selected.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => toggleValueFilter(attr, value)}
                      className={`rounded-md border px-2 py-0.5 text-xs font-medium transition ${
                        on ? s.btnOn : s.btnOff
                      }`}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* 一覧（1枚1行） */}
      {visible.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {visible.map((memory) => {
            const count = selectedCounts.get(memory.id) ?? 0;
            const confirming = confirmId === memory.id;
            return (
              <li
                key={memory.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5"
              >
                <MemoryLine memory={memory} />
                {count > 0 && (
                  <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                    枠に{count}枚
                  </span>
                )}
                <span className="ml-auto flex items-center gap-1">
                  {confirming ? (
                    <>
                      <span className="text-xs text-red-700">消しますか？</span>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmId(null);
                          onDelete(memory.id);
                        }}
                        className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-500"
                      >
                        消す
                      </button>
                      <button type="button" onClick={() => setConfirmId(null)} className={BTN_SECONDARY}>
                        やめる
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onSelect(memory.id)}
                        className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-blue-500"
                      >
                        {activeIndex !== undefined ? `枠${activeIndex + 1}に入れる` : "枠に入れる"}
                      </button>
                      {onEdit && (
                        <button
                          type="button"
                          onClick={() => onEdit(memory.id)}
                          aria-label="中身を編集"
                          title="中身を編集"
                          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setConfirmId(memory.id)}
                        aria-label="削除"
                        title="削除"
                        className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
          {memories.length === 0
            ? "保存したメモリーはまだありません。枠の中身を作って「この中身を保存」で保存すると、ここに並びます。"
            : "条件に合うメモリーがありません。絞り込みを変えてください。"}
        </p>
      )}
    </section>
  );
}
