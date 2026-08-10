import { useMemo, useState } from "react";
import { P_IDOL_MASTERS, type PIdolMaster } from "@/lib/pIdol";
import { imageUrl } from "@/lib/config";
import { useOwnedPIdols } from "@/lib/useOwnedPIdols";
import CsvTransfer from "./CsvTransfer";

const IDOLS = [...new Set(P_IDOL_MASTERS.map((m) => m.idol))];

/** 一括入力の特訓段階: keep=変更しない / unown=未所持 / 0〜7 */
type BulkKunren = "keep" | "unown" | number;
type BulkKaika = "keep" | number;

/**
 * Pアイドル所持入力（コンパクト版）。
 * 画像＋特訓段階・才能開花のボタンで1セット。
 * レアリティ・プラン・おすすめ効果・計算後ステはデータベースページで見られる。
 */
export default function PIdolOwnership() {
  const {
    getOwnership,
    setOwnership,
    setUnowned,
    setManyOwnership,
    setManyUnowned,
    applyOwnership,
    loaded,
  } = useOwnedPIdols();
  const [idolFilter, setIdolFilter] = useState("すべて");

  /** 現在の所持状況をCSVにする（このまま編集して読み込める） */
  const buildCsv = () =>
    ["アイドル,Pアイドル名,特訓,開花"]
      .concat(
        P_IDOL_MASTERS.map((m) => {
          const o = getOwnership(m.key);
          return `"${m.idol}","${m.cardName}",${o ? o.kunren : -1},${o ? o.kaika : 0}`;
        }),
      )
      .join("\r\n");

  /** CSVを読み込んで所持状況に反映（特訓-1または「未」=未所持） */
  const importCsv = (text: string) => {
    const unq = (s: string) => s.trim().replace(/^"|"$/g, "").trim();
    const entries: { key: string; kunren: number; kaika: number }[] = [];
    const unmatched: string[] = [];
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const cols = line.split(",");
      if (cols.length < 4) continue;
      // 名前にカンマが入っても大丈夫なように、後ろ2列と先頭列を先に取る
      const kaikaStr = unq(cols.pop()!);
      const kunrenStr = unq(cols.pop()!);
      const idol = unq(cols.shift()!);
      const name = unq(cols.join(","));
      if (kunrenStr === "特訓" || !name) continue; // ヘッダー行
      const kunren =
        kunrenStr === "未" || kunrenStr === "未所持"
          ? -1
          : Number.parseInt(kunrenStr, 10);
      const kaika = Number.parseInt(kaikaStr, 10) || 0;
      if (Number.isNaN(kunren)) {
        unmatched.push(name);
        continue;
      }
      const master =
        P_IDOL_MASTERS.find(
          (m) => m.idol === idol && m.cardName === name,
        ) ?? P_IDOL_MASTERS.find((m) => m.cardName === name);
      if (!master) {
        unmatched.push(name);
        continue;
      }
      entries.push({ key: master.key, kunren, kaika });
    }
    applyOwnership(entries);
    return { applied: entries.length, unmatched };
  };
  const [rarityFilter, setRarityFilter] = useState("すべて");
  const [planFilter, setPlanFilter] = useState("すべて");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [bulkKunren, setBulkKunren] = useState<BulkKunren>("keep");
  const [bulkKaika, setBulkKaika] = useState<BulkKaika>("keep");

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
    <div className="flex flex-col gap-3">
      {/* フィルター */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
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
        <span className="ml-auto text-slate-400">{visible.length}枚</span>
      </div>

      {/* 一括入力（表示中のカードにまとめて適用） */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs">
        <span className="font-bold text-slate-700">一括入力</span>
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
        <button
          type="button"
          disabled={
            visible.length === 0 ||
            (bulkKunren === "keep" && bulkKaika === "keep")
          }
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
          className="rounded-lg bg-blue-600 px-3 py-1.5 font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          表示中の{visible.length}枚に適用
        </button>
      </div>

      {/* CSVで一括入出力 */}
      <CsvTransfer
        formatNote="アイドル,Pアイドル名,特訓,開花（特訓-1または未=未所持。まず書き出して編集するのが確実）"
        exportName="Pアイドル所持状況.csv"
        buildCsv={buildCsv}
        onImport={importCsv}
      />

      <p className="-mt-1 text-xs text-slate-500">
        特訓の「未」で未所持に。レアリティ・プラン・計算後のステータスは
        データベースページで確認できます。
      </p>

      {/* 一覧 */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((m) => (
          <PIdolItem
            key={m.key}
            master={m}
            ownership={loaded ? getOwnership(m.key) : null}
            onChange={(patch) => setOwnership(m.key, patch)}
            onUnown={() => setUnowned(m.key)}
          />
        ))}
      </div>
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
        ? "bg-blue-600 text-white shadow-sm"
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
              className={btn(owned && ownership.kunren >= n)}
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
              className={btn(owned && ownership.kaika >= n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 一括入力用のセグメントボタン */
function Segmented<T extends string | number>({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 ${disabled ? "pointer-events-none opacity-40" : ""}`}
    >
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
