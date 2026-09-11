import { TYPE_CHIP, TYPE_SHORT, TYPE_SOLID } from "@/components/ui";
import type { useCalcResult } from "@/lib/useCalcResult";
import { TYPE_KEYS, type TypeKey } from "@/lib/useCalcSettings";

type CalcResult = ReturnType<typeof useCalcResult>;

/** 踏み方の要約（レッスン・授業／営業の並び・選抜／オーディション／試験） */
export type PlanSummary = {
  /** type=メイン（null=踏まない）、sub=サブ（H.I.F.のみ）、sp=SPレッスン */
  lessons: { type: TypeKey | null; sub?: TypeKey; sp: boolean }[];
  /** 授業（H.I.F. 6コマ／初 4コマ）を順番どおりに */
  classes?: TypeKey[];
  /** 営業（N.I.A.）を順番どおりに */
  sales?: TypeKey[];
  /** H.I.F. 選抜3回のタイプ別スコア（配分の割合を出す） */
  exams?: Record<TypeKey, number>[];
  /** N.I.A. オーディション（1次・2次）のタイプ別ステ上昇 */
  auditions?: Record<TypeKey, number>[];
  /** 初 試験（中間・最終）の順位 */
  ranks?: { mid: number; final: number };
};

/** 今の踏み方（シナリオ別のストア）を要約に変換する */
export function currentPlanSummary(r: CalcResult): PlanSummary {
  if (r.scenario === "niaMaster") {
    return {
      lessons: r.niaSchedule.lessons.map((l) => ({ type: l.main, sp: l.sp })),
      sales: r.niaSchedule.sales.map((s) => s.type),
      auditions: r.niaSchedule.auditions,
    };
  }
  if (r.scenario === "hatsuLegend") {
    return {
      lessons: r.hatsuSchedule.lessons.map((l) => ({ type: l.main, sp: l.sp })),
      classes: r.hatsuSchedule.classTypes,
      ranks: { mid: r.hatsuSchedule.midRank, final: r.hatsuSchedule.finalRank },
    };
  }
  return {
    lessons: r.schedule.lessons.map((l) => ({ type: l.main, sub: l.sub, sp: l.sp })),
    classes: r.schedule.classTypes,
    exams: r.schedule.examScores,
  };
}

/** 踏み方の実現確率の表示（小さい値でも桁が読めるように段階的に精度を上げる） */
export function formatProb(p: number): string {
  const pct = p * 100;
  if (pct >= 10) return `${pct.toFixed(1)}%`;
  if (pct >= 1) return `${pct.toFixed(2)}%`;
  if (pct >= 0.01) return `${pct.toFixed(3)}%`;
  if (pct <= 0) return "0%";
  return `${pct.toPrecision(2)}%`;
}

/** 1タイプのチップ（授業・営業・レッスンのメイン部分。すべて同じ大きさ） */
function TypeBlock({ type, className = "" }: { type: TypeKey | null; className?: string }) {
  return (
    <span
      className={`flex h-8 w-8 items-center justify-center text-[12px] font-bold ${
        type ? TYPE_SOLID[type] : "bg-slate-200 text-slate-500"
      } ${className}`}
    >
      {type ? TYPE_SHORT[type] : "休"}
    </span>
  );
}

function Row({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="w-12 shrink-0 text-[11px] font-bold text-slate-500">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      {note && <span className="w-full text-[10px] text-slate-400 sm:ml-14">{note}</span>}
    </div>
  );
}

/** 選抜3回のスコア配分（タイプ別の割合を積み上げバーで） */
function ExamBars({ exams }: { exams: Record<TypeKey, number>[] }) {
  return (
    <div className="flex w-full flex-col gap-1">
      {exams.map((scores, i) => {
        const total = TYPE_KEYS.reduce((sum, t) => sum + (scores[t] ?? 0), 0);
        return (
          <div key={i} className="flex items-center gap-2 text-[11px]">
            <span className="w-7 shrink-0 font-bold text-slate-500">{i + 1}次</span>
            <div className="flex h-6 min-w-0 flex-1 overflow-hidden rounded-md bg-slate-100">
              {total > 0 &&
                TYPE_KEYS.map((t) => {
                  const share = (scores[t] ?? 0) / total;
                  if (share <= 0) return null;
                  return (
                    <span
                      key={t}
                      style={{ width: `${share * 100}%` }}
                      title={`${TYPE_SHORT[t]} ${scores[t].toLocaleString()}（${Math.round(share * 100)}%）`}
                      className={`flex items-center justify-center overflow-hidden whitespace-nowrap text-[10px] font-bold ${TYPE_SOLID[t]}`}
                    >
                      {share >= 0.14 ? `${TYPE_SHORT[t]} ${Math.round(share * 100)}%` : ""}
                    </span>
                  );
                })}
            </div>
            <span className="w-16 shrink-0 text-right tabular-nums text-slate-500">
              {total.toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 踏み方チップ。レッスンは「メイン｜サブ」の2連チップ（黄枠＝SP）、授業・営業は順番どおり、
 * 選抜はタイプ別スコアの配分バー。授業とレッスンのメイン部分は同じ大きさにそろえる。
 */
export function PlanChips({ plan }: { plan: PlanSummary }) {
  const hasSub = plan.lessons.some((l) => l.sub);
  return (
    <div className="flex flex-col gap-2">
      <Row
        label="レッスン"
        note={hasSub ? "黄色の枠＝SPレッスン、左＝メイン、右＝サブ" : "黄色の枠＝SPレッスン"}
      >
        {plan.lessons.map((l, i) => (
          <span
            key={i}
            title={
              l.type
                ? `レッスン${i + 1}: ${TYPE_SHORT[l.type]}${l.sub ? `（サブ ${TYPE_SHORT[l.sub]}）` : ""}${l.sp ? "・SP" : ""}`
                : `レッスン${i + 1}: 踏まない`
            }
            className={`flex items-stretch overflow-hidden rounded-md ${
              l.sp && l.type ? "ring-2 ring-amber-400 ring-offset-1" : ""
            }`}
          >
            <TypeBlock type={l.type} />
            {l.sub && (
              <span
                className={`flex h-8 w-7 items-center justify-center text-[11px] font-bold ${TYPE_CHIP[l.sub]}`}
              >
                {TYPE_SHORT[l.sub]}
              </span>
            )}
          </span>
        ))}
      </Row>
      {plan.classes && plan.classes.length > 0 && (
        <Row label="授業">
          {plan.classes.map((t, i) => (
            <span key={i} title={`${i + 1}回目: ${TYPE_SHORT[t]}`} className="overflow-hidden rounded-md">
              <TypeBlock type={t} />
            </span>
          ))}
        </Row>
      )}
      {plan.sales && plan.sales.length > 0 && (
        <Row label="営業">
          {plan.sales.map((t, i) => (
            <span key={i} title={`${i + 1}回目: ${TYPE_SHORT[t]}`} className="overflow-hidden rounded-md">
              <TypeBlock type={t} />
            </span>
          ))}
        </Row>
      )}
      {plan.exams && plan.exams.length > 0 && (
        <Row label="選抜">
          <ExamBars exams={plan.exams} />
        </Row>
      )}
      {plan.auditions && plan.auditions.length > 0 && (
        <Row label="オーデ">
          {plan.auditions.map((a, i) => (
            <span key={i} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] tabular-nums text-slate-700">
              {i + 1}次 Vo{a.vocal} Da{a.dance} Vi{a.visual}
            </span>
          ))}
        </Row>
      )}
      {plan.ranks && (
        <Row label="試験">
          <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-700">
            中間 {plan.ranks.mid}位 ／ 最終 {plan.ranks.final}位
          </span>
        </Row>
      )}
    </div>
  );
}
