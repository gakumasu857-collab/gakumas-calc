import { useState } from "react";
import { ChevronDown, ChevronUp, ClipboardCopy } from "lucide-react";
import { SUPPORT_CATALOG } from "@/data/supportCardCatalog";
import type { AutoOptimizeResult } from "@/lib/autoOptimize";
import { imageUrl } from "@/lib/config";
import type { TypeKey } from "@/lib/useCalcSettings";
import {
  BTN_GHOST,
  BTN_SECONDARY,
  CHIP_NG,
  CHIP_OK,
  TYPE_CHIP,
  TYPE_SHORT,
  TYPE_SOLID,
} from "@/components/ui";

const IMAGE_BY_ID = new Map(SUPPORT_CATALOG.map((c) => [c.id, c.image]));

/** 探索の条件（SP率持ち・タイプ割合・最低ステ・最高ステ）の達成状況 */
export type ConditionStatus = { label: string; ok: boolean; detail?: string };

/** 踏み方の要約（レッスンの並び＋授業／営業の並び） */
export type PlanSummary = {
  /** type=メイン（null=踏まない）、sub=サブ（H.I.F.のみ）、sp=SPレッスン */
  lessons: { type: TypeKey | null; sub?: TypeKey; sp: boolean }[];
  /** 授業（H.I.F. 6コマ／初 4コマ）を順番どおりに */
  classes?: TypeKey[];
  /** 営業（N.I.A.）を順番どおりに */
  sales?: TypeKey[];
};

/**
 * 自動探索の結果。文章ではなく要素に分けて持ち、結果カードで構造化して見せる。
 * kind: applied=反映した／kept=今の編成のまま（結果が下回った）／info=短い通知／error=失敗
 */
export type OptimizeOutcome = {
  kind: "applied" | "kept" | "info" | "error";
  message?: string;
  before?: number | null;
  after?: number | null;
  elapsedMs?: number;
  evaluated?: number;
  swappedIn?: { id: string; name: string; rental?: boolean }[];
  swappedOut?: { id: string; name: string }[];
  plan?: PlanSummary;
  conditions?: ConditionStatus[];
  axisReport?: AutoOptimizeResult["axisReport"];
  notes?: string[];
  diagLog?: string | null;
};

/** 小さいタイプチップ（授業・営業の並び用） */
function SmallTypeChip({ type, index }: { type: TypeKey; index: number }) {
  return (
    <span
      title={`${index + 1}回目: ${TYPE_SHORT[type]}`}
      className={`flex h-5 w-6 items-center justify-center rounded text-[10px] font-bold ${TYPE_SOLID[type]}`}
    >
      {TYPE_SHORT[type]}
    </span>
  );
}

/**
 * 踏み方チップ。レッスンはメイン（大）＋サブ（右下の小バッジ）＋SP（枠）、
 * 授業・営業は順番どおりに並べる。結果カードと「レッスンの踏み方」ブロックで共用。
 */
export function PlanChips({ plan }: { plan: PlanSummary }) {
  const hasSub = plan.lessons.some((l) => l.sub);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="w-9 shrink-0 text-[11px] font-bold text-slate-500">
          レッスン
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {plan.lessons.map((l, i) => (
            <span
              key={i}
              title={
                l.type
                  ? `レッスン${i + 1}: ${TYPE_SHORT[l.type]}${l.sub ? `（サブ ${TYPE_SHORT[l.sub]}）` : ""}${l.sp ? "・SP" : ""}`
                  : `レッスン${i + 1}: 踏まない`
              }
              className={`relative flex h-7 min-w-8 items-center justify-center rounded-md px-1.5 text-[11px] font-bold ${
                l.type ? TYPE_SOLID[l.type] : "bg-slate-200 text-slate-500"
              } ${l.sp && l.type ? "ring-2 ring-amber-400 ring-offset-1" : ""}`}
            >
              {l.type ? TYPE_SHORT[l.type] : "休"}
              {l.sub && (
                <span
                  className={`absolute -bottom-1.5 -right-1.5 rounded px-0.5 text-[8px] font-bold leading-3 ring-1 ring-white ${TYPE_CHIP[l.sub]}`}
                >
                  {TYPE_SHORT[l.sub]}
                </span>
              )}
            </span>
          ))}
        </span>
        <span className="text-[10px] text-slate-400">
          枠＝SP{hasSub ? "・右下＝サブ" : ""}
        </span>
      </div>
      {plan.classes && plan.classes.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="w-9 shrink-0 text-[11px] font-bold text-slate-500">授業</span>
          <span className="flex flex-wrap items-center gap-1">
            {plan.classes.map((t, i) => (
              <SmallTypeChip key={i} type={t} index={i} />
            ))}
          </span>
        </div>
      )}
      {plan.sales && plan.sales.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="w-9 shrink-0 text-[11px] font-bold text-slate-500">営業</span>
          <span className="flex flex-wrap items-center gap-1">
            {plan.sales.map((t, i) => (
              <SmallTypeChip key={i} type={t} index={i} />
            ))}
          </span>
        </div>
      )}
    </div>
  );
}

/** 自動探索の結果カード。前後の評価値・入れ替わったサポカ・踏み方・条件の達成を一目で */
export default function OptimizeResultCard({
  outcome,
}: {
  outcome: OptimizeOutcome;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [logShown, setLogShown] = useState(false);
  const [copied, setCopied] = useState(false);

  if (outcome.kind === "error") {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
        {outcome.message}
      </p>
    );
  }
  if (outcome.kind === "info") {
    return (
      <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
        {outcome.message}
      </p>
    );
  }

  const before = outcome.before ?? null;
  const after = outcome.after ?? null;
  const delta = before !== null && after !== null ? after - before : null;
  const kept = outcome.kind === "kept";
  const swappedIn = outcome.swappedIn ?? [];
  const swappedOut = outcome.swappedOut ?? [];

  const copyLog = () => {
    const log = outcome.diagLog;
    if (!log) return;
    const clip = navigator.clipboard?.writeText(log);
    if (!clip) {
      setLogShown(true);
      return;
    }
    void clip.then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => setLogShown(true),
    );
  };

  return (
    <div
      className={`rounded-xl border p-3 ${
        kept ? "border-slate-300 bg-slate-50" : "border-blue-200 bg-blue-50/40"
      }`}
    >
      {/* 見出し行: 状態と前後の評価値 */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xs font-bold text-slate-600">
          {kept ? "探索結果（今の編成のまま）" : "探索結果を反映しました"}
        </span>
        <span className="flex items-baseline gap-1.5 tabular-nums">
          {before !== null && (
            <>
              <span className="text-sm text-slate-500">
                {before.toLocaleString()}
              </span>
              <span className="text-slate-400">→</span>
            </>
          )}
          <span
            className={`text-2xl font-bold ${kept ? "text-slate-500" : "text-blue-600"}`}
          >
            {after?.toLocaleString()}
          </span>
          {delta !== null && (
            <span
              className={`text-sm font-bold ${
                delta >= 0 ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {delta >= 0 ? "+" : ""}
              {delta.toLocaleString()}
            </span>
          )}
        </span>
        {outcome.elapsedMs !== undefined && (
          <span className="text-[11px] text-slate-400">
            {(outcome.elapsedMs / 1000).toFixed(1)}秒
          </span>
        )}
      </div>

      {kept && (
        <p className="mt-1 text-xs text-slate-600">
          今の編成が探索の条件を満たしていて、探索結果がそれを下回ったため変更していません。
        </p>
      )}

      {!kept && (
        <div className="mt-2 flex flex-col gap-1.5 text-xs text-slate-700">
          <Row label="入替">
            {swappedIn.length === 0 && swappedOut.length === 0 ? (
              <span className="text-slate-500">サポカは変わりませんでした</span>
            ) : (
              <>
                {swappedIn.map((c) => (
                  <CardTag key={`in:${c.id}`} id={c.id} name={c.name} kind="in" rental={c.rental} />
                ))}
                {swappedOut.map((c) => (
                  <CardTag key={`out:${c.id}`} id={c.id} name={c.name} kind="out" />
                ))}
              </>
            )}
          </Row>
          {outcome.plan && (
            <Row label="踏み方">
              <PlanChips plan={outcome.plan} />
            </Row>
          )}
          {outcome.conditions && outcome.conditions.length > 0 && (
            <Row label="条件">
              {outcome.conditions.map((c) => (
                <span
                  key={c.label}
                  className={c.ok ? CHIP_OK : CHIP_NG}
                  title={c.detail}
                >
                  {c.ok ? "✓" : "✗"} {c.label}
                  {c.detail && (
                    <span className="font-normal opacity-80">（{c.detail}）</span>
                  )}
                </span>
              ))}
            </Row>
          )}
        </div>
      )}

      {outcome.notes && outcome.notes.length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5 text-[11px] text-amber-700">
          {outcome.notes.map((n) => (
            <li key={n}>・{n}</li>
          ))}
        </ul>
      )}

      {/* 上級者向けの情報は畳む */}
      <button
        type="button"
        onClick={() => setDetailOpen((v) => !v)}
        className={`${BTN_GHOST} mt-1.5 -ml-2`}
      >
        {detailOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        詳細（寄せ方の比較・探索の内訳・診断ログ）
      </button>
      {detailOpen && (
        <div className="mt-1 flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-[11px] text-slate-600">
          {outcome.axisReport && outcome.axisReport.length > 1 && (
            <div>
              <p className="font-bold text-slate-700">
                寄せ方の比較（採用以外は仕上げ前の値）
              </p>
              <ul className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 tabular-nums">
                {outcome.axisReport.map((a) => (
                  <li key={a.axis}>
                    <b className={a.chosen ? "text-blue-700" : "text-slate-700"}>
                      {a.axis}
                    </b>{" "}
                    {a.rating.toLocaleString()}
                    {a.chosen && (
                      <span className="ml-1 rounded bg-blue-100 px-1 text-[10px] font-bold text-blue-700">
                        採用
                      </span>
                    )}
                    {a.issues.length > 0 && (
                      <span className="ml-1 text-red-600">
                        条件未達: {a.issues.join("・")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {outcome.evaluated !== undefined && (
            <p>
              探索した組み合わせ:{" "}
              <b>{outcome.evaluated.toLocaleString()}</b> 通り
              {outcome.elapsedMs !== undefined &&
                `（${(outcome.elapsedMs / 1000).toFixed(1)}秒）`}
            </p>
          )}
          {outcome.diagLog && (
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={copyLog}
                  className={BTN_SECONDARY}
                  title="今の設定・踏み方・メモリー・発動回数・所持状況と探索結果をJSONでコピーします（探索がおかしいときに送ってください）"
                >
                  <ClipboardCopy size={12} />
                  診断ログをコピー
                </button>
                {copied && <span className="text-emerald-600">コピーしました</span>}
                <span className="text-slate-400">
                  結果に納得できないときは、これを貼って送ってください
                </span>
              </div>
              {logShown && (
                <textarea
                  readOnly
                  value={outcome.diagLog}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-24 w-full rounded-lg border border-slate-300 bg-slate-50 p-2 font-mono text-[10px] text-slate-600"
                  title="コピーできなかったので本文を表示しています。全選択してコピーしてください"
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-12 shrink-0 pt-0.5 text-[11px] font-bold text-slate-500">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {children}
      </div>
    </div>
  );
}

/** 入れ替わったサポカ（▲入った／▼外れた）のサムネイル付きタグ */
function CardTag({
  id,
  name,
  kind,
  rental,
}: {
  id: string;
  name: string;
  kind: "in" | "out";
  rental?: boolean;
}) {
  const url = imageUrl(IMAGE_BY_ID.get(id) ?? "");
  return (
    <span
      title={name}
      className={`inline-flex max-w-full items-center gap-1 rounded-md border px-1 py-0.5 ${
        kind === "in"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-slate-200 bg-slate-100 text-slate-500"
      }`}
    >
      <span className="text-[10px] font-black">{kind === "in" ? "▲" : "▼"}</span>
      {url && (
        <img
          src={url}
          alt=""
          loading="lazy"
          className={`h-5 w-auto rounded ${kind === "out" ? "grayscale" : ""}`}
        />
      )}
      <span className="max-w-32 truncate text-[11px] font-semibold">{name}</span>
      {rental && (
        <span className="rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-700">
          レンタル
        </span>
      )}
    </span>
  );
}
