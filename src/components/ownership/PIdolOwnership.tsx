import { Fragment, useMemo, useState } from "react";
import { P_IDOL_IDOLS, P_IDOL_MASTERS_BY_IDOL, type PIdolMaster } from "@/lib/pIdol";
import { matchesCardQuery } from "@/lib/cardSearch";
import { imageUrl } from "@/lib/config";
import type { useOwnedPIdols } from "@/lib/useOwnedPIdols";
import {
  ApplyButton,
  CheckFilter,
  FilterSelect,
  GroupHeading,
  Segmented,
  Toolbar,
} from "./ownershipControls";

/** 一括入力の特訓段階: keep=変更しない / unown=未所持 / 0〜7 */
type BulkKunren = "keep" | "unown" | number;
type BulkKaika = "keep" | number;

/**
 * Pアイドル所持入力（コンパクト版）。
 * 画像＋特訓段階・才能開花のボタンで1セット。アイドル順（スプシ idleTypes の順）に、アイドルごとの見出しで区切る（2026-11-09）。
 * 上の帯に検索・絞り込み・一括入力（一括入力は押したときだけ開く）。
 * レアリティ・プラン・おすすめ効果・計算後ステはデータベースページで見られる。
 */
export default function PIdolOwnership({
  store,
}: {
  /** 所持ストアは親（OwnershipPage）が1つだけ持って配る（別インスタンスだと同期しない） */
  store: ReturnType<typeof useOwnedPIdols>;
}) {
  const {
    getOwnership,
    setOwnership,
    setUnowned,
    setManyOwnership,
    setManyUnowned,
    loaded,
  } = store;
  const [idolFilter, setIdolFilter] = useState("すべて");
  const [nameQuery, setNameQuery] = useState("");
  const [rarityFilter, setRarityFilter] = useState("すべて");
  const [planFilter, setPlanFilter] = useState("すべて");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [bulkKunren, setBulkKunren] = useState<BulkKunren>("keep");
  const [bulkKaika, setBulkKaika] = useState<BulkKaika>("keep");

  const visible = useMemo(
    () =>
      P_IDOL_MASTERS_BY_IDOL.filter((m) => {
        if (idolFilter !== "すべて" && m.idol !== idolFilter) return false;
        if (rarityFilter !== "すべて" && m.rarity !== rarityFilter) return false;
        if (planFilter !== "すべて" && m.plan !== planFilter) return false;
        if (ownedOnly && loaded && !getOwnership(m.key)) return false;
        if (
          nameQuery.trim() &&
          !matchesCardQuery(m.cardName, nameQuery) &&
          !matchesCardQuery(m.idol, nameQuery)
        )
          return false;
        return true;
      }),
    [idolFilter, rarityFilter, planFilter, ownedOnly, nameQuery, getOwnership, loaded],
  );

  return (
    <div className="flex flex-col gap-3">
      <Toolbar
        query={nameQuery}
        onQuery={setNameQuery}
        placeholder="カード名・アイドル名で検索"
        count={visible.length}
        bulk={
          <>
            <Segmented
              label="特訓段階"
              value={bulkKunren}
              onChange={setBulkKunren}
              options={[
                { value: "keep" as const, label: "変更しない" },
                { value: "unown" as const, label: "未所持" },
                ...[0, 1, 2, 3, 4, 5, 6, 7].map((n) => ({
                  value: n,
                  label: String(n),
                })),
              ]}
            />
            <Segmented
              label="才能開花"
              value={bulkKaika}
              onChange={setBulkKaika}
              disabled={bulkKunren === "unown"}
              options={[
                { value: "keep" as const, label: "変更しない" },
                ...[0, 1, 2, 3, 4].map((n) => ({ value: n, label: String(n) })),
              ]}
            />
            <ApplyButton
              count={visible.length}
              disabled={visible.length === 0 || (bulkKunren === "keep" && bulkKaika === "keep")}
              onClick={() => {
                const keys = visible.map((m) => m.key);
                if (bulkKunren === "unown") {
                  setManyUnowned(keys);
                  return;
                }
                const patch: { kunren?: number; kaika?: number } = {};
                if (bulkKunren !== "keep") patch.kunren = bulkKunren;
                if (bulkKaika !== "keep") patch.kaika = bulkKaika;
                setManyOwnership(keys, patch);
              }}
            />
          </>
        }
      >
        <FilterSelect
          label="アイドル"
          options={P_IDOL_IDOLS}
          value={idolFilter}
          onChange={setIdolFilter}
        />
        <FilterSelect
          label="レアリティ"
          options={["R", "SR", "SSR", "配布SSR"]}
          value={rarityFilter}
          onChange={setRarityFilter}
        />
        <FilterSelect
          label="プラン"
          options={["センス", "ロジック", "アノマリー", "フリー"]}
          value={planFilter}
          onChange={setPlanFilter}
        />
        <CheckFilter label="所持のみ" checked={ownedOnly} onChange={setOwnedOnly} />
      </Toolbar>

      {/* 一覧（アイドルごとの見出しで区切る） */}
      {visible.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {P_IDOL_IDOLS.map((idol) => {
            const cards = visible.filter((m) => m.idol === idol);
            if (cards.length === 0) return null;
            return (
              <Fragment key={idol}>
                <GroupHeading
                  label={idol}
                  count={cards.length}
                  owned={loaded ? cards.filter((m) => getOwnership(m.key)).length : undefined}
                />
                {cards.map((m) => (
                  <PIdolItem
                    key={m.key}
                    master={m}
                    ownership={loaded ? getOwnership(m.key) : null}
                    onChange={(patch) => setOwnership(m.key, patch)}
                    onUnown={() => setUnowned(m.key)}
                  />
                ))}
              </Fragment>
            );
          })}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
          条件に合うPアイドルがいません。フィルターを変更してください。
        </p>
      )}
    </div>
  );
}

/** Pアイドル1枚分（画像＋特訓・開花ボタン） */
function PIdolItem({
  master,
  ownership,
  onChange,
  onUnown,
}: {
  master: PIdolMaster;
  ownership: { kunren: number; kaika: number } | null;
  onChange: (patch: Partial<{ kunren: number; kaika: number }>) => void;
  onUnown: () => void;
}) {
  const url = imageUrl(master.url);
  const owned = ownership !== null;
  const btn = (active: boolean) =>
    `h-6 w-6 rounded text-[11px] font-bold transition ${
      active
        ? "bg-blue-500 text-white"
        : "bg-slate-100 text-slate-400 hover:bg-blue-100 hover:text-blue-600"
    }`;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-1.5">
      <div
        className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-slate-100 ring-1 ring-black/5"
        title={`${master.cardName}（${master.idol}／${master.rarity}／${master.plan}）${master.skillName ? `\n固有スキル: ${master.skillName}` : ""}`}
      >
        {url ? (
          <img
            src={url}
            alt={master.cardName}
            loading="lazy"
            className={`h-full w-full object-cover ${owned ? "" : "grayscale opacity-60"}`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-0.5 text-center text-[8px] leading-tight text-slate-500">
            {master.cardName}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-[11px] leading-tight text-slate-600"
          title={`${master.cardName}（${master.idol}）`}
        >
          {master.cardName}
        </p>
        {/* 特訓段階 */}
        <div className="mt-0.5 flex items-center gap-0.5">
          <span className="w-7 shrink-0 text-[9px] font-semibold text-slate-400">
            特訓
          </span>
          <button
            type="button"
            onClick={onUnown}
            title="未所持にする"
            className={`h-6 rounded px-1 text-[11px] font-semibold transition ${
              !owned
                ? "bg-slate-600 text-white"
                : "bg-slate-100 text-slate-400 hover:bg-slate-200"
            }`}
          >
            未
          </button>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange({ kunren: n })}
              className={btn(owned && ownership.kunren === n)}
            >
              {n}
            </button>
          ))}
        </div>
        {/* 才能開花 */}
        <div
          className={`mt-0.5 flex items-center gap-0.5 ${owned ? "" : "pointer-events-none opacity-40"}`}
        >
          <span className="w-7 shrink-0 text-[9px] font-semibold text-slate-400">
            開花
          </span>
          {[0, 1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange({ kaika: n })}
              className={btn(owned && ownership.kaika === n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
