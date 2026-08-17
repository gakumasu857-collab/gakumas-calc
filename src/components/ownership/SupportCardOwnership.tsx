import { useMemo, useState } from "react";
import type { Rarity } from "@/data/constants";
import {
  CARD_PLANS,
  CARD_TYPES,
  SUPPORT_CATALOG,
  USED_ABILITY_KEYS,
} from "@/data/supportCardCatalog";
import { ABILITY_NAMES, type AbilityName } from "@/data/constants";
import { matchesCardQuery } from "@/lib/cardSearch";
import { useOwnedLevels } from "@/lib/useOwnedLevels";
import CsvTransfer from "./CsvTransfer";
import SupportCardItem from "./SupportCardItem";

const RARITIES: Rarity[] = ["R", "SR", "SSR", "EventSSR"];

/** 一括入力の選択肢: keep=変更しない / -1=未所持 / 0〜4=凸数 */
type BulkLevel = "keep" | number;

export default function SupportCardOwnership() {
  const { getLevel, setLevel, setManyLevels, applyLevels } = useOwnedLevels();
  const [rarityFilter, setRarityFilter] = useState<"すべて" | Rarity>("すべて");
  const [typeFilter, setTypeFilter] = useState<
    "すべて" | (typeof CARD_TYPES)[number]
  >("すべて");
  const [planFilter, setPlanFilter] = useState<
    "すべて" | (typeof CARD_PLANS)[number]
  >("すべて");
  const [abilityFilter, setAbilityFilter] = useState<AbilityName | "">("");
  const [nameQuery, setNameQuery] = useState("");
  const [bulkLevel, setBulkLevel] = useState<BulkLevel>("keep");

  // 現在のフィルターで表示するカード。
  // 並びは SSR →配布SSR→ SR → R、各レアリティ内は実装順（スプシの順）
  const visible = useMemo(() => {
    const rarityOrder: Record<string, number> = {
      SSR: 0,
      EventSSR: 1,
      SR: 2,
      R: 3,
    };
    return SUPPORT_CATALOG.filter((card) => {
      if (rarityFilter !== "すべて" && card.rarity !== rarityFilter)
        return false;
      if (typeFilter !== "すべて" && card.cardType !== typeFilter)
        return false;
      if (planFilter !== "すべて" && card.plan !== planFilter) return false;
      if (abilityFilter && !card.abilityKeys.includes(abilityFilter))
        return false;
      if (nameQuery.trim() && !matchesCardQuery(card.name, nameQuery))
        return false;
      return true;
    }).sort(
      (a, b) => (rarityOrder[a.rarity] ?? 9) - (rarityOrder[b.rarity] ?? 9),
    );
  }, [rarityFilter, typeFilter, planFilter, abilityFilter, nameQuery]);

  // 表示中のカードだけを選択したレベルに一括設定（非表示は維持）
  const applyBulk = () => {
    if (bulkLevel === "keep") return;
    setManyLevels(
      visible.map((card) => card.id),
      bulkLevel,
    );
  };

  /** 現在の所持状況をCSVにする（このまま編集して読み込める） */
  const buildCsv = () =>
    ["カード名,凸数"]
      .concat(
        SUPPORT_CATALOG.map((card) => `"${card.name}",${getLevel(card.id)}`),
      )
      .join("\r\n");

  /** CSVを読み込んで所持状況に反映（名前一致・-1または「未」=未所持） */
  const importCsv = (text: string) => {
    const nameToId = new Map(SUPPORT_CATALOG.map((c) => [c.name, c.id]));
    const entries: Record<string, number> = {};
    const unmatched: string[] = [];
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      // 名前にカンマが入っても大丈夫なように、最後のカンマで分ける
      const idx = line.lastIndexOf(",");
      if (idx < 0) continue;
      const name = line.slice(0, idx).trim().replace(/^"|"$/g, "").trim();
      const levelStr = line.slice(idx + 1).trim().replace(/^"|"$/g, "");
      if (!name || name === "カード名") continue; // ヘッダー行
      const level =
        levelStr === "未" || levelStr === "未所持"
          ? -1
          : Number.parseInt(levelStr, 10);
      if (Number.isNaN(level)) {
        unmatched.push(name);
        continue;
      }
      const id = nameToId.get(name);
      if (!id) {
        unmatched.push(name);
        continue;
      }
      entries[id] = Math.max(-1, Math.min(4, level));
    }
    applyLevels(entries);
    return { applied: Object.keys(entries).length, unmatched };
  };

  return (
    <section className="flex flex-col gap-3">
      {/* フィルター（Pアイドルページと同じプルダウン形式） */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
        <FilterSelect
          label="レアリティ"
          options={RARITIES.map((r) => (r === "EventSSR" ? "配布SSR" : r))}
          value={rarityFilter === "EventSSR" ? "配布SSR" : rarityFilter}
          onChange={(v) =>
            setRarityFilter(
              v === "すべて" ? "すべて" : v === "配布SSR" ? "EventSSR" : (v as Rarity),
            )
          }
        />
        <FilterSelect
          label="タイプ"
          options={[...CARD_TYPES]}
          value={typeFilter}
          onChange={(v) => setTypeFilter(v as typeof typeFilter)}
        />
        <FilterSelect
          label="プラン"
          options={[...CARD_PLANS]}
          value={planFilter}
          onChange={(v) => setPlanFilter(v as typeof planFilter)}
        />
        <label className="flex items-center gap-1">
          アビリティ
          <select
            value={abilityFilter}
            onChange={(e) =>
              setAbilityFilter(e.target.value as AbilityName | "")
            }
            className="rounded-lg border border-slate-300 bg-white px-1.5 py-1"
          >
            <option value="">すべて</option>
            {USED_ABILITY_KEYS.map((key) => (
              <option key={key} value={key}>
                {ABILITY_NAMES[key]}
              </option>
            ))}
          </select>
        </label>
        <input
          type="search"
          value={nameQuery}
          onChange={(e) => setNameQuery(e.target.value)}
          placeholder="名前で検索"
          className="w-44 rounded-lg border border-slate-300 bg-white px-2 py-1 outline-none focus:border-blue-500"
        />
        <span className="ml-auto text-slate-400">{visible.length}枚</span>
      </div>

      {/* 一括入力（Pアイドルと同じセグメント方式・表示中のカードにまとめて適用） */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs">
        <span className="font-bold text-slate-700">一括入力</span>
        <Segmented
          label="凸数"
          value={bulkLevel}
          onChange={setBulkLevel}
          options={[
            { value: "keep" as const, label: "変更しない" },
            { value: -1, label: "未所持" },
            ...[0, 1, 2, 3, 4].map((n) => ({
              value: n,
              label: `${n}凸`,
            })),
          ]}
        />
        <button
          type="button"
          disabled={visible.length === 0 || bulkLevel === "keep"}
          onClick={applyBulk}
          className="rounded-lg bg-blue-600 px-3 py-1.5 font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          表示中の{visible.length}枚に適用
        </button>
      </div>

      {/* CSVで一括入出力 */}
      <CsvTransfer
        formatNote="カード名,凸数（-1または未=未所持、0〜4=凸数。まず書き出して編集するのが確実）"
        exportName="サポカ所持状況.csv"
        buildCsv={buildCsv}
        onImport={importCsv}
      />

      {/* 操作説明 */}
      <p className="text-xs text-slate-500">
        「未」で未所持(モノクロ)、0〜4のボタンで凸数を設定。
      </p>

      {/* カード一覧（コンパクト行・スマホ1列〜PC3列） */}
      {visible.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((card) => (
            <SupportCardItem
              key={card.id}
              card={card}
              level={getLevel(card.id)}
              onChange={(level) => setLevel(card.id, level)}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
          条件に合うカードがありません。フィルターを変更してください。
        </p>
      )}
    </section>
  );
}

/** 一括入力用のセグメントボタン（Pアイドルページと同じ見た目） */
function Segmented<T extends string | number>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-slate-500">{label}</span>
      <div className="flex overflow-hidden rounded-lg border border-slate-300">
        {options.map((option, i) => (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onChange(option.value)}
            className={`px-2 py-1 font-semibold transition ${
              i > 0 ? "border-l border-slate-300" : ""
            } ${
              option.value === value
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-1">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-1.5 py-1"
      >
        <option value="すべて">すべて</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
