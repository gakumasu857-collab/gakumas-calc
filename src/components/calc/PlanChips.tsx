import { EXAMS } from "@/data/schedule";
import { TYPE_SHORT, TYPE_SOLID, TYPE_TEXT } from "@/components/ui";
import type { useCalcResult } from "@/lib/useCalcResult";
import { TYPE_KEYS, type TypeKey } from "@/lib/useCalcSettings";

type CalcResult = ReturnType<typeof useCalcResult>;

/** 踏み方の要約（レッスン・授業／営業の並び・選抜／オーディション／試験） */
export type PlanSummary = {
  /** type=メイン（null=踏まない）、sub=サブ（H.I.Fのみ）、sp=SPレッスン */
  lessons: { type: TypeKey | null; sub?: TypeKey; sp: boolean }[];
  /** 授業（H.I.F 6コマ／初 4コマ）を順番どおりに（null＝未選択） */
  classes?: (TypeKey | null)[];
  /** 営業（N.I.A）を順番どおりに（null＝未選択） */
  sales?: (TypeKey | null)[];
  /** H.I.F 選抜3回のタイプ別スコア（配分の割合を出す）。ステ直接入力の選抜はその上昇量 */
  exams?: Record<TypeKey, number>[];
  /** 選抜ごとに、ステ直接入力なら true */
  examManual?: boolean[];
  /** N.I.A オーディション（1次・2次・最終）の上がるステ（素点）とファン投票数 */
  auditions?: { label: string; stats: Record<TypeKey, number>; votes: number }[];
  /** 初 試験（中間・最終）の順位 */
  ranks?: { mid: number; final: number };
};

/** 今の踏み方（シナリオ別のストア）を要約に変換する */
export function currentPlanSummary(r: CalcResult): PlanSummary {
  if (r.scenario === "niaMaster") {
    return {
      lessons: r.niaSchedule.lessons.map((l) => ({ type: l.main, sp: l.sp })),
      sales: r.niaSchedule.sales.map((s) => s.type),
      auditions: r.niaAuditionBase.map((stats, i) => ({
        label: i === 2 ? "最終" : `${i + 1}次`,
        stats,
        votes: i === 2 ? (r.scenarioValues.votesFinale ?? 0) : (r.niaSchedule.auditionVotes[i] ?? 0),
      })),
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
    exams: EXAMS.map((_, i) => r.schedule.examStats[i] ?? r.schedule.examScores[i]),
    examManual: r.schedule.examStats.map((x) => !!x),
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
function TypeBlock({
  type,
  muted,
  emptyLabel = "休",
  className = "",
}: {
  type: TypeKey | null;
  /** SPなし（通常レッスン）: 薄くして点線の枠 */
  muted?: boolean;
  /** type が null のときの文字（レッスン＝休、授業・営業＝—） */
  emptyLabel?: string;
  className?: string;
}) {
  return (
    <span
      className={`flex h-8 w-8 items-center justify-center rounded-md text-[12px] font-bold ${
        type ? TYPE_SOLID[type] : "bg-slate-200 text-slate-500"
      } ${muted ? "opacity-55 outline-2 outline-dashed outline-slate-400 outline-offset-1" : ""} ${className}`}
    >
      {type ? TYPE_SHORT[type] : emptyLabel}
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
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="w-12 shrink-0 text-[11px] font-bold text-slate-500">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">{children}</div>
      {note && <span className="w-full text-[10px] text-slate-400 sm:pl-14">{note}</span>}
    </div>
  );
}

/** 選抜3回のスコア配分（細い積み上げバー＋割合の文字） */
function ExamBars({
  exams,
  manual,
}: {
  exams: Record<TypeKey, number>[];
  manual?: boolean[];
}) {
  return (
    <div className="flex w-full flex-col gap-1">
      {exams.map((scores, i) => {
        const total = TYPE_KEYS.reduce((sum, t) => sum + (scores[t] ?? 0), 0);
        const shares = TYPE_KEYS.map((t) => ({
          t,
          share: total > 0 ? (scores[t] ?? 0) / total : 0,
        }));
        return (
          <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] tabular-nums">
            <span className="w-7 shrink-0 font-bold text-slate-500">{i + 1}次</span>
            <div className="flex h-2 w-28 shrink-0 overflow-hidden rounded-full bg-slate-100 sm:w-36">
              {shares.map(
                ({ t, share }) =>
                  share > 0 && (
                    <span
                      key={t}
                      style={{ width: `${share * 100}%` }}
                      className={TYPE_SOLID[t]}
                      title={`${TYPE_SHORT[t]} ${scores[t].toLocaleString()}（${Math.round(share * 100)}%）`}
                    />
                  ),
              )}
            </div>
            <span className="text-slate-600">
              {manual?.[i]
                ? TYPE_KEYS.map((t) => `${TYPE_SHORT[t]} +${scores[t] ?? 0}`).join("・")
                : shares
                    .filter(({ share }) => share > 0)
                    .map(({ t, share }) => `${TYPE_SHORT[t]} ${Math.round(share * 100)}%`)
                    .join("・") || "—"}
            </span>
            <span className="text-slate-400">
              {manual?.[i] ? "（ステ入力）" : `（${total.toLocaleString()}）`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 踏み方チップ。レッスンはメイン（黄・青・赤の1マス）＋右下の小さなサブバッジ（編集モーダルと同じ形）、
 * SPは付いているのが基本なので、SPなし（通常）だけ薄く点線の枠で目立たせる。
 * 授業・営業は順番どおりに同じ大きさで、選抜は細い配分バー＋割合。
 */
export function PlanChips({ plan }: { plan: PlanSummary }) {
  const hasNormal = plan.lessons.some((l) => l.type && !l.sp);
  const notes = hasNormal ? "薄い点線＝通常レッスン（SPなし）" : "";
  return (
    <div className="flex flex-col gap-2.5">
      <Row label="レッスン" note={notes || undefined}>
        {plan.lessons.map((l, i) => (
          <span
            key={i}
            title={
              l.type
                ? `レッスン${i + 1}: ${TYPE_SHORT[l.type]}${l.sub ? `（サブ ${TYPE_SHORT[l.sub]}）` : ""}${l.sp ? "・SP" : "・通常"}`
                : `レッスン${i + 1}: 踏まない`
            }
            // サブバッジがはみ出す分（下・右）を余白として確保し、下の行と重ならないようにする
            className="relative inline-block pb-1.5 pr-1.5"
          >
            <TypeBlock type={l.type} muted={!!l.type && !l.sp} />
            {l.sub && (
              <span
                className={`absolute bottom-0 right-0 flex h-4 min-w-5 items-center justify-center rounded px-0.5 text-[9px] font-bold ring-2 ring-white ${TYPE_SOLID[l.sub]}`}
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
            <span key={i} title={`${i + 1}回目: ${t ? TYPE_SHORT[t] : "未選択"}`}>
              <TypeBlock type={t} emptyLabel="—" />
            </span>
          ))}
        </Row>
      )}
      {plan.sales && plan.sales.length > 0 && (
        <Row label="営業">
          {plan.sales.map((t, i) => (
            <span key={i} title={`${i + 1}回目: ${t ? TYPE_SHORT[t] : "未選択"}`}>
              <TypeBlock type={t} emptyLabel="—" />
            </span>
          ))}
        </Row>
      )}
      {plan.exams && plan.exams.length > 0 && (
        <Row label="選抜">
          <ExamBars exams={plan.exams} manual={plan.examManual} />
        </Row>
      )}
      {plan.auditions && plan.auditions.length > 0 && (
        <Row label="オデ">
          {plan.auditions.map((a, i) => (
            <span
              key={i}
              title="上がるステ（素点。獲得ボーナス・パラボは別途上乗せ）とファン投票数"
              className="rounded-md bg-slate-100 px-2 py-1 text-[11px] tabular-nums text-slate-700"
            >
              <b className="mr-1 text-slate-500">{a.label}</b>
              {TYPE_KEYS.map((t) => (
                <span key={t} className="mr-1">
                  <b className={TYPE_TEXT[t]}>{TYPE_SHORT[t]}</b>+{a.stats[t]}
                </span>
              ))}
              <span className="text-slate-500">{a.votes.toLocaleString()}票</span>
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
