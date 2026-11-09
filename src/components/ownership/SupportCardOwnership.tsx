import { Fragment, useMemo, useState } from "react";
import type { Rarity } from "@/data/constants";
import {
  CARD_PLANS,
  CARD_TYPES,
  SUPPORT_CATALOG,
  USED_ABILITY_KEYS,
} from "@/data/supportCardCatalog";
import { ABILITY_NAMES, type AbilityName } from "@/data/constants";
import { matchesCardQuery } from "@/lib/cardSearch";
import type { useOwnedLevels } from "@/lib/useOwnedLevels";
import SupportCardItem from "./SupportCardItem";
import {
  ApplyButton,
  CheckFilter,
  FilterSelect,
  GroupHeading,
  Segmented,
  Toolbar,
} from "./ownershipControls";

const RARITIES: Rarity[] = ["R", "SR", "SSR", "EventSSR"];
/** 並び・見出しの順（SSR →配布SSR→ SR → R） */
const RARITY_ORDER: Rarity[] = ["SSR", "EventSSR", "SR", "R"];
const rarityLabel = (r: string) => (r === "EventSSR" ? "配布SSR" : r);

/** 一括入力の選択肢: keep=変更しない / -1=未所持 / 0〜4=凸数 */
type BulkLevel = "keep" | number;

/**
 * サポカの所持入力。上に検索・絞り込み・一括入力の帯（一括入力は押したときだけ開く）、下にレアリティごとの見出しで区切った一覧。
 * 2026-11-09 に整理（オーナー「ごちゃごちゃしてる」。機能はそのまま、「所持のみ」を足した）。
 */
export default function SupportCardOwnership({
  store,
}: {
  /** 所持ストアは親（OwnershipPage）が1つだけ持って配る（別インスタンスだと同期しない） */
  store: ReturnType<typeof useOwnedLevels>;
}) {
  const { getLevel, setLevel, setManyLevels, loaded } = store;
  const [rarityFilter, setRarityFilter] = useState<"すべて" | Rarity>("すべて");
  const [typeFilter, setTypeFilter] = useState<"すべて" | (typeof CARD_TYPES)[number]>("すべて");
  const [planFilter, setPlanFilter] = useState<"すべて" | (typeof CARD_PLANS)[number]>("すべて");
  const [abilityFilter, setAbilityFilter] = useState<AbilityName | "">("");
  const [nameQuery, setNameQuery] = useState("");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [bulkLevel, setBulkLevel] = useState<BulkLevel>("keep");

  // 現在のフィルターで表示するカード。
  // 並びは SSR →配布SSR→ SR → R、各レアリティ内は登場日が新しい順
  // （スプシの登場日列。同じ日はスプシの id が大きい順。新カードが上に来るので入力しやすい。2026-10-07）
  const visible = useMemo(() => {
    const order = (r: string) => {
      const i = RARITY_ORDER.indexOf(r as Rarity);
      return i < 0 ? 9 : i;
    };
    return SUPPORT_CATALOG.filter((card) => {
      if (rarityFilter !== "すべて" && card.rarity !== rarityFilter) return false;
      if (typeFilter !== "すべて" && card.cardType !== typeFilter) return false;
      if (planFilter !== "すべて" && card.plan !== planFilter) return false;
      if (abilityFilter && !card.abilityKeys.includes(abilityFilter)) return false;
      if (nameQuery.trim() && !matchesCardQuery(card.name, nameQuery)) return false;
      if (ownedOnly && loaded && getLevel(card.id) < 0) return false;
      return true;
    }).sort(
      (a, b) =>
        order(a.rarity) - order(b.rarity) ||
        b.releaseDate.localeCompare(a.releaseDate) ||
        b.sheetId - a.sheetId,
    );
  }, [rarityFilter, typeFilter, planFilter, abilityFilter, nameQuery, ownedOnly, loaded, getLevel]);

  // 表示中のカードだけを選択したレベルに一括設定（非表示は維持）
  const applyBulk = () => {
    if (bulkLevel === "keep") return;
    setManyLevels(
      visible.map((card) => card.id),
      bulkLevel,
    );
  };

  return (
    <section className="flex flex-col gap-3">
      <Toolbar
        query={nameQuery}
        onQuery={setNameQuery}
        placeholder="名前で検索（ひらがなOK）"
        count={visible.length}
        bulk={
          <>
            <Segmented
              label="凸数"
              value={bulkLevel}
              onChange={setBulkLevel}
              options={[
                { value: "keep" as const, label: "変更しない" },
                { value: -1, label: "未所持" },
                ...[0, 1, 2, 3, 4].map((n) => ({ value: n, label: `${n}凸` })),
              ]}
            />
            <ApplyButton
              count={visible.length}
              disabled={visible.length === 0 || bulkLevel === "keep"}
              onClick={applyBulk}
            />
          </>
        }
      >
        <FilterSelect
          label="レアリティ"
          options={RARITIES.map((r) => ({ value: r, label: rarityLabel(r) }))}
          value={rarityFilter}
          onChange={(v) => setRarityFilter(v as "すべて" | Rarity)}
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
        <FilterSelect
          label="アビリティ"
          options={USED_ABILITY_KEYS.map((key) => ({ value: key, label: ABILITY_NAMES[key] }))}
          value={abilityFilter || "すべて"}
          onChange={(v) => setAbilityFilter(v === "すべて" ? "" : (v as AbilityName))}
        />
        <CheckFilter label="所持のみ" checked={ownedOnly} onChange={setOwnedOnly} />
      </Toolbar>

      {/* カード一覧（レアリティごとの見出しで区切る・スマホ1列〜PC3列） */}
      {visible.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {RARITY_ORDER.map((rarity) => {
            const cards = visible.filter((c) => c.rarity === rarity);
            if (cards.length === 0) return null;
            return (
              <Fragment key={rarity}>
                <GroupHeading
                  label={rarityLabel(rarity)}
                  count={cards.length}
                  owned={loaded ? cards.filter((c) => getLevel(c.id) >= 0).length : undefined}
                />
                {cards.map((card) => (
                  <SupportCardItem
                    key={card.id}
                    card={card}
                    level={getLevel(card.id)}
                    onChange={(level) => setLevel(card.id, level)}
                  />
                ))}
              </Fragment>
            );
          })}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
          条件に合うカードがありません。フィルターを変更してください。
        </p>
      )}
    </section>
  );
}
