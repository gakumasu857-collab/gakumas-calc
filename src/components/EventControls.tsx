/**
 * 前イベ・後イベ設定の共有UI（サポカ設定ページと計算ページの前イベエディタで使用）。
 * - AcquireToggle: 前イベのスキル/Pアイテムを「取得したか」。OFFなら前イベは発動0回扱い
 * - PreAssign: 前イベの強化・削除の割り振り。Mの枚数を決めると残りが自動でAになる
 * - PostEventButtons: 後イベ。ランダム強化=［M/A/✕］ボタン＋強化したスキルの属性（温存など）、チェンジ等=発動トグル
 */
import { useState } from "react";
import { Minus, Plus, Settings2 } from "lucide-react";
import Modal from "@/components/Modal";
import type { SupportCardData } from "@/data/supportCardsDb";
import { imageUrl } from "@/lib/config";
import {
  ANY_SKILL_TAG_KEYS,
  anySkillAcPer,
  defaultDelTarget,
  defaultEnhanceTarget,
  hasPostDelete,
  hasPostEnhance,
  hasPreDelete,
  hasPreEnhance,
  hasStatEvent,
  POST_DELETE_DEFAULT_TARGET,
  POST_ENHANCE_TAG_KEYS,
  postEnhanceTagOptions,
  postEventToggleable,
  type EventCountOverride,
} from "@/lib/sheetScore";

export type EventStoreLike = {
  set: (
    id: string,
    key: "pre" | "post" | "statEvent",
    value: number | null,
  ) => void;
  setTarget: (id: string, value: "A" | "M" | null) => void;
  /** 後イベのランダム強化で強化したスキルの属性（空＝未指定） */
  setEnhanceTags: (id: string, tags: string[]) => void;
  setAssign: (
    id: string,
    key: "preEnhanceM" | "preDelM",
    value: number | null,
  ) => void;
  setAcquire: (id: string, value: boolean | null) => void;
  /** 任意スキル獲得のi回目の分類タグを設定 */
  setSkillTags: (id: string, index: number, tags: string[]) => void;
};

/** カードがステイベ（パラメータ/Pポイント/回復イベント）を持つか（sheetScore の判定を再エクスポート） */
export { hasStatEvent };

/**
 * ステイベ（パラメータイベント）の発動トグル。
 * 前イベ・後イベ同様ランダム発動で、1育成に1回しか起こらないため〇/✕の2択。
 */
export function StatEventToggle({
  card,
  override,
  events,
}: {
  card: SupportCardData;
  override: EventCountOverride | undefined;
  events: EventStoreLike;
}) {
  if (!hasStatEvent(card)) {
    return <span className="text-slate-300">—</span>;
  }
  const active = (override?.statEvent ?? 1) > 0;
  const btn = (on: boolean, cls: string) =>
    `h-6 min-w-6 rounded px-1 text-[11px] font-bold transition ${
      on ? cls : "bg-slate-100 text-slate-400 hover:bg-slate-200"
    }`;
  return (
    <span
      className="inline-flex items-center gap-0.5 whitespace-nowrap"
      title="ステイベ（パラメータイベント）が発動したか（1育成に1回まで）"
    >
      <button
        type="button"
        onClick={() => events.set(card.id, "statEvent", null)}
        className={btn(active, "bg-emerald-500 text-white")}
      >
        〇
      </button>
      <button
        type="button"
        onClick={() => events.set(card.id, "statEvent", 0)}
        className={btn(!active, "bg-slate-600 text-white")}
      >
        ✕
      </button>
    </span>
  );
}

/** 前イベのスキル/Pアイテムの取得トグル（前イベなしカードは何も出さない） */
export function AcquireToggle({
  card,
  override,
  events,
  imgClass = "h-6 w-6",
}: {
  card: SupportCardData;
  override: EventCountOverride | undefined;
  events: EventStoreLike;
  /** 前イベ画像のサイズ（サポカ設定ページでは大きめにする） */
  imgClass?: string;
}) {
  if (
    card.preEventType !== "アイテム" &&
    card.preEventType !== "スキル" &&
    card.preEventType !== "パラメータ"
  ) {
    return null;
  }
  const acquired = override?.acquire ?? true;
  const image = card.preEventImage ? imageUrl(card.preEventImage) : "";
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap align-middle">
      {image && (
        <img
          src={image}
          alt=""
          title={`前イベで${card.preEventType}${card.itemName ? `「${card.itemName}」` : ""}を獲得`}
          loading="lazy"
          className={`${imgClass} shrink-0 object-contain ${acquired ? "" : "opacity-30 grayscale"}`}
        />
      )}
      <button
        type="button"
        onClick={() => events.setAcquire(card.id, acquired ? false : null)}
        title={
          acquired
            ? "取得する（クリックで取得しない=前イベ発動0回扱いに）"
            : "取得しない（前イベは発動0回扱い）"
        }
        className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold transition ${
          acquired
            ? "bg-cyan-100 text-cyan-700 hover:bg-cyan-200"
            : "bg-slate-200 text-slate-400 line-through hover:bg-slate-300"
        }`}
      >
        取得
      </button>
    </span>
  );
}

/**
 * 前イベの強化/削除の割り振り。合計のうちM側の枚数をステッパーで決め、残りは自動でA。
 * @param preCount 前イベの発動回数（取得OFFなら0を渡す）
 */
export function PreAssign({
  card,
  override,
  events,
  preCount,
}: {
  card: SupportCardData;
  override: EventCountOverride | undefined;
  events: EventStoreLike;
  preCount: number;
}) {
  const enhPer = Number(card.extras["スキル強化"] ?? 0) || 0;
  const delPer = Number(card.extras["スキル削除"] ?? 0) || 0;
  const enhTotal = hasPreEnhance(card) ? enhPer * preCount : 0;
  const delTotal = hasPreDelete(card) ? delPer * preCount : 0;
  const anyAcTotal = anySkillAcPer(card) * preCount;
  if (enhTotal <= 0 && delTotal <= 0 && anyAcTotal <= 0) {
    return <span className="text-slate-300">—</span>;
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      {enhTotal > 0 && (
        <MSplitStepper
          label="強化"
          total={enhTotal}
          value={
            override?.preEnhanceM ??
            (defaultEnhanceTarget(card) === "M" ? enhTotal : 0)
          }
          defaultValue={defaultEnhanceTarget(card) === "M" ? enhTotal : 0}
          onChange={(v) => events.setAssign(card.id, "preEnhanceM", v)}
        />
      )}
      {delTotal > 0 && (
        <MSplitStepper
          label="削除"
          total={delTotal}
          value={
            override?.preDelM ??
            (defaultDelTarget(card) === "M" ? delTotal : 0)
          }
          defaultValue={defaultDelTarget(card) === "M" ? delTotal : 0}
          onChange={(v) => events.setAssign(card.id, "preDelM", v)}
        />
      )}
      {anyAcTotal > 0 && (
        <AnySkillTagPicker
          card={card}
          override={override}
          events={events}
          total={anyAcTotal}
        />
      )}
    </span>
  );
}

/** タグの短縮表示（チップ・まとめ表示に載せるラベル）。「○○スキル強化」は末尾を落として使う */
const shortTag = (tag: string): string => TAG_SHORT[tag] ?? tag.replace(/スキル強化$/, "");

/**
 * 後イベのランダム強化で「どの属性のスキルを強化したか」を選ぶ（M/Aとは別に、温存・SSRなどを複数選べる）。
 * 選んだ属性の「○○スキル強化」がその回数ぶん発動する（今あるのは温存スキル強化。ほかは将来スプシに足したとき用）。
 * 選べる属性はサポカのプランで絞る（センス＝好調・集中・SSR・元気／ロジック＝好印象・やる気・SSR・元気／
 * アノマリー＝温存・強気・全力・SSR・元気／共通＝全部）。オーナー指定 2026-09-21
 */
function PostEnhanceTagPicker({
  card,
  override,
  events,
}: {
  card: SupportCardData;
  override: EventCountOverride | undefined;
  events: EventStoreLike;
}) {
  const [open, setOpen] = useState(false);
  const picks = override?.enhanceTags ?? [];
  const options = postEnhanceTagOptions(card);
  const toggle = (tag: string) => {
    const next = picks.includes(tag) ? picks.filter((t) => t !== tag) : [...picks, tag];
    // 表示順（POST_ENHANCE_TAG_KEYS順）に整えて保存
    events.setEnhanceTags(
      card.id,
      POST_ENHANCE_TAG_KEYS.filter((t) => next.includes(t)),
    );
  };
  const summary = picks.map(shortTag).join("・");
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="強化したスキルの属性（温存など）を選びます。選んだ属性の「○○スキル強化」がその回数ぶん発動します"
        className={`h-6 rounded px-1.5 text-[11px] font-bold transition ${
          picks.length > 0
            ? "bg-violet-600 text-white"
            : "bg-slate-100 text-slate-400 hover:bg-slate-200"
        }`}
      >
        {summary || "属性"}
      </button>
      {open && (
        <Modal title={`強化したスキルの属性（${card.name}）`} onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-3 text-xs text-slate-600">
            <p className="leading-relaxed">
              ランダム強化で強化したスキルの属性を選びます（複数選択可。例: 温存＋SSR）。
              選んだ属性の「○○スキル強化」がその回数ぶん発動します。M／Aは左のボタンで選びます。
              {card.plan !== "共通" && `このサポカは${card.plan}なので、${card.plan}のスキルの属性だけ選べます。`}
            </p>
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
              {options.map((tag) => {
                const on = picks.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggle(tag)}
                    title={tag}
                    className={`rounded px-2 py-1 text-xs font-bold transition ${
                      on
                        ? "bg-violet-600 text-white"
                        : "bg-white text-slate-500 ring-1 ring-slate-300 hover:bg-violet-100 hover:text-violet-700"
                    }`}
                  >
                    {shortTag(tag)}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="self-end rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-blue-500"
            >
              閉じる
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

/** タグの短縮表示（チップ・まとめ表示に載せるラベル） */
const TAG_SHORT: Record<string, string> = {
  Aスキル獲得: "A",
  Mスキル獲得: "M",
  好調スキル獲得: "好調",
  集中スキル獲得: "集中",
  好印象スキル獲得: "好印象",
  やる気スキル獲得: "やる気",
  強気スキル獲得: "強気",
  温存スキル獲得: "温存",
  全力スキル獲得: "全力",
  元気スキル獲得: "元気",
  SSRスキル獲得: "SSR",
};

/**
 * 任意スキル獲得の分類ピッカー。
 * 一覧側には「獲得1: M温存SSR元気」のようなまとめボタンだけを置き、
 * 押すとモーダルで回ごとにチップで選ぶ（好調＋集中のように複数の分類に
 * 反応するスキルがあるため、複数選択できるチップ形式）。AとMだけは排他。
 * 未選択の回は汎用スキル獲得としてだけ数える。
 */
function AnySkillTagPicker({
  card,
  override,
  events,
  total,
}: {
  card: SupportCardData;
  override: EventCountOverride | undefined;
  events: EventStoreLike;
  total: number;
}) {
  const [open, setOpen] = useState(false);
  const picks = override?.preSkillTags ?? [];
  const toggle = (index: number, tag: string) => {
    const current = picks[index] ?? [];
    let next: string[];
    if (current.includes(tag)) {
      next = current.filter((t) => t !== tag);
    } else {
      // AとMは排他（1枚のスキルが両方であることはない）
      next =
        tag === "Aスキル獲得"
          ? [...current.filter((t) => t !== "Mスキル獲得"), tag]
          : tag === "Mスキル獲得"
            ? [...current.filter((t) => t !== "Aスキル獲得"), tag]
            : [...current, tag];
    }
    // 表示順（ANY_SKILL_TAG_KEYS順）に整えて保存
    events.setSkillTags(
      card.id,
      index,
      ANY_SKILL_TAG_KEYS.filter((t) => next.includes(t)),
    );
  };
  const summaryOf = (i: number) => {
    const tags = (picks[i] ?? []).map((t) => TAG_SHORT[t] ?? t);
    return tags.length > 0 ? tags.join("・") : "未設定";
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="任意スキル獲得: 獲得したスキルの分類を回ごとに選びます（発動回数の集計に反映）。未選択の回は汎用スキル獲得のみ"
        className="inline-flex flex-col items-start gap-0.5 rounded-lg border border-violet-300 bg-violet-50 px-2 py-1 text-left text-[10px] text-violet-700 transition hover:bg-violet-100"
      >
        <span className="flex items-center gap-1 font-bold">
          <Settings2 size={11} />
          任意獲得の分類
        </span>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className="whitespace-nowrap">
            獲得{i + 1}: <b>{summaryOf(i)}</b>
          </span>
        ))}
      </button>

      {open && (
        <Modal
          title={`任意スキル獲得の分類（${card.name}）`}
          onClose={() => setOpen(false)}
        >
          <div className="flex flex-col gap-3 text-xs text-slate-600">
            <p className="leading-relaxed">
              獲得したスキルがどの分類として数えられるかを、獲得の回ごとに選びます（複数選択可。
              例: 1回目＝M・温存・SSR・元気、2回目＝A・全力）。AとMは排他。
              未選択の回は汎用のスキル獲得としてだけ数えます。
            </p>
            {Array.from({ length: total }, (_, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5"
              >
                <span className="w-12 font-bold text-slate-700">獲得{i + 1}</span>
                {ANY_SKILL_TAG_KEYS.map((tag) => {
                  const on = (picks[i] ?? []).includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggle(i, tag)}
                      title={tag}
                      className={`rounded px-2 py-1 text-xs font-bold transition ${
                        on
                          ? "bg-violet-600 text-white"
                          : "bg-white text-slate-500 ring-1 ring-slate-300 hover:bg-violet-100 hover:text-violet-700"
                      }`}
                    >
                      {TAG_SHORT[tag] ?? tag}
                    </button>
                  );
                })}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="self-end rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-blue-500"
            >
              閉じる
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

/**
 * M枚数のステッパー（残りは自動でA）。
 * −/＋でMの枚数を動かし、MとAはラベル付きチップで別々に表示する。
 */
function MSplitStepper({
  label,
  total,
  value,
  defaultValue,
  onChange,
}: {
  label: string;
  total: number;
  value: number;
  defaultValue: number;
  onChange: (v: number | null) => void;
}) {
  const m = Math.max(0, Math.min(total, value));
  const step = (delta: number) => {
    const next = Math.max(0, Math.min(total, m + delta));
    onChange(next === defaultValue ? null : next);
  };
  const btn =
    "flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30";
  const chip = (labelText: string, count: number, cls: string) => (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${cls}`}
    >
      <span className="text-[10px] font-bold">{labelText}</span>
      <span className="text-sm font-bold tabular-nums">{count}</span>
    </span>
  );
  return (
    <span
      className="inline-flex items-center gap-0.5 whitespace-nowrap"
      title={`${label}${total}回のうちM側に割り振る回数（残りは自動でA）`}
    >
      <span className="text-slate-400">{label}</span>
      <button type="button" disabled={m <= 0} onClick={() => step(-1)} className={btn}>
        <Minus size={12} />
      </button>
      {chip("M", m, "bg-blue-100 text-blue-700")}
      <button type="button" disabled={m >= total} onClick={() => step(1)} className={btn}>
        <Plus size={12} />
      </button>
      {chip("A", total - m, "bg-rose-100 text-rose-700")}
    </span>
  );
}

/** 後イベの設定ボタン（対象外カードは — ）。後イベは2回以上発動しないため0/1のみ */
export function PostEventButtons({
  card,
  override,
  events,
}: {
  card: SupportCardData;
  override: EventCountOverride | undefined;
  events: EventStoreLike;
}) {
  if (!postEventToggleable(card)) {
    return <span className="text-slate-300">{card.postEventType || "—"}</span>;
  }
  const active = (override?.post ?? 1) > 0;

  if (hasPostEnhance(card) || hasPostDelete(card)) {
    // ランダム強化／選択スキル削除: M / A / ✕（発動しない）のボタン
    const isDelete = hasPostDelete(card);
    const defaultTarget = isDelete
      ? POST_DELETE_DEFAULT_TARGET
      : defaultEnhanceTarget(card);
    const current = active ? (override?.enhance ?? defaultTarget) : "off";
    const pick = (v: "M" | "A" | "off") => {
      if (v === "off") {
        events.set(card.id, "post", 0);
      } else {
        events.set(card.id, "post", null);
        events.setTarget(card.id, v === defaultTarget ? null : v);
      }
    };
    const btn = (on: boolean, cls: string) =>
      `h-6 min-w-6 rounded px-1 text-[11px] font-bold transition ${
        on ? cls : "bg-slate-100 text-slate-400 hover:bg-slate-200"
      }`;
    return (
      <span
        className="inline-flex items-center gap-0.5 whitespace-nowrap"
        title={
          isDelete
            ? "どちらのスキルを選んで削除したか（✕=発動しない）"
            : "ランダム強化がどちらのスキルを強化したか（✕=発動しない）"
        }
      >
        <span className="mr-0.5 text-slate-400">
          {isDelete ? "削除" : "強化"}
        </span>
        <button type="button" onClick={() => pick("M")} className={btn(current === "M", "bg-blue-600 text-white")}>
          M
        </button>
        <button type="button" onClick={() => pick("A")} className={btn(current === "A", "bg-rose-500 text-white")}>
          A
        </button>
        <button type="button" onClick={() => pick("off")} className={btn(current === "off", "bg-slate-600 text-white")}>
          ✕
        </button>
        {/* ランダム強化: 強化したスキルの属性（温存など。発動するときだけ） */}
        {!isDelete && current !== "off" && (
          <PostEnhanceTagPicker card={card} override={override} events={events} />
        )}
      </span>
    );
  }

  // チェンジ・トラブル削除・Pポイント: 〇/✕ボタン
  const btn = (on: boolean, cls: string) =>
    `h-6 min-w-6 rounded px-1 text-[11px] font-bold transition ${
      on ? cls : "bg-slate-100 text-slate-400 hover:bg-slate-200"
    }`;
  return (
    <span
      className="inline-flex items-center gap-0.5 whitespace-nowrap"
      title={`${card.postEventType}が発動したか`}
    >
      <span className="mr-0.5 text-slate-400">{card.postEventType}</span>
      <button
        type="button"
        onClick={() => events.set(card.id, "post", null)}
        className={btn(active, "bg-emerald-500 text-white")}
      >
        〇
      </button>
      <button
        type="button"
        onClick={() => events.set(card.id, "post", 0)}
        className={btn(!active, "bg-slate-600 text-white")}
      >
        ✕
      </button>
    </span>
  );
}
