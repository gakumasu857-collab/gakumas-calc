import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SUPPORT_CARD_DB } from "@/data/supportCardsDb";
import { SUPPORT_CATALOG } from "@/data/supportCardCatalog";
import {
  AcquireToggle,
  PostEventButtons,
  PreAssign,
  StatEventToggle,
} from "@/components/EventControls";
import NumberField from "@/components/NumberField";
import { matchesCardQuery } from "@/lib/cardSearch";
import { imageUrl } from "@/lib/config";
import { itemCorrectionAuto } from "@/lib/sheetScore";
import {
  buildSheetScoreContext,
  manualCountFromSet,
  TYPE_SHEET_ROLE,
} from "@/lib/sheetContext";
import {
  preEventAutoActivations,
  preEventMax,
  preEventMaxLabel,
  preEventStatRelevant,
  sheetScore,
  type SheetScoreContext,
} from "@/lib/sheetScore";
import { useAbilityCounts } from "@/lib/useAbilityCounts";
import { useCardFlags } from "@/lib/useCardFlags";
import { useEventCounts } from "@/lib/useEventCounts";
import { useOwnedLevels } from "@/lib/useOwnedLevels";
import { useSchedule } from "@/lib/useSchedule";
import { type TypeKey } from "@/lib/useCalcSettings";

const IMAGE_BY_ID = new Map(SUPPORT_CATALOG.map((c) => [c.id, c.image]));
const TYPE_OF_CARD: Record<string, TypeKey> = {
  Vocal: "vocal",
  Dance: "dance",
  Visual: "visual",
};
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

/**
 * サポカ設定ページ。
 * 前イベ・後イベの発動回数（ステータスに影響するカードのみ）と
 * BAN・固定・レンタルNG をここで設定する。点数表・理想編成・計算はこの設定を参照する。
 */
export default function CardSettingsPage() {
  const { getLevel, loaded } = useOwnedLevels();
  const ability = useAbilityCounts();
  const schedule = useSchedule();
  const flags = useCardFlags();
  const events = useEventCounts();

  const [rarityFilter, setRarityFilter] = useState("すべて");
  const [typeFilter, setTypeFilter] = useState("すべて");
  const [planFilter, setPlanFilter] = useState("すべて");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [nameQuery, setNameQuery] = useState("");

  const selectedSet = ability.sets.find((s) => s.id === ability.selectedSetId);
  // カードは自タイプの踏み回数を参照（固定対応）
  const typeRole = TYPE_SHEET_ROLE;
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

  // 計算ページのサポカ選択と同じ「点数の高い順」で並べる（所持凸、未所持は完凸想定）
  const scoreOf = useMemo(() => {
    const map = new Map<string, number>();
    for (const card of SUPPORT_CARD_DB) {
      const type = TYPE_OF_CARD[card.cardType];
      const role =
        type != null
          ? typeRole[type]
          : card.cardType === "アシスト"
            ? ("main1" as const)
            : undefined;
      if (!role) {
        map.set(card.id, -Infinity);
        continue;
      }
      const owned = getLevel(card.id);
      const score = sheetScore(card, owned >= 0 ? owned : 4, role, ctx);
      const item = itemCorrectionAuto(card, role, ctx)?.points ?? 0;
      map.set(card.id, score === null ? -Infinity : score + item);
    }
    return map;
  }, [typeRole, ctx, getLevel]);

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
        if (ownedOnly && loaded && getLevel(card.id) < 0) return false;
        if (nameQuery.trim() && !matchesCardQuery(card.name, nameQuery))
          return false;
        if (
          flaggedOnly &&
          !flags.banned.has(card.id) &&
          !flags.pinned.has(card.id) &&
          !flags.rentalNg.has(card.id) &&
          !events.get(card.id)
        )
          return false;
        return true;
      }).sort(
        (a, b) =>
          (scoreOf.get(b.id) ?? -Infinity) - (scoreOf.get(a.id) ?? -Infinity),
      ),
    [
      rarityFilter,
      typeFilter,
      planFilter,
      ownedOnly,
      flaggedOnly,
      nameQuery,
      loaded,
      getLevel,
      flags,
      events,
      scoreOf,
    ],
  );

  const th =
    "whitespace-nowrap border-b-2 border-r border-slate-400 bg-slate-100 px-2 py-2 font-bold text-slate-700";
  // レアリティ等の脇役列は内容幅まで縮める（メインは後イベ・割り振り側）
  const thNarrow = `${th} w-1`;
  const td =
    "border-b border-r border-slate-300 border-r-slate-200 px-1.5 py-1 text-center";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
        <input
          type="search"
          value={nameQuery}
          onChange={(e) => setNameQuery(e.target.value)}
          placeholder="名前で検索（ひらがなOK）"
          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
        />
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
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={flaggedOnly}
            onChange={(e) => setFlaggedOnly(e.target.checked)}
            className="accent-blue-600"
          />
          設定ありのみ
        </label>
        <span className="ml-auto text-xs text-slate-400">{visible.length}枚</span>
      </div>

      <div className="overflow-x-auto">
        {/* 名前とイラストは左に固定（スクロールしても動かない）。線も固定列側に持たせる */}
        {/* w-full を付けると余った幅が後イベ列に寄って不格好なので content 幅にする */}
        <table className="min-w-max border-separate border-spacing-0 border-2 border-l-0 border-slate-500 text-sm tabular-nums">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-44 min-w-44 max-w-44 border-b-2 border-l-2 border-r border-slate-400 border-l-slate-500 bg-slate-100 px-2 py-2 text-left font-bold text-slate-800">
                サポートカード
              </th>
              <th className="sticky left-44 z-10 border-b-2 border-r-2 border-slate-400 bg-slate-100 px-2 py-2 font-bold text-slate-700">
                イラスト
              </th>
              <th
                className={thNarrow}
                title="ステイベ（パラメータイベント）が発動したか。前イベ・後イベ同様ランダム発動で、1育成に1回だけ起こります"
              >
                ステイベ
              </th>
              <th
                className={thNarrow}
                title="前イベで得られるPアイテム/スキルカード。取得しない場合は前イベ発動0回扱い"
              >
                前イベ
              </th>
              <th
                className={thNarrow}
                title="前イベの発動回数。スキルは取得した時点で1回に確定します"
              >
                回数
              </th>
              <th
                className={thNarrow}
                title="前イベの強化・削除の割り振り。Mの枚数を決めると残りは自動でA"
              >
                割り振り
              </th>
              <th className={th} title="後イベの発動内容">
                後イベ
              </th>
              {/* 3列とも同じ幅（w-20固定・1行表示） */}
              <th
                className="w-20 whitespace-nowrap border-b-2 border-r border-slate-400 bg-red-100 px-1 py-2 text-center text-sm font-bold text-red-800"
                title="チェックしたカードは理想編成から除外されます"
              >
                BAN
              </th>
              <th
                className="w-20 whitespace-nowrap border-b-2 border-r border-slate-400 bg-blue-100 px-1 py-2 text-center text-sm font-bold text-blue-800"
                title="チェックしたカードは必ず編成に入ります（未所持ならレンタル枠を使います）"
              >
                固定
              </th>
              <th
                className="w-20 whitespace-nowrap border-b-2 border-r border-slate-400 bg-violet-100 px-1 py-2 text-center text-sm font-bold text-violet-800"
                title="チェックしたカードはレンタル枠の候補から除外されます"
              >
                レンタルNG
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((card) => {
              const url = imageUrl(IMAGE_BY_ID.get(card.id) ?? card.imageUrl);
              const type = TYPE_OF_CARD[card.cardType];
              const role = type ? typeRole[type] : undefined;
              const preRelevant = preEventStatRelevant(card);
              const preAuto = role
                ? preEventAutoActivations(card, role, ctx)
                : 0;
              const override = events.get(card.id);
              const acquired = override?.acquire ?? true;
              // 取得しない指定なら発動0回扱い
              const preCount = acquired ? (override?.pre ?? preAuto) : 0;
              return (
                <tr key={card.id} className="bg-white">
                  <td
                    className="sticky left-0 z-10 w-44 min-w-44 max-w-44 truncate border-b border-l-2 border-r border-b-slate-300 border-l-slate-500 border-r-slate-200 bg-white px-2 py-1 font-medium text-slate-900"
                    title={card.name}
                  >
                    {card.name}
                  </td>
                  {/* 画像はカード全体が見える横幅（h-9 w-20・角丸） */}
                  <td className="sticky left-44 z-10 border-b border-r-2 border-b-slate-300 border-r-slate-400 bg-white p-0.5">
                    {url ? (
                      <img
                        src={url}
                        alt={card.name}
                        loading="lazy"
                        className="mx-auto h-9 w-20 rounded object-cover"
                      />
                    ) : (
                      <div className="h-9 w-20" />
                    )}
                  </td>
                  {/* ステイベ（パラメータイベント）の発動有無 */}
                  <td className={td}>
                    <StatEventToggle
                      card={card}
                      override={override}
                      events={events}
                    />
                  </td>
                  {/* 前イベ（獲得アイテム/スキルの画像＋取得トグル） */}
                  <td className={td}>
                    <AcquireToggle
                      card={card}
                      override={override}
                      events={events}
                      imgClass="h-10 w-10"
                    />
                  </td>
                  {/* 前イベ回数。スキルは取得した時点で1回確定なので固定表示 */}
                  <td className={td}>
                    {!preRelevant ? (
                      <span className="text-slate-300">—</span>
                    ) : card.preEventType === "スキル" ? (
                      // スキルは取得した時点で1回確定なので表示しない
                      <span className="text-slate-300">—</span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <NumberField
                          value={preCount}
                          onChange={(v) =>
                            events.set(
                              card.id,
                              "pre",
                              v === preAuto ? null : v,
                            )
                          }
                          max={preEventMax(card)}
                          disabled={acquired === false}
                          className="w-14"
                        />
                        <span className="text-slate-400">
                          /{preEventMaxLabel(card)}
                        </span>
                      </span>
                    )}
                  </td>
                  {/* 前イベの強化・削除の割り振り（M枚数→残りA） */}
                  <td className={td}>
                    <PreAssign
                      card={card}
                      override={override}
                      events={events}
                      preCount={preCount}
                    />
                  </td>
                  {/* 後イベ（回数＋強化はM/Aの割り振り） */}
                  <td className={td}>
                    <PostEventButtons
                      card={card}
                      override={override}
                      events={events}
                    />
                  </td>
                  {/* BAN=赤 / 固定=青 / レンタルNG=紫。チェックすると背景が濃くなる */}
                  <FlagCell
                    active={flags.banned.has(card.id)}
                    onCls="bg-red-300 hover:bg-red-200"
                    offCls="bg-red-50 hover:bg-red-100"
                    accent="accent-red-600"
                    onToggle={() => flags.toggle(card.id, "ban")}
                  />
                  <FlagCell
                    active={flags.pinned.has(card.id)}
                    onCls="bg-blue-300 hover:bg-blue-200"
                    offCls="bg-blue-50 hover:bg-blue-100"
                    accent="accent-blue-600"
                    onToggle={() => flags.toggle(card.id, "pin")}
                  />
                  <FlagCell
                    active={flags.rentalNg.has(card.id)}
                    onCls="bg-violet-300 hover:bg-violet-200"
                    offCls="bg-violet-50 hover:bg-violet-100"
                    accent="accent-violet-600"
                    onToggle={() => flags.toggle(card.id, "rentalNg")}
                  />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] text-slate-400">
        ※ ここの設定は
        <Link to="/card-scores" className="text-blue-600 underline">
          点数表
        </Link>
        ・理想編成・計算ページに反映されます。前イベ回数は自動値（min(参照回数,
        最大発動回数)）を表示していて、変更すると固定・自動値と同じに戻すと再び自動追従します。強化/削除のA/Mは自動で判定済み（カード自身の〇強化アビ→そのスキル、無ければ共通・ロジック=M／センス・アノマリー=A。トラブル削除は例外で汎用スキル削除だけ+1）。
      </p>
    </div>
  );
}

/**
 * BAN/固定/レンタルNGのセル。チェックボックス表示で、ONにすると背景が濃くなる。
 * セルのどこをクリックしても切り替わる。
 */
function FlagCell({
  active,
  onCls,
  offCls,
  accent,
  onToggle,
}: {
  active: boolean;
  onCls: string;
  offCls: string;
  accent: string;
  onToggle: () => void;
}) {
  return (
    <td
      className={`border-b border-r border-b-slate-300 border-r-slate-200 p-0 text-center transition ${
        active ? onCls : offCls
      }`}
    >
      <label className="flex h-full w-full cursor-pointer items-center justify-center px-2 py-2">
        <input
          type="checkbox"
          checked={active}
          onChange={onToggle}
          className={`h-5 w-5 cursor-pointer ${accent}`}
        />
      </label>
    </td>
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
