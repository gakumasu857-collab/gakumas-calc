import { useEffect, useMemo, useState } from "react";
import { Ban, Pin, UserX } from "lucide-react";
import Modal from "@/components/Modal";
import { ABILITY_NAMES, type AbilityName } from "@/data/constants";
import { SUPPORT_CARD_DB } from "@/data/supportCardsDb";
import { matchesCardQuery } from "@/lib/cardSearch";
import { imageUrl } from "@/lib/config";
import {
  evaluateTeam,
  paraboJointOf,
  scoreOwnedCards,
  scoreRentalCandidates,
  scoreUnownedCards,
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
const ZERO_STATS: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };

/** 一覧の行の DOM id（開いたときに今の枠のサポカの行まで送るのに使う） */
const rowDomId = (cardId: string) => `support-pick-${cardId}`;

/** 合計ステータスの増減の書き方（+12／−8／±0） */
const formatDelta = (d: number) => (d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : "±0");

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

/** カードID → 登場日・スプシの id（「登場日が新しい順」用。2026-10-07） */
const RELEASE_BY_ID = new Map(SUPPORT_CARD_DB.map((c) => [c.id, c.releaseDate]));
const SHEET_ID_BY_ID = new Map(SUPPORT_CARD_DB.map((c) => [c.id, c.sheetId]));

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
 * 「所持」の下には未所持のサポカもまとめて出す（選ぶとレンタル（完凸）として入る。凸を選べばその場で所持になる）。
 * 開いたときは、今この枠に入っているサポカの行まで送る（毎回いちばん上から探さなくてよいように）。
 * プラン外のカードは表示しない（共通＋Pアイドルのプランのみ）。
 * 各行に「この枠をそのサポカに入れ替えたときの合計ステータスの増減」も出す
 * （ほかの5枚とのイベント相互作用・パラボの合算・上限まで入れた、計算ページの合計と同じ式）。
 */
export default function SupportPickerModal({
  slotIndex,
  usedIds,
  members,
  baseNoConv,
  basePct,
  statCap,
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
  /** 今の編成6枠（空枠は null）。入れ替えたときの合計ステータスの増減に使う */
  members: readonly (ScoredCard | null)[];
  /** サポカ抜きの土台（パラボ変換前のタイプ別ステと、メモリー＋Pアイドル等のパラボ%）とステータス上限 */
  baseNoConv: Record<TypeKey, number>;
  basePct: Record<TypeKey, number>;
  statCap: number;
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
  /** 今この枠に入っているサポカ（開いたときにその行まで送る・行を目立たせる） */
  const currentId = members[slotIndex]?.id;
  // レンタルで入れているサポカなら「レンタル」の一覧を開く（そこに行がある）
  const [mode, setMode] = useState<"owned" | "rental">(() =>
    members[slotIndex]?.rental ? "rental" : "owned",
  );
  const [typeFilter, setTypeFilter] = useState<"すべて" | TypeKey>("すべて");
  const [nameQuery, setNameQuery] = useState("");
  const [abilityFilter, setAbilityFilter] = useState<AbilityName | "">("");
  /** 並び順: 点数順（既定）、入れ替えたときの合計ステータスの増減順、登場日が新しい順 */
  const [sortBy, setSortBy] = useState<"points" | "delta" | "release">("points");

  /**
   * この枠をそのカードに入れ替えたときの、育成後の合計ステータス（上限適用後）の増減。
   * 計算ページの合計と同じ式（パラボは全ソース合算で変換・イベント相互作用込み）で、
   * 表示の合計（四捨五入）どうしの差を返す。
   */
  const deltaOf = useMemo(() => {
    const joint = paraboJointOf(ctx, typeRole, baseNoConv, basePct);
    const others = members.filter(
      (m, i): m is ScoredCard => m !== null && i !== slotIndex,
    );
    const totalOf = (team: ScoredCard[]) =>
      Math.round(evaluateTeam(team, ZERO_STATS, statCap, undefined, joint).score);
    const cur = members[slotIndex];
    const now = totalOf(cur ? [...others, cur] : others);
    return (card: ScoredCard) => totalOf([...others, card]) - now;
  }, [ctx, typeRole, baseNoConv, basePct, members, slotIndex, statCap]);

  // usedIds は親が毎回作り直すので、中身の文字列で依存を見る（開いている間の無駄な並べ直しを避ける）
  const usedKey = [...usedIds].sort().join("\n");
  const list: { card: ScoredCard; delta: number; unowned: boolean }[] = useMemo(() => {
    const used = new Set(usedKey ? usedKey.split("\n") : []);
    const cards =
      mode === "owned"
        ? [
            ...scoreOwnedCards(getLevel, ctx, typeRole, { plan }),
            // 未所持も出す（完凸レンタルとして点数化。下にまとめる）
            ...scoreUnownedCards(getLevel, ctx, typeRole, { plan }),
          ]
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
      .map((card) => ({
        card,
        delta: deltaOf(card),
        unowned: mode === "owned" && getLevel(card.id) < 0,
      }))
      .sort(
        (a, b) =>
          // 所持の一覧では未所持を下にまとめる
          Number(a.unowned) - Number(b.unowned) ||
          (sortBy === "delta"
            ? // 増減順: ほかの枠で選択中のカード（選べない）は最後にまとめる
              Number(used.has(a.card.id)) - Number(used.has(b.card.id)) ||
              b.delta - a.delta ||
              b.card.points - a.card.points
            : sortBy === "release"
              ? // 登場日が新しい順（同じ日はスプシの id が大きい順、次に点数）
                (RELEASE_BY_ID.get(b.card.id) ?? "").localeCompare(RELEASE_BY_ID.get(a.card.id) ?? "") ||
                (SHEET_ID_BY_ID.get(b.card.id) ?? 0) - (SHEET_ID_BY_ID.get(a.card.id) ?? 0) ||
                b.card.points - a.card.points
              : b.card.points - a.card.points),
      );
  }, [
    mode,
    typeFilter,
    nameQuery,
    abilityFilter,
    sortBy,
    usedKey,
    deltaOf,
    getLevel,
    ctx,
    typeRole,
    plan,
    rentalNg,
  ]);

  // 開いたときに、今この枠に入っているサポカの行まで送る（一覧は最初の描画で出そろっている）
  useEffect(() => {
    if (!currentId) return;
    document.getElementById(rowDomId(currentId))?.scrollIntoView({ block: "center" });
    // 開いたときだけ（並べ替え・絞り込みのたびには送らない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        {/* 並び順 */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "points" | "delta" | "release")}
          title="並び順"
          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-600 outline-none focus:border-blue-500"
        >
          <option value="points">点数順</option>
          <option value="delta">合計ステの増減順</option>
          <option value="release">登場日が新しい順</option>
        </select>
        <span className="ml-auto text-xs text-slate-400">
          {plan && plan !== "フリー"
            ? `プラン制限: 共通＋${plan}のみ表示`
            : "プラン制限なし"}
        </span>
      </div>

      <p className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
        行の右のボタン:
        <span className="inline-flex items-center gap-0.5"><Pin size={11} />固定＝必ず編成に入れる</span>
        <span className="inline-flex items-center gap-0.5"><Ban size={11} />BAN＝候補から外す</span>
        {mode === "rental" && (
          <span className="inline-flex items-center gap-0.5"><UserX size={11} />レンタルNG＝レンタル枠の候補から外す</span>
        )}
        {mode === "owned" && (
          <span>／ 凸もここで変えられます／ 未所持のサポカは下にまとめて出ます（選ぶとレンタルとして入ります）</span>
        )}
      </p>
      {list.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
          {mode === "owned"
            ? "条件に合う所持カードがありません（所持状況ページで登録してください）。"
            : "条件に合うカードがありません。"}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-200">
          {list.map(({ card, delta, unowned }) => {
            const used = usedIds.has(card.id);
            const url = imageUrl(card.image);
            const editable = mode === "owned" && !!setLevel;
            const current = card.id === currentId;
            return (
              // スマホは2段（上=画像・タイプと名前・点数／下=凸と固定などのボタン）。PCは1行。
              // 今この枠に入っているサポカは薄い青で目立たせる（開いたときにここまで送る）
              <li
                key={card.id}
                id={rowDomId(card.id)}
                className={`flex flex-col gap-1 px-1 py-1.5 sm:flex-row sm:items-center sm:gap-2 sm:py-0 ${
                  current ? "bg-blue-50/80" : ""
                }`}
              >
                <button
                  type="button"
                  disabled={used}
                  onClick={() =>
                    // 未所持は持っていないので、選んだらレンタル（完凸）として入れる
                    onPick({ id: card.id, rental: mode === "rental" || unowned })
                  }
                  title={unowned ? "未所持なので、選ぶとレンタル（完凸）として入ります" : undefined}
                  className={`flex min-w-0 flex-1 items-center gap-2 text-left text-sm transition sm:gap-3 sm:py-1.5 ${
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
                  {/* スマホ: タイプ等の行の下に名前（折り返して全部見せる）。PC: sm:contents で1行に並べ直す
                      （並び順は order で タイプ → 名前 → 選択中 → 凸） */}
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:contents">
                    <span className="flex items-center gap-1.5 sm:contents">
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold sm:order-1 ${
                          card.assist
                            ? "bg-purple-100 text-purple-700"
                            : TYPE_CHIP[card.type]
                        }`}
                      >
                        {card.assist ? "アシスト" : TYPE_LABELS[card.type]}
                      </span>
                      {used && (
                        <span className="shrink-0 text-xs text-slate-400 sm:order-3">
                          選択中
                        </span>
                      )}
                      {current && (
                        <span className="shrink-0 rounded bg-blue-600 px-1 text-[10px] font-bold text-white sm:order-3">
                          この枠
                        </span>
                      )}
                      {unowned && (
                        <span className="shrink-0 rounded bg-slate-200 px-1 text-[10px] font-bold text-slate-500 sm:order-3">
                          未所持
                        </span>
                      )}
                      {!editable && (
                        <span className="shrink-0 text-xs text-slate-500 sm:order-4">
                          {card.rental ? (
                            <span className="font-semibold text-amber-600">
                              レンタル 4凸
                            </span>
                          ) : (
                            `${card.level}凸`
                          )}
                        </span>
                      )}
                    </span>
                    {/* 名前は省略しない（長い名前は折り返す） */}
                    <span className="min-w-0 break-words leading-snug text-slate-800 sm:order-2 sm:flex-1">
                      {card.name}
                    </span>
                  </span>
                  {/* 点数と、入れ替えたときの合計ステータスの増減 */}
                  <span className="flex w-16 shrink-0 flex-col items-end leading-tight sm:order-5">
                    <span className="font-bold tabular-nums text-blue-600">
                      +{Math.round(card.points)}
                    </span>
                    {!used && (
                      <span
                        title="この枠をこのサポカに入れ替えたときの、育成後の合計ステータスの増減（ほかの5枚とのイベント相互作用・パラボの合算・ステータス上限まで計算に入れています）"
                        className={`whitespace-nowrap text-[11px] font-bold tabular-nums ${
                          delta > 0
                            ? "text-emerald-600"
                            : delta < 0
                              ? "text-red-500"
                              : "text-slate-400"
                        }`}
                      >
                        合計 {formatDelta(delta)}
                      </span>
                    )}
                  </span>
                </button>
                {/* スマホでは2段目に右寄せ（凸の選択と固定などのボタン）。PCでは行の右端にそのまま並ぶ */}
                <span className="flex shrink-0 items-center justify-end gap-2">
                {/* 所持の凸をその場で直す（所持状況ページへ行かなくてよい） */}
                {editable && (
                  <select
                    value={unowned ? -1 : card.level}
                    onChange={(e) => setLevel!(card.id, Number(e.target.value))}
                    title="所持の凸数を変更（未所持にすると下の未所持のまとまりへ移ります）"
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
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-slate-400">
        ※ 点数の下の「合計 +◯／−◯」は、この枠をそのサポカに入れ替えたときの育成後の合計ステータスの増減です（ほかの5枚とのイベント相互作用・パラボの合算・ステータス上限まで計算に入れています）。
      </p>
      <p className="mt-1 text-[11px] text-slate-400">
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
