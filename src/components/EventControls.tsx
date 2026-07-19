/**
 * 前イベ・後イベ設定の共有UI（サポカ設定ページと計算ページの前イベエディタで使用）。
 * - AcquireToggle: 前イベのスキル/Pアイテムを「取得したか」。OFFなら前イベは発動0回扱い
 * - PreAssign: 前イベの強化・削除の割り振り。Mの枚数を決めると残りが自動でAになる
 * - PostEventButtons: 後イベ。ランダム強化=［M/A/✕］ボタン、チェンジ等=発動トグル
 */
import { Minus, Plus } from "lucide-react";
import type { SupportCardData } from "@/data/supportCardsDb";
import {
  defaultDelTarget,
  defaultEnhanceTarget,
  hasPostEnhance,
  hasPreDelete,
  hasPreEnhance,
  postEventStatRelevant,
  type EventCountOverride,
} from "@/lib/sheetScore";

export type EventStoreLike = {
  set: (id: string, key: "pre" | "post", value: number | null) => void;
  setTarget: (id: string, value: "A" | "M" | null) => void;
  setAssign: (
    id: string,
    key: "preEnhanceM" | "preDelM",
    value: number | null,
  ) => void;
  setAcquire: (id: string, value: boolean | null) => void;
};

/** 前イベのスキル/Pアイテムの取得トグル（前イベなしカードは何も出さない） */
export function AcquireToggle({
  card,
  override,
  events,
}: {
  card: SupportCardData;
  override: EventCountOverride | undefined;
  events: EventStoreLike;
}) {
  if (card.preEventType !== "アイテム" && card.preEventType !== "スキル") {
    return null;
  }
  const acquired = override?.acquire ?? true;
  return (
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
  if (enhTotal <= 0 && delTotal <= 0) {
    return <span className="text-slate-300">—</span>;
  }

  return (
    <span className="inline-flex items-center gap-3">
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
    </span>
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
  if (!postEventStatRelevant(card)) {
    return <span className="text-slate-300">{card.postEventType || "—"}</span>;
  }
  const active = (override?.post ?? 1) > 0;

  if (hasPostEnhance(card)) {
    // ランダム強化: M / A / ✕（発動しない）のボタン
    const defaultTarget = defaultEnhanceTarget(card);
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
        title="ランダム強化がどちらのスキルを強化したか（✕=発動しない）"
      >
        <span className="mr-0.5 text-slate-400">強化</span>
        <button type="button" onClick={() => pick("M")} className={btn(current === "M", "bg-blue-600 text-white")}>
          M
        </button>
        <button type="button" onClick={() => pick("A")} className={btn(current === "A", "bg-rose-500 text-white")}>
          A
        </button>
        <button type="button" onClick={() => pick("off")} className={btn(current === "off", "bg-slate-600 text-white")}>
          ✕
        </button>
      </span>
    );
  }

  // チェンジ・トラブル削除: 〇/✕ボタン
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
