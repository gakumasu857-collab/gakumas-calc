import { useMemo, useState } from "react";
import { Filter, Trash2 } from "lucide-react";
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
import { GLOSSARY } from "@/lib/glossary";
import MemoryCard from "./MemoryCard";

type Props = {
  memories: Memory[];
  /** id -> スロットに入っている枚数 */
  selectedCounts: Map<string, number>;
  /** いま編集中の枠（見出しの案内用） */
  activeIndex?: number;
  /** カードクリック=スロットへ追加（同じカード複数枚可） */
  onSelect: (id: string) => void;
  /** −ボタンで選択を1枚解除 */
  onRemoveOne: (id: string) => void;
  onDelete: (id: string) => void;
  /** ✎で保存したメモリーの中身を直接編集（テンプレは不可） */
  onEdit?: (id: string) => void;
};

/** 保存したメモリーの一覧。クリックで編集中の枠に入れる。テンプレ表示・削除モード・フィルター付き。 */
export default function MemoryLibrary({
  memories,
  selectedCounts,
  activeIndex,
  onSelect,
  onRemoveOne,
  onDelete,
  onEdit,
}: Props) {
  const [deleteMode, setDeleteMode] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [showTemplates, setShowTemplates] = useState(true);
  const [planFilter, setPlanFilter] = useState<PlanKey | "すべて">("すべて");
  const [attrFilters, setAttrFilters] = useState<AttrKey[]>([]);
  /** 属性ごとの値の絞り込み（空配列 or 未設定なら値は問わない） */
  const [valueFilters, setValueFilters] = useState<
    Partial<Record<AttrKey, string[]>>
  >({});

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
        if (!showTemplates && m.isTemplate) return false;
        if (planFilter !== "すべて" && m.plan !== planFilter) return false;
        // 選択中の属性をすべて含み、値の絞り込みがあればそれにも一致するもの
        for (const attr of attrFilters) {
          const ability = m.abilities.find((a) => a.attr === attr);
          if (!ability) return false;
          const values = valueFilters[attr];
          if (values && values.length > 0 && !values.includes(ability.value))
            return false;
        }
        return true;
      }),
    [memories, showTemplates, planFilter, attrFilters, valueFilters],
  );

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold text-slate-900">
          保存したメモリー
          <span className="ml-2 text-xs font-normal text-slate-500">
            クリックで{activeIndex !== undefined ? `枠${activeIndex + 1}` : "枠"}に入れる（同じカード何枚でも可）。✎で中身を編集、−で外す
          </span>
        </h2>
        <div className="ml-auto flex gap-1.5">
          {/* フィルター開閉 */}
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition ${
              filterOpen || planFilter !== "すべて" || attrFilters.length > 0
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Filter size={13} />
            フィルター
          </button>
          {/* 削除モード切り替え */}
          <button
            type="button"
            onClick={() => setDeleteMode((v) => !v)}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition ${
              deleteMode
                ? "border-red-600 bg-red-600 text-white"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Trash2 size={13} />
            {deleteMode ? "削除モード中" : "削除モード"}
          </button>
        </div>
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
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={showTemplates}
              onChange={(e) => setShowTemplates(e.target.checked)}
            />
            テンプレメモリー（メインパラボ）を表示
          </label>
          <p className="text-[11px] leading-relaxed text-slate-400">
            「メインパラボ◯点」とは: {GLOSSARY.mainParabo}
          </p>
        </div>
      )}

      {deleteMode && (
        <p className="mb-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-600">
          削除モード中: カードをクリックするとライブラリから削除されます（テンプレは削除不可）
        </p>
      )}

      {/* 一覧（置き場の幅に合わせて列数が変わる） */}
      {visible.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">
          {visible.map((memory) => {
            const count = selectedCounts.get(memory.id) ?? 0;
            return (
              <MemoryCard
                key={memory.id}
                memory={memory}
                deleteMode={deleteMode}
                selectedCount={count}
                onRemoveOne={
                  !deleteMode && count > 0
                    ? () => onRemoveOne(memory.id)
                    : undefined
                }
                onClick={() =>
                  deleteMode ? onDelete(memory.id) : onSelect(memory.id)
                }
                onEdit={
                  !deleteMode && onEdit && !memory.isTemplate
                    ? () => onEdit(memory.id)
                    : undefined
                }
              />
            );
          })}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
          条件に合うメモリーがありません。枠を選んで中身を作り「メモリーとして保存」するか、フィルターを変更してください。
        </p>
      )}
    </section>
  );
}
