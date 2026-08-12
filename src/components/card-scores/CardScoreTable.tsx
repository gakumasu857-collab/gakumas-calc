import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp } from "lucide-react";
import ScoreDetailModal from "@/components/ScoreDetailModal";
import { SUPPORT_CARD_DB } from "@/data/supportCardsDb";
import { SUPPORT_CATALOG } from "@/data/supportCardCatalog";
import { imageUrl } from "@/lib/config";
import {
  buildSheetScoreContext,
  manualCountFromSet,
  TYPE_SHEET_ROLE,
} from "@/lib/sheetContext";
import {
  itemCorrectionAuto,
  sheetScore,
  type SheetRole,
  type SheetScoreContext,
} from "@/lib/sheetScore";
import { useAbilityCounts } from "@/lib/useAbilityCounts";
import { useEventCounts } from "@/lib/useEventCounts";
import { useOwnedLevels } from "@/lib/useOwnedLevels";
import { useSchedule } from "@/lib/useSchedule";
import { type TypeKey } from "@/lib/useCalcSettings";

/** ソート状態の保存先（並べ替えはページを離れても維持する） */
const SORT_STORAGE_KEY = "gakumas:cardScoreSort:v1";

const IMAGE_BY_ID = new Map(SUPPORT_CATALOG.map((c) => [c.id, c.image]));
const CARD_BY_ID = new Map(SUPPORT_CARD_DB.map((c) => [c.id, c]));

/** カードタイプ → 計算上のタイプキー */
const TYPE_OF_CARD: Record<string, TypeKey> = {
  Vocal: "vocal",
  Dance: "dance",
  Visual: "visual",
};

/** タイプ・プランの色分けチップ */
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
};

type Row = {
  id: string;
  name: string;
  image: string;
  rarityLabel: string;
  cardType: string;
  plan: string;
  /** このカードの点数計算に使うロール（タイプ→踏み方から自動） */
  role: SheetRole | undefined;
  roleSlot: string;
  scores: (number | null)[];
  itemBonus: number;
  maxStat: number | null;
  ownedLevel: number;
  ownedStat: number | null;
};

type SortKey = "c0" | "c1" | "c2" | "c3" | "c4" | "max" | "owned";

/**
 * サポカ点数表。スプシ検証済みエンジン（sheetScore）で点数を表示する。
 * ロールは計算ページ「レッスンの踏み方」のタイプ⇔ロール対応から自動で決まる。
 * 前イベ・後イベの発動回数もこの表で設定する（ステータスに影響するカードのみ）。
 */
export default function CardScoreTable() {
  const { getLevel, loaded } = useOwnedLevels();
  const ability = useAbilityCounts();
  const schedule = useSchedule();
  const events = useEventCounts();

  const [rarityFilter, setRarityFilter] = useState("すべて");
  const [typeFilter, setTypeFilter] = useState("すべて");
  const [planFilter, setPlanFilter] = useState("すべて");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean } | null>(
    null,
  );
  const [sortLoaded, setSortLoaded] = useState(false);

  // 並べ替えを保存・復元
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SORT_STORAGE_KEY);
      if (raw) setSort(JSON.parse(raw) as { key: SortKey; desc: boolean });
    } catch {
      // 破損データは無視
    }
    setSortLoaded(true);
  }, []);
  useEffect(() => {
    if (!sortLoaded) return;
    try {
      if (sort) localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sort));
      else localStorage.removeItem(SORT_STORAGE_KEY);
    } catch {
      // 容量超過などは無視
    }
  }, [sort, sortLoaded]);
  /** 点数セルをクリックしたときの内訳表示対象 */
  const [detail, setDetail] = useState<{
    id: string;
    level: number;
    role: SheetRole;
  } | null>(null);

  const selectedSet = ability.sets.find((s) => s.id === ability.selectedSetId);

  // カードは自タイプの踏み回数を参照（固定対応）
  const typeRole = TYPE_SHEET_ROLE;

  // スプシ準拠の計算コンテキスト（発動回数＋パラボ母数＋イベント回数設定）
  const ctx: SheetScoreContext = useMemo(
    () =>
      buildSheetScoreContext(
        schedule,
        manualCountFromSet(
          selectedSet ? (key) => ability.getCount(selectedSet, key) : null,
        ),
        events.get,
      ),
    [ability, selectedSet, schedule, events.get],
  );

  const rows: Row[] = useMemo(() => {
    return SUPPORT_CARD_DB.map((card) => {
      const type = TYPE_OF_CARD[card.cardType];
      const role = type ? typeRole[type] : undefined;
      const scores = role
        ? [0, 1, 2, 3, 4].map((level) => sheetScore(card, level, role, ctx))
        : [null, null, null, null, null];
      // アイテム補正はパラメ系Pアイテム（回数はイベント回数設定 or 自動）
      const itemBonus = role
        ? (itemCorrectionAuto(card, role, ctx)?.points ?? 0)
        : 0;
      const maxStat = scores[4] === null ? null : scores[4] + itemBonus;
      const ownedLevel = loaded ? getLevel(card.id) : -1;
      const ownedStat =
        ownedLevel >= 0 && scores[ownedLevel] !== null
          ? scores[ownedLevel] + itemBonus
          : null;
      return {
        id: card.id,
        name: card.name,
        image: IMAGE_BY_ID.get(card.id) ?? card.imageUrl,
        rarityLabel: card.rarity === "EventSSR" ? "配布SSR" : card.rarity,
        cardType: card.cardType,
        plan: card.plan,
        role,
        roleSlot: card.extras["枠"] ?? "",
        scores,
        itemBonus,
        maxStat,
        ownedLevel,
        ownedStat,
      };
    });
  }, [ctx, typeRole, getLevel, loaded]);

  const visible = useMemo(() => {
    let list = rows.filter((row) => {
      if (rarityFilter !== "すべて" && row.rarityLabel !== rarityFilter)
        return false;
      if (typeFilter !== "すべて" && row.cardType !== typeFilter) return false;
      if (planFilter !== "すべて" && row.plan !== planFilter) return false;
      if (ownedOnly && row.ownedLevel < 0) return false;
      return true;
    });
    if (sort) {
      const value = (row: Row): number => {
        if (sort.key === "max") return row.maxStat ?? -Infinity;
        if (sort.key === "owned")
          return row.ownedStat ?? (row.ownedLevel >= 0 ? 0 : -Infinity);
        const i = Number(sort.key.slice(1));
        return row.scores[i] ?? -Infinity;
      };
      list = [...list].sort((a, b) =>
        sort.desc ? value(b) - value(a) : value(a) - value(b),
      );
    }
    return list;
  }, [rows, rarityFilter, typeFilter, planFilter, ownedOnly, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev?.key === key
        ? prev.desc
          ? { key, desc: false }
          : null
        : { key, desc: true },
    );
  };

  const detailCard = detail ? CARD_BY_ID.get(detail.id) : undefined;

  return (
    <div>
      {/* フィルター */}
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
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={ownedOnly}
            onChange={(e) => setOwnedOnly(e.target.checked)}
            className="accent-blue-600"
          />
          所持のみ
        </label>
        <span className="ml-auto text-xs text-slate-400">
          {visible.length}枚 / セット:{" "}
          {selectedSet ? (
            <b className="text-blue-600">{selectedSet.name}</b>
          ) : (
            <b className="text-red-500">未選択（回数系0）</b>
          )}
        </span>
      </div>

      <div className="overflow-x-auto">
        {/* border-collapse だと固定列の枠線がスクロールで置いていかれるため border-separate。
            左端の枠線は表ではなく固定列セルに持たせる（スクロールで置いていかれないように） */}
        <table className="w-full min-w-max border-separate border-spacing-0 border-2 border-l-0 border-slate-500 text-sm tabular-nums">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-44 min-w-44 max-w-44 border-b-2 border-l-2 border-r border-slate-400 border-l-slate-500 bg-slate-100 px-2 py-2 text-left font-bold text-slate-800">
                サポートカード
              </th>
              <th className="sticky left-44 z-10 whitespace-nowrap border-b-2 border-r-2 border-slate-400 bg-slate-100 px-2 py-2 font-bold text-slate-700">
                イラスト
              </th>
              <Th>レアリティ</Th>
              <Th title="レッスン系アビリティは自タイプの踏み回数を参照">
                タイプ
              </Th>
              {[0, 1, 2, 3, 4].map((i) => (
                <SortTh
                  key={i}
                  label={`${i}凸`}
                  sortKey={`c${i}` as SortKey}
                  sort={sort}
                  onToggle={toggleSort}
                />
              ))}
              <Th title="パラメ系Pアイテムの上昇量×発動回数（前イベ回数の設定に連動）">
                アイテム補正
              </Th>
              <SortTh label="最大ステ" sortKey="max" sort={sort} onToggle={toggleSort} />
              <Th>使用制限</Th>
              <Th>役割</Th>
              <SortTh label="所持ステ" sortKey="owned" sort={sort} onToggle={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const url = imageUrl(row.image);
              return (
                <tr key={row.id} className="bg-white">
                  <td
                    className="sticky left-0 z-10 w-44 min-w-44 max-w-44 truncate border-b border-l-2 border-r border-b-slate-300 border-l-slate-500 border-r-slate-200 bg-white px-2 py-1 font-medium text-slate-900"
                    title={row.name}
                  >
                    {row.name}
                  </td>
                  {/* 画像はデータベースページと同じ表示（h-8 w-16・角丸） */}
                  <td className="sticky left-44 z-10 border-b border-r-2 border-b-slate-300 border-r-slate-400 bg-white p-0.5">
                    {url ? (
                      <img
                        src={url}
                        alt={row.name}
                        loading="lazy"
                        className="mx-auto h-8 w-16 rounded object-cover"
                      />
                    ) : (
                      <div className="h-8 w-16" />
                    )}
                  </td>
                  <td className="border-b border-r border-b-slate-300 border-r-slate-200 px-1.5 py-1 text-center text-slate-800">
                    {row.rarityLabel}
                  </td>
                  <td className="border-b border-r border-b-slate-300 border-r-slate-200 px-1 py-1 text-center">
                    <span
                      className={`rounded px-1.5 py-0.5 font-semibold ${TYPE_CHIP[row.cardType] ?? "bg-slate-100 text-slate-500"}`}
                      title={
                        row.role
                          ? "自タイプの踏み回数を参照"
                          : "アシスト等（計算不可）"
                      }
                    >
                      {row.cardType}
                    </span>
                  </td>
                  {row.scores.map((score, i) => (
                    <td
                      key={i}
                      className={`border-b border-r border-b-slate-300 border-r-slate-200 p-0 text-center ${
                        row.ownedLevel === i
                          ? "bg-blue-50 font-bold text-blue-700"
                          : "font-semibold text-slate-900"
                      }`}
                    >
                      {score === null || !row.role ? (
                        <span className="px-1.5 py-1">—</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setDetail({ id: row.id, level: i, role: row.role! })
                          }
                          title="クリックで計算の内訳を表示"
                          className="w-full px-1.5 py-1 tabular-nums underline decoration-slate-300 decoration-dotted underline-offset-2 hover:bg-blue-100 hover:text-blue-700"
                        >
                          {Math.round(score)}
                        </button>
                      )}
                    </td>
                  ))}
                  <td
                    className={`border-b border-r border-b-slate-300 border-r-slate-200 px-1.5 py-1 text-center ${row.itemBonus > 0 ? "font-medium text-slate-900" : "text-slate-300"}`}
                  >
                    {row.itemBonus}
                  </td>
                  <td className="border-b border-r border-b-slate-300 border-r-slate-200 px-1.5 py-1 text-center font-bold text-slate-900">
                    {row.maxStat === null ? "—" : Math.round(row.maxStat)}
                  </td>
                  <td className="border-b border-r border-b-slate-300 border-r-slate-200 px-1 py-1 text-center">
                    <span
                      className={`rounded px-1.5 py-0.5 font-semibold ${PLAN_CHIP[row.plan] ?? "bg-slate-100 text-slate-500"}`}
                    >
                      {row.plan || "—"}
                    </span>
                  </td>
                  <td className="border-b border-r border-b-slate-300 border-r-slate-200 px-1.5 py-1 text-center text-slate-800">
                    {row.roleSlot}
                  </td>
                  <td className="border-b border-r border-b-slate-300 border-r-slate-200 px-1.5 py-1 text-center">
                    {row.ownedStat !== null ? (
                      <span className="font-bold text-blue-700">
                        {Math.round(row.ownedStat)}
                      </span>
                    ) : row.ownedLevel >= 0 ? (
                      // 所持しているが点数計算できない（R・アシスト等ティア表なし）
                      <span
                        className="text-slate-300"
                        title={`所持（${row.ownedLevel}凸）・点数計算対象外`}
                      >
                        —
                      </span>
                    ) : (
                      <span className="text-slate-300">未所持</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] text-slate-400">
        ※
        点数はスプレッドシート準拠のエンジンで計算（全2,670点の検算一致済み）。点数のセルをクリックすると計算の内訳が見られます。レッスン系アビリティは自タイプの踏み回数を参照します。並べ替えは保存されます。前イベ・後イベの回数やBAN・固定・レンタルNGは
        <Link to="/card-settings" className="text-blue-600 underline">
          サポカ設定
        </Link>
        ページで設定でき、この表のアイテム補正・最大ステにも反映されます。アシストはティア表が無いため「—」。
      </p>

      {detail && detailCard && (
        <ScoreDetailModal
          card={detailCard}
          level={detail.level}
          role={detail.role}
          ctx={ctx}
          onClose={() => setDetail(null)}
        />
      )}
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

function Th({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <th
      title={title}
      className="whitespace-nowrap border-b-2 border-r border-slate-400 bg-slate-100 px-2 py-2 font-bold text-slate-700"
    >
      {children}
    </th>
  );
}

function SortTh({
  label,
  sortKey,
  sort,
  onToggle,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; desc: boolean } | null;
  onToggle: (key: SortKey) => void;
}) {
  const active = sort?.key === sortKey;
  return (
    <th className="whitespace-nowrap border-b-2 border-r border-slate-400 bg-slate-100 p-0">
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={`flex w-full items-center justify-center gap-0.5 px-2 py-2 font-bold hover:bg-slate-200 ${
          active ? "text-blue-700" : "text-slate-700"
        }`}
        title="クリックで並べ替え（降順→昇順→解除）"
      >
        {label}
        {active &&
          (sort!.desc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
      </button>
    </th>
  );
}
