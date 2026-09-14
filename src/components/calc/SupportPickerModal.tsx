import { useMemo, useState } from "react";
import { Ban, Pin, UserX } from "lucide-react";
import Modal from "@/components/Modal";
import { ABILITY_NAMES, type AbilityName } from "@/data/constants";
import { SUPPORT_CARD_DB } from "@/data/supportCardsDb";
import { matchesCardQuery } from "@/lib/cardSearch";
import { imageUrl } from "@/lib/config";
import {
  scoreOwnedCards,
  scoreRentalCandidates,
  type CardFlagSets,
  type ScoredCard,
  type SelectedSlot,
} from "@/lib/formation";
import type { FlagKind } from "@/lib/useCardFlags";
import type { SheetRole, SheetScoreContext } from "@/lib/sheetScore";
import {
  TYPE_KEYS,
  TYPE_LABELS,
  type TypeKey,
} from "@/lib/useCalcSettings";

const TYPE_CHIP: Record<TypeKey, string> = {
  vocal: "bg-red-100 text-red-700",
  dance: "bg-blue-100 text-blue-700",
  visual: "bg-yellow-100 text-yellow-700",
};

const EMPTY_SET: ReadonlySet<string> = new Set();

/** 絞り込みに使わない構造的なアビリティ（ほぼ全カードが持つ・無意味なもの） */
const ABILITY_FILTER_EXCLUDE = new Set<AbilityName>([
  "nothing",
  "initial",
  "bonus",
  "param_event_rate",
  "p_point_event_rate",
  "recovery_event_rate",
]);

/** カードID → 持っているアビリティキーの集合（絞り込み用・モジュール初期化時に1回） */
const ABILITY_BY_ID = new Map<string, Set<AbilityName>>();
for (const card of SUPPORT_CARD_DB) {
  const keys = new Set<AbilityName>();
  for (const slot of card.abilities) {
    if (slot && "key" in slot && !ABILITY_FILTER_EXCLUDE.has(slot.key)) {
      keys.add(slot.key);
    }
  }
  ABILITY_BY_ID.set(card.id, keys);
}

/** 絞り込みの選択肢（実在するアビリティのみ・ラベル順） */
const ABILITY_OPTIONS: { key: AbilityName; label: string }[] = (() => {
  const present = new Set<AbilityName>();
  for (const keys of ABILITY_BY_ID.values()) {
    for (const k of keys) present.add(k);
  }
  return [...present]
    .map((key) => ({ key, label: ABILITY_NAMES[key] }))
    .sort((a, b) => a.label.localeCompare(b.label, "ja"));
})();

/**
 * 選択サポカのスロットに入れるカードを選ぶモーダル。
 * 「所持」は所持凸で、「レンタル」は全カードを完凸として点数順に表示する。
 * プラン外のカードは表示しない（共通＋Pアイドルのプランのみ）。
 */
export default function SupportPickerModal({
  slotIndex,
  usedIds,
  ctx,
  typeRole,
  plan,
  rentalNg,
  getLevel,
  setLevel,
  flags,
  onToggleFlag,
  onPick,
  onClose,
}: {
  slotIndex: number;
  /** 他スロットで使用中のカードID（重複選択の禁止） */
  usedIds: ReadonlySet<string>;
  ctx: SheetScoreContext;
  typeRole: Partial<Record<TypeKey, SheetRole>>;
  plan: string | null;
  rentalNg: ReadonlySet<string>;
  getLevel: (id: string) => number;
  /** 所持の凸をその場で変える（省略時は表示のみ） */
  setLevel?: (id: string, level: number) => void;
  /** 固定・BAN・レンタルNG（行の右のボタンで切り替える） */
  flags: CardFlagSets;
  onToggleFlag: (id: string, kind: FlagKind) => void;
  onPick: (entry: SelectedSlot) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"owned" | "rental">("owned");
  const [typeFilter, setTypeFilter] = useState<"すべて" | TypeKey>("すべて");
  const [nameQuery, setNameQuery] = useState("");
  const [abilityFilter, setAbilityFilter] = useState<AbilityName | "">("");

  const list: ScoredCard[] = useMemo(() => {
    const cards =
      mode === "owned"
        ? scoreOwnedCards(getLevel, ctx, typeRole, { plan })
        : scoreRentalCandidates(ctx, typeRole, {
            plan,
            flags: { banned: EMPTY_SET, pinned: EMPTY_SET, rentalNg },
          });
    return cards
      .filter((c) => typeFilter === "すべて" || c.type === typeFilter)
      .filter((c) => matchesCardQuery(c.name, nameQuery))
      .filter(
        (c) => !abilityFilter || ABILITY_BY_ID.get(c.id)?.has(abilityFilter),
      )
      .sort((a, b) => b.points - a.points);
  }, [
    mode,
    typeFilter,
    nameQuery,
    abilityFilter,
    getLevel,
    ctx,
    typeRole,
    plan,
    rentalNg,
  ]);

  return (
    <Modal
      title={`スロット${slotIndex + 1}のサポカを選ぶ`}
      onClose={onClose}
      widthClass="max-w-3xl"
    >
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        {/* 所持 / レンタル切替 */}
        <div className="flex overflow-hidden rounded-lg border border-slate-300">
          {(
            [
              ["owned", "所持カード"],
              ["rental", "レンタル（完凸）"],
            ] as const
          ).map(([m, label], i) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 font-semibold ${i > 0 ? "border-l border-slate-300" : ""} ${
                mode === m
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {/* タイプ絞り込み */}
        <div className="flex items-center gap-1">
          {(["すべて", ...TYPE_KEYS] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`rounded-md px-2 py-1 text-xs font-bold transition ${
                typeFilter === t
                  ? "bg-slate-700 text-white"
                  : t === "すべて"
                    ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    : `${TYPE_CHIP[t]} hover:brightness-95`
              }`}
            >
              {t === "すべて" ? "すべて" : TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        {/* 名前検索 */}
        <input
          type="search"
          value={nameQuery}
          onChange={(e) => setNameQuery(e.target.value)}
          placeholder="名前で検索"
          autoFocus
          className="w-40 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500"
        />
        {/* アビリティ絞り込み */}
        <select
          value={abilityFilter}
          onChange={(e) => setAbilityFilter(e.target.value as AbilityName | "")}
          title="アビリティで絞り込み"
          className="max-w-48 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-600 outline-none focus:border-blue-500"
        >
          <option value="">アビリティ：すべて</option>
          {ABILITY_OPTIONS.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-slate-400">
          {plan && plan !== "フリー"
            ? `プラン制限: 共通＋${plan}のみ表示`
            : "プラン制限なし"}
          ・点数順
        </span>
      </div>

      <p className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
        行の右のボタン:
        <span className="inline-flex items-center gap-0.5"><Pin size={11} />固定＝必ず編成に入れる</span>
        <span className="inline-flex items-center gap-0.5"><Ban size={11} />BAN＝候補から外す</span>
        {mode === "rental" && (
          <span className="inline-flex items-center gap-0.5"><UserX size={11} />レンタルNG＝レンタル枠の候補から外す</span>
        )}
        {mode === "owned" && <span>／ 凸もここで変えられます</span>}
      </p>
      {list.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
          {mode === "owned"
            ? "条件に合う所持カードがありません（所持状況ページで登録してください）。"
            : "条件に合うカードがありません。"}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-200">
          {list.map((card) => {
            const used = usedIds.has(card.id);
            const url = imageUrl(card.image);
            const editable = mode === "owned" && !!setLevel;
            return (
              <li key={card.id} className="flex items-center gap-2 px-1">
                <button
                  type="button"
                  disabled={used}
                  onClick={() =>
                    onPick({ id: card.id, rental: mode === "rental" })
                  }
                  className={`flex min-w-0 flex-1 items-center gap-3 py-1.5 text-left text-sm transition ${
                    used
                      ? "cursor-not-allowed opacity-40"
                      : "hover:bg-blue-50"
                  }`}
                >
                  {url ? (
                    <img
                      src={url}
                      alt={card.name}
                      loading="lazy"
                      className="h-9 w-18 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="h-9 w-18 shrink-0 rounded bg-slate-100" />
                  )}
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${
                      card.assist
                        ? "bg-purple-100 text-purple-700"
                        : TYPE_CHIP[card.type]
                    }`}
                  >
                    {card.assist ? "アシスト" : TYPE_LABELS[card.type]}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-800">
                    {card.name}
                  </span>
                  {used && (
                    <span className="shrink-0 text-xs text-slate-400">
                      選択中
                    </span>
                  )}
                  {!editable && (
                    <span className="shrink-0 text-xs text-slate-500">
                      {card.rental ? (
                        <span className="font-semibold text-amber-600">
                          レンタル 4凸
                        </span>
                      ) : (
                        `${card.level}凸`
                      )}
                    </span>
                  )}
                  <span className="w-14 shrink-0 text-right font-bold tabular-nums text-blue-600">
                    +{Math.round(card.points)}
                  </span>
                </button>
                {/* 所持の凸をその場で直す（所持状況ページへ行かなくてよい） */}
                {editable && (
                  <select
                    value={card.level}
                    onChange={(e) => setLevel!(card.id, Number(e.target.value))}
                    title="所持の凸数を変更（未所持にすると一覧から消えます）"
                    className="shrink-0 rounded-md border border-slate-300 bg-white px-1 py-0.5 text-xs text-slate-600"
                  >
                    <option value={-1}>未所持</option>
                    {[0, 1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n}凸
                      </option>
                    ))}
                  </select>
                )}
                {/* 固定・BAN・レンタルNG（アイコンだけ。ホバーで説明） */}
                <span className="flex shrink-0 items-center gap-0.5">
                  <FlagButton
                    kind="pin"
                    on={flags.pinned.has(card.id)}
                    onClick={() => onToggleFlag(card.id, "pin")}
                  />
                  <FlagButton
                    kind="ban"
                    on={flags.banned.has(card.id)}
                    onClick={() => onToggleFlag(card.id, "ban")}
                  />
                  {mode === "rental" && (
                    <FlagButton
                      kind="rentalNg"
                      on={flags.rentalNg?.has(card.id) ?? false}
                      onClick={() => onToggleFlag(card.id, "rentalNg")}
                    />
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-slate-400">
        ※ 点数は現在のプロデュース（アビリティ発動回数）・踏み方の設定での基本点（イベント相互作用は6枚が揃ったときに加算）。ティア表が無いカードは点数計算ができないため表示していません。
      </p>
    </Modal>
  );
}

/** 固定・BAN・レンタルNGの切り替えボタン（アイコンだけ。説明はホバー） */
const FLAG_STYLE: Record<
  FlagKind,
  { Icon: typeof Pin; label: string; on: string; off: string }
> = {
  pin: {
    Icon: Pin,
    label: "固定（必ず編成に入れる）",
    on: "border-blue-500 bg-blue-500 text-white",
    off: "border-slate-200 bg-white text-slate-400 hover:border-blue-300 hover:text-blue-600",
  },
  ban: {
    Icon: Ban,
    label: "BAN（候補から外す）",
    on: "border-red-500 bg-red-500 text-white",
    off: "border-slate-200 bg-white text-slate-400 hover:border-red-300 hover:text-red-600",
  },
  rentalNg: {
    Icon: UserX,
    label: "レンタルNG（レンタル枠の候補から外す）",
    on: "border-violet-500 bg-violet-500 text-white",
    off: "border-slate-200 bg-white text-slate-400 hover:border-violet-300 hover:text-violet-600",
  },
};

function FlagButton({
  kind,
  on,
  onClick,
}: {
  kind: FlagKind;
  on: boolean;
  onClick: () => void;
}) {
  const { Icon, label, on: onClass, off } = FLAG_STYLE[kind];
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-pressed={on}
      className={`flex h-7 w-7 items-center justify-center rounded-md border transition ${on ? onClass : off}`}
    >
      <Icon size={13} />
    </button>
  );
}
