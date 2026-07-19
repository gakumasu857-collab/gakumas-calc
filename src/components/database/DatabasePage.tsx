import { useMemo, useState } from "react";
import { ABILITY_NAMES } from "@/data/constants";
import { SUPPORT_CARD_DB, type SupportCardData } from "@/data/supportCardsDb";
import { SUPPORT_CATALOG } from "@/data/supportCardCatalog";
import { imageUrl } from "@/lib/config";
import {
  computePIdolStats,
  P_IDOL_MASTERS,
  type PIdolMaster,
} from "@/lib/pIdol";
import { useOwnedPIdols } from "@/lib/useOwnedPIdols";

const IMAGE_BY_ID = new Map(SUPPORT_CATALOG.map((c) => [c.id, c.image]));
const IDOLS = [...new Set(P_IDOL_MASTERS.map((m) => m.idol))];

const TYPE_CHIP: Record<string, string> = {
  Vocal: "bg-red-100 text-red-700",
  Dance: "bg-blue-100 text-blue-700",
  Visual: "bg-yellow-100 text-yellow-700",
  アシスト: "bg-slate-200 text-slate-600",
};
const PLAN_CHIP: Record<string, string> = {
  共通: "bg-slate-100 text-slate-600",
  センス: "bg-rose-100 text-rose-700",
  ロジック: "bg-emerald-100 text-emerald-700",
  アノマリー: "bg-violet-100 text-violet-700",
  フリー: "bg-slate-100 text-slate-600",
};

const TABLE =
  "min-w-max border-separate border-spacing-0 border-2 border-l-0 border-slate-500 text-[13px] tabular-nums";
const TH =
  "whitespace-nowrap border-b-2 border-r border-slate-400 bg-slate-100 px-2 py-2 font-bold text-slate-700";
const TH_STICKY =
  "sticky left-0 z-10 border-b-2 border-l-2 border-r-2 border-slate-400 border-l-slate-500 bg-slate-100 px-2 py-2 text-left font-bold text-slate-800";
const TD = "border-b border-r border-slate-200 px-1.5 py-1 text-center";
const TD_STICKY =
  "sticky left-0 z-10 max-w-52 truncate border-b border-l-2 border-r-2 border-b-slate-200 border-l-slate-500 border-r-slate-400 bg-white px-2 py-1 text-left text-slate-700";

/** サポカ・Pアイドルの情報閲覧ページ（切り替え式） */
export default function DatabasePage() {
  const [tab, setTab] = useState<"support" | "pidol">("support");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex self-start overflow-hidden rounded-xl border border-slate-300">
        {(
          [
            ["support", "サポートカード"],
            ["pidol", "Pアイドル"],
          ] as const
        ).map(([key, label], i) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-5 py-2 text-sm font-bold transition ${i > 0 ? "border-l border-slate-300" : ""} ${
              tab === key
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "support" ? <SupportInfoTable /> : <PIdolInfoTable />}
    </div>
  );
}

/** サポカのアビリティ名（表示用ラベル） */
function abilityLabel(card: SupportCardData, index: number): string {
  const slot = card.abilities[index];
  if (!slot) return "—";
  return "key" in slot ? ABILITY_NAMES[slot.key] : slot.raw;
}

function SupportInfoTable() {
  const [rarityFilter, setRarityFilter] = useState("すべて");
  const [typeFilter, setTypeFilter] = useState("すべて");
  const [planFilter, setPlanFilter] = useState("すべて");

  const visible = useMemo(
    () =>
      SUPPORT_CARD_DB.filter((card) => {
        const rarityLabel =
          card.rarity === "EventSSR" ? "配布SSR" : card.rarity;
        if (rarityFilter !== "すべて" && rarityLabel !== rarityFilter)
          return false;
        if (typeFilter !== "すべて" && card.cardType !== typeFilter)
          return false;
        if (planFilter !== "すべて" && card.plan !== planFilter) return false;
        return true;
      }),
    [rarityFilter, typeFilter, planFilter],
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
        <FilterSelect
          label="レアリティ"
          options={["R", "SR", "SSR", "配布SSR"]}
          value={rarityFilter}
          onChange={setRarityFilter}
        />
        <FilterSelect
          label="タイプ"
          options={["Vocal", "Dance", "Visual", "アシスト"]}
          value={typeFilter}
          onChange={setTypeFilter}
        />
        <FilterSelect
          label="使用制限"
          options={["共通", "センス", "ロジック", "アノマリー"]}
          value={planFilter}
          onChange={setPlanFilter}
        />
        <span className="ml-auto text-xs text-slate-400">{visible.length}枚</span>
      </div>

      <div className="overflow-x-auto">
        <table className={TABLE}>
          <thead>
            <tr>
              <th className={TH_STICKY}>サポートカード</th>
              <th className={TH}>イラスト</th>
              <th className={TH}>レアリティ</th>
              <th className={TH}>タイプ</th>
              <th className={TH}>使用制限</th>
              <th className={TH}>役割</th>
              <th className={TH}>属性結合</th>
              <th className={TH}>前イベ</th>
              <th className={TH}>後イベ</th>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <th key={n} className={TH}>
                  アビリティ{n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((card) => {
              const url = imageUrl(IMAGE_BY_ID.get(card.id) ?? card.imageUrl);
              return (
                <tr key={card.id} className="bg-white">
                  <td className={TD_STICKY} title={card.name}>
                    {card.name}
                  </td>
                  <td className="border-b border-r border-slate-200 p-0.5">
                    {url ? (
                      <img
                        src={url}
                        alt={card.name}
                        loading="lazy"
                        className="mx-auto h-8 w-16 rounded object-cover"
                      />
                    ) : (
                      <div className="h-8 w-16" />
                    )}
                  </td>
                  <td className={`${TD} text-slate-600`}>
                    {card.rarity === "EventSSR" ? "配布SSR" : card.rarity}
                  </td>
                  <td className={TD}>
                    <span
                      className={`rounded px-1.5 py-0.5 font-semibold ${TYPE_CHIP[card.cardType] ?? "bg-slate-100 text-slate-500"}`}
                    >
                      {card.cardType}
                    </span>
                  </td>
                  <td className={TD}>
                    <span
                      className={`rounded px-1.5 py-0.5 font-semibold ${PLAN_CHIP[card.plan] ?? "bg-slate-100 text-slate-500"}`}
                    >
                      {card.plan || "—"}
                    </span>
                  </td>
                  <td className={`${TD} text-slate-600`}>
                    {card.extras["枠"] ?? "—"}
                  </td>
                  <td
                    className={`${TD} max-w-44 truncate text-left text-slate-500`}
                    title={card.extras["属性"]}
                  >
                    {card.extras["属性"] ?? "—"}
                  </td>
                  <td className={`${TD} text-slate-600`}>{card.preEventType}</td>
                  <td className={`${TD} text-slate-600`}>{card.postEventType}</td>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <td
                      key={i}
                      className={`${TD} whitespace-nowrap text-left text-slate-600`}
                    >
                      {abilityLabel(card, i)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PIdolInfoTable() {
  const { getOwnership, loaded } = useOwnedPIdols();
  const [idolFilter, setIdolFilter] = useState("すべて");
  const [rarityFilter, setRarityFilter] = useState("すべて");
  const [planFilter, setPlanFilter] = useState("すべて");
  const [ownedOnly, setOwnedOnly] = useState(false);

  const visible = useMemo(
    () =>
      P_IDOL_MASTERS.filter((m) => {
        if (idolFilter !== "すべて" && m.idol !== idolFilter) return false;
        if (rarityFilter !== "すべて" && m.rarity !== rarityFilter)
          return false;
        if (planFilter !== "すべて" && m.plan !== planFilter) return false;
        if (ownedOnly && loaded && !getOwnership(m.key)) return false;
        return true;
      }),
    [idolFilter, rarityFilter, planFilter, ownedOnly, getOwnership, loaded],
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
        <FilterSelect
          label="アイドル"
          options={IDOLS}
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
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={ownedOnly}
            onChange={(e) => setOwnedOnly(e.target.checked)}
            className="accent-blue-600"
          />
          所持のみ
        </label>
        <span className="ml-auto text-xs text-slate-400">{visible.length}枚</span>
      </div>

      <div className="overflow-x-auto">
        <table className={TABLE}>
          <thead>
            <tr>
              <th className={TH_STICKY}>Pアイドル</th>
              {[
                "イラスト",
                "アイドル",
                "レアリティ",
                "プラン",
                "おすすめ効果",
                "特訓",
                "開花",
                "体力",
                "Vo",
                "Da",
                "Vi",
                "Vo%",
                "Da%",
                "Vi%",
              ].map((h) => (
                <th key={h} className={TH}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((m) => (
              <PIdolInfoRow
                key={m.key}
                master={m}
                ownership={loaded ? getOwnership(m.key) : null}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        ※ ステータスは所持状況入力の特訓段階・才能開花での計算値（スプシ準拠・検算一致済み）。未所持は「—」。特訓・開花の変更は所持状況入力ページで。
      </p>
    </div>
  );
}

function PIdolInfoRow({
  master,
  ownership,
}: {
  master: PIdolMaster;
  ownership: { kunren: number; kaika: number } | null;
}) {
  const url = imageUrl(master.url);
  const stats = ownership
    ? computePIdolStats(master.growthTag, ownership.kunren, ownership.kaika)
    : null;
  return (
    <tr className="bg-white">
      <td className={TD_STICKY} title={master.cardName}>
        {master.cardName}
      </td>
      <td className="border-b border-r border-slate-200 p-0.5">
        {url ? (
          <img
            src={url}
            alt={master.cardName}
            loading="lazy"
            className={`mx-auto h-8 w-8 rounded object-cover ${ownership ? "" : "grayscale opacity-60"}`}
          />
        ) : (
          <div className="h-8 w-8" />
        )}
      </td>
      <td className={`${TD} whitespace-nowrap text-slate-600`}>{master.idol}</td>
      <td className={`${TD} text-slate-600`}>{master.rarity}</td>
      <td className={TD}>
        <span
          className={`rounded px-1.5 py-0.5 font-semibold ${PLAN_CHIP[master.plan] ?? "bg-slate-100 text-slate-500"}`}
        >
          {master.plan}
        </span>
      </td>
      <td className={`${TD} text-slate-600`}>{master.effect}</td>
      <td className={`${TD} font-semibold text-slate-700`}>
        {ownership ? ownership.kunren : "—"}
      </td>
      <td className={`${TD} font-semibold text-slate-700`}>
        {ownership ? ownership.kaika : "—"}
      </td>
      {stats ? (
        <>
          <td className={`${TD} text-slate-700`}>{stats.hp}</td>
          <td className={`${TD} font-semibold text-red-600`}>
            {stats.fixed.vocal}
          </td>
          <td className={`${TD} font-semibold text-blue-600`}>
            {stats.fixed.dance}
          </td>
          <td className={`${TD} font-semibold text-yellow-600`}>
            {stats.fixed.visual}
          </td>
          <td className={`${TD} text-red-500`}>{stats.parabo.vocal}%</td>
          <td className={`${TD} text-blue-500`}>{stats.parabo.dance}%</td>
          <td className={`${TD} text-yellow-600`}>{stats.parabo.visual}%</td>
        </>
      ) : (
        Array.from({ length: 7 }).map((_, i) => (
          <td key={i} className={`${TD} text-slate-300`}>
            —
          </td>
        ))
      )}
    </tr>
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
