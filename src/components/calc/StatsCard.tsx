import { Card } from "@/components/calc/CalcCard";
import Hint from "@/components/Hint";
import { TYPE_CHIP } from "@/components/ui";
import { GLOSSARY } from "@/lib/glossary";
import type { useCalcResult } from "@/lib/useCalcResult";
import { TYPE_KEYS, TYPE_LABELS, type TypeKey } from "@/lib/useCalcSettings";

type CalcResult = ReturnType<typeof useCalcResult>;

/** ステの内訳（積み上げバーの区分と色） */
const SEGMENTS = [
  { key: "start", label: "開始時", color: "bg-slate-400" },
  { key: "lesson", label: "レッスン", color: "bg-sky-500" },
  { key: "exam", label: "選抜", color: "bg-violet-500" },
  { key: "class", label: "授業", color: "bg-amber-500" },
  { key: "support", label: "サポカ", color: "bg-emerald-500" },
  { key: "parabo", label: "パラボ変換", color: "bg-pink-500" },
] as const;
type SegmentKey = (typeof SEGMENTS)[number]["key"];

/**
 * 育成後のステータス。数字の下に「何で伸びたか」の細い積み上げバー（上限までの割合）を出す。
 * 最低／最高ステの条件を設定しているときは、その位置に印を付ける。
 */
export default function StatsCard({
  r,
  minStats,
  maxStats,
}: {
  r: CalcResult;
  minStats: Record<TypeKey, number>;
  maxStats: Record<TypeKey, number>;
}) {
  const cap = r.statCap;
  const rows = TYPE_KEYS.map((type) => {
    const p = r.perType[type];
    const detail = r.paraboDetail[type];
    const values: Record<SegmentKey, number> = {
      start: p.memFixed + p.idolFixed,
      lesson: p.lessonGain,
      exam: p.examGain,
      class: p.classGain,
      support: detail.support,
      parabo: detail.conv,
    };
    // バーの目盛り: 上限まで。溢れているときは溢れた分も入るように伸ばす
    const scale = Math.max(cap, p.current);
    return { type, p, values, scale };
  });

  return (
    <Card
      title="育成後のステータス"
      hint={<Hint text={`${GLOSSARY.finalStats} 各タイプの上限は${cap}です。数字の下のバーは上限までの割合と内訳（色の意味は下）。`} />}
    >
      <div className="flex flex-col gap-2.5">
        {rows.map(({ type, p, values, scale }) => {
          const over = p.current > cap;
          const min = minStats[type];
          const max = maxStats[type];
          return (
            <div key={type}>
              <div className="flex items-baseline gap-2 tabular-nums">
                <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${TYPE_CHIP[type]}`}>
                  {TYPE_LABELS[type]}
                </span>
                <span
                  className={`ml-auto text-2xl font-bold ${over ? "text-red-500" : "text-slate-800"}`}
                >
                  {Math.round(p.current).toLocaleString()}
                </span>
                <span className="w-16 text-right text-xs text-slate-400">
                  {over ? `+${Math.round(p.current - cap).toLocaleString()}超` : `あと ${Math.round(cap - p.current).toLocaleString()}`}
                </span>
              </div>
              {/* 内訳バー */}
              <div className="relative mt-1 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="flex h-full w-full">
                  {SEGMENTS.map((seg) => {
                    const v = Math.max(0, values[seg.key]);
                    if (v <= 0) return null;
                    return (
                      <span
                        key={seg.key}
                        style={{ width: `${(v / scale) * 100}%` }}
                        className={seg.color}
                        title={`${seg.label} ${Math.round(v).toLocaleString()}`}
                      />
                    );
                  })}
                </div>
                {/* 上限（溢れているときだけ見える）と条件の印 */}
                {over && (
                  <span
                    style={{ left: `${(cap / scale) * 100}%` }}
                    className="absolute top-0 h-full w-0.5 bg-red-600"
                    title={`上限 ${cap}`}
                  />
                )}
                {min > 0 && min <= scale && (
                  <span
                    style={{ left: `${(min / scale) * 100}%` }}
                    className="absolute top-0 h-full w-0.5 bg-emerald-700"
                    title={`最低ステ ${min.toLocaleString()}`}
                  />
                )}
                {max > 0 && max < cap && (
                  <span
                    style={{ left: `${(max / scale) * 100}%` }}
                    className="absolute top-0 h-full w-0.5 bg-red-500"
                    title={`最高ステ ${max.toLocaleString()}`}
                  />
                )}
              </div>
            </div>
          );
        })}
        <div className="flex items-baseline gap-2 border-t border-slate-100 pt-2 tabular-nums">
          <span className="text-xs font-semibold text-slate-500">合計（上限適用後）</span>
          <span className="ml-auto text-2xl font-bold text-blue-600">
            {Math.round(r.cappedSum).toLocaleString()}
          </span>
          <span className="w-16" />
        </div>
        {/* 凡例 */}
        <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px] text-slate-500">
          {SEGMENTS.map((seg) => (
            <span key={seg.key} className="flex items-center gap-1">
              <span className={`inline-block h-2 w-2 rounded-sm ${seg.color}`} />
              {seg.label}
            </span>
          ))}
          {TYPE_KEYS.some((t) => minStats[t] > 0) && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-0.5 bg-emerald-700" />
              最低ステ
            </span>
          )}
          {TYPE_KEYS.some((t) => maxStats[t] > 0 && maxStats[t] < cap) && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-0.5 bg-red-500" />
              最高ステ
            </span>
          )}
        </div>
      </div>
      {/* スター性・Pポイント・体力は1項目1行 */}
      <div className="mt-2 flex flex-col gap-0.5 border-t border-slate-100 pt-1.5 text-sm text-slate-500">
        {r.scenario === "hif" && (
          <p>
            合計スター性: <b className="text-violet-600">{r.totalStar}</b>
          </p>
        )}
        {/* サポカ由来のPポイントだけ（固定P・前イベP・P率換算・タイプSPレッスンP率）。開始時230や差し入れ等は含めない */}
        <p className="flex items-center gap-1">
          Pポイント（サポカ分）:{" "}
          <b className="text-cyan-700">{Math.round(r.resources.pCards).toLocaleString()}</b>
          <Hint text="サポカ由来のPポイント（固定P・前イベP・レッスンP率換算・タイプSPレッスンP率）。開始時230（HIFボーナス200＋STEP3の30。選抜・本戦とも）・差し入れ80×5・レッスン・メモリー分は含みません" />
        </p>
        <p>
          体力: <b className="text-emerald-700">{Math.round(r.resources.hpTotal)}</b>
        </p>
      </div>
    </Card>
  );
}
