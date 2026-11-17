import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/calc/CalcCard";
import { DetailNumbers } from "@/components/calc/FormationPlanCard";
import Hint from "@/components/Hint";
import { BTN_GHOST, TYPE_CHIP, TYPE_SHORT } from "@/components/ui";
import { GLOSSARY } from "@/lib/glossary";
import { supplyLabel } from "@/data/scheduleCalendar";
import type { useCalcResult } from "@/lib/useCalcResult";
import { TYPE_KEYS, TYPE_LABELS, type TypeKey } from "@/lib/useCalcSettings";

type CalcResult = ReturnType<typeof useCalcResult>;

type SegmentKey = "start" | "lesson" | "exam" | "class" | "item" | "support" | "parabo";
type Segment = { key: SegmentKey; label: string; short: string; color: string };

/** ステの内訳（積み上げバーの区分と色）。選抜・授業の呼び名はシナリオで変わる */
function segmentsOf(scenario: CalcResult["scenario"]): Segment[] {
  const exam =
    scenario === "niaMaster"
      ? { label: "オーディション", short: "オーデ" }
      : scenario === "hatsuLegend"
        ? { label: "試験", short: "試験" }
        : { label: "選抜", short: "選抜" };
  const cls = scenario === "niaMaster" ? "営業" : "授業";
  return [
    // 色は淡め（ビビッドだと数字より目立つ）
    { key: "start", label: "開始時（メモリー・Pアイドル・サポカ初期値）", short: "開始", color: "bg-slate-300" },
    { key: "lesson", label: "レッスン", short: "レッスン", color: "bg-sky-300" },
    { key: "exam", label: exam.label, short: exam.short, color: "bg-violet-300" },
    { key: "class", label: cls, short: cls, color: "bg-amber-300" },
    // 初のチャレンジPアイテム（ボイスレコーダーなどの+15×5）。初だけ
    ...(scenario === "hatsuLegend"
      ? [{ key: "item" as const, label: "チャレンジPアイテム", short: "Pアイテム", color: "bg-orange-300" }]
      : []),
    { key: "support", label: "サポカ", short: "サポカ", color: "bg-emerald-300" },
    { key: "parabo", label: "パラボ変換", short: "パラボ", color: "bg-pink-300" },
  ];
}

const TYPE_TEXT: Record<TypeKey, string> = {
  vocal: "text-red-600",
  dance: "text-blue-600",
  visual: "text-yellow-600",
};

/**
 * 「くわしい数字」を開いているか（ブラウザに覚える。初回は閉じた状態）。
 * 2026-11-17 の画面整理で「内訳の数字」から改名し、開始時のステ・SP率・Pポイントなどもここへ入れた（キーも v2 に）
 */
const OPEN_KEY = "gakumas:calc:statsBreakdown:v2";
const readOpen = (): boolean => {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
};
const writeOpen = (open: boolean) => {
  try {
    localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    // 保存できなくても表示は変える
  }
};

/**
 * 育成後のステータス。数字の下に「何で伸びたか」の細い積み上げバー（上限までの割合）を出す。
 * ふだんは3タイプと合計（とシナリオの主な数）だけ。「くわしい数字」を開くと、内訳の表・開始時のステ・SP率・
 * 実現確率・Pポイント・体力が出る（見出しのボタンかバーのクリックで開閉。開閉はブラウザに覚える）。
 * 最低／最高ステの条件を設定しているときは、その位置に印を付ける。
 */
export default function StatsCard({
  r,
  minStats,
  maxStats,
  onOpenParabo,
}: {
  r: CalcResult;
  minStats: Record<TypeKey, number>;
  maxStats: Record<TypeKey, number>;
  /** パラボ変換表を開く（くわしい数字の中から） */
  onOpenParabo: () => void;
}) {
  const cap = r.statCap;
  const segments = segmentsOf(r.scenario);
  const [open, setOpen] = useState(readOpen);
  const toggle = () =>
    setOpen((v) => {
      writeOpen(!v);
      return !v;
    });
  const rows = TYPE_KEYS.map((type) => {
    const p = r.perType[type];
    const detail = r.paraboDetail[type];
    // 「開始時」は画面の「開始時のステータス」と同じ数（メモリー＋Pアイドル＋サポカの初期固定値）。
    // サポカの初期固定値は detail.support に含まれているので、二重に数えないよう差し引く
    const supportInitial = p.startFixed - p.memFixed - p.idolFixed;
    const values: Record<SegmentKey, number> = {
      start: p.startFixed,
      lesson: p.lessonGain,
      exam: p.examGain,
      class: p.classGain,
      item: p.itemGain,
      support: detail.support - supportInitial,
      parabo: detail.conv,
    };
    // バーの目盛り: 上限まで。溢れているときは溢れた分も入るように伸ばす
    const scale = Math.max(cap, p.current);
    return { type, p, values, scale };
  });
  const hasMin = TYPE_KEYS.some((t) => minStats[t] > 0);
  const hasMax = TYPE_KEYS.some((t) => maxStats[t] > 0 && maxStats[t] < cap);
  const markerLegend = (hasMin || hasMax) && (
    <>
      {hasMin && (
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-0.5 bg-emerald-700" />
          最低ステ
        </span>
      )}
      {hasMax && (
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-0.5 bg-red-500" />
          最高ステ
        </span>
      )}
    </>
  );

  return (
    <Card
      title="育成後のステータス"
      hint={<Hint text={`${GLOSSARY.finalStats} ${GLOSSARY.finalStatsCap(cap)}`} />}
      action={
        <button
          type="button"
          onClick={toggle}
          className={BTN_GHOST}
          title="内訳・開始時のステータス・SP率・Pポイント・体力を表示／非表示"
        >
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          くわしい数字
        </button>
      }
    >
      <div className="flex flex-col gap-2.5">
        {rows.map(({ type, p, values, scale }) => {
          const over = p.current > cap;
          const min = minStats[type];
          const max = maxStats[type];
          // 最後の試験の〇ライン（上限より高い線は出さない）
          const okLine = r.okLines[type];
          const okMet = p.current >= Math.min(okLine, cap);
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
                <span
                  className={`text-[10px] font-semibold ${okMet ? "text-emerald-600" : "text-amber-600"}`}
                  title={`最後の試験の〇ライン ${okLine.toLocaleString()}（${okMet ? "超えている" : `あと ${Math.round(okLine - p.current).toLocaleString()}`}）`}
                >
                  〇{okLine.toLocaleString()}{okMet ? "✓" : ""}
                </span>
                {(open || over) && (
                  <span className="w-16 text-right text-xs text-slate-400" title={`上限 ${cap.toLocaleString()} まで`}>
                    {over ? `+${Math.round(p.current - cap).toLocaleString()}超` : `あと ${Math.round(cap - p.current).toLocaleString()}`}
                  </span>
                )}
              </div>
              {/* 内訳バー（クリックで内訳の数字を開閉） */}
              <button
                type="button"
                onClick={toggle}
                title="クリックでくわしい数字を表示／非表示"
                className="relative mt-1 block h-2.5 w-full overflow-hidden rounded-full bg-slate-100 p-0"
              >
                <span className="flex h-full w-full">
                  {segments.map((seg) => {
                    const v = Math.max(0, values[seg.key]);
                    if (v <= 0) return null;
                    return (
                      <span
                        key={seg.key}
                        style={{ width: `${(v / scale) * 100}%` }}
                        className={`block h-full ${seg.color}`}
                        title={`${seg.label} ${Math.round(v).toLocaleString()}`}
                      />
                    );
                  })}
                </span>
                {/* 上限（溢れているときだけ見える）と条件の印 */}
                {over && (
                  <span
                    style={{ left: `${(cap / scale) * 100}%` }}
                    className="absolute top-0 h-full w-0.5 bg-red-600"
                    title={`上限 ${cap}`}
                  />
                )}
                {okLine > 0 && okLine <= scale && (
                  <span
                    style={{ left: `${(okLine / scale) * 100}%` }}
                    className="absolute top-0 h-full w-0.5 bg-amber-500"
                    title={`最後の試験の〇ライン ${okLine.toLocaleString()}`}
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
              </button>
            </div>
          );
        })}
        <div className="flex items-baseline gap-2 border-t border-slate-100 pt-2 tabular-nums">
          <span className="text-xs font-semibold text-slate-500">合計（上限適用後）</span>
          <span className="ml-auto text-2xl font-bold text-blue-600">
            {Math.round(r.cappedSum).toLocaleString()}
          </span>
          {open && <span className="w-16" />}
        </div>
        {open ? (
          /* 内訳の数字（区分ごと）。色の点は上のバーと対応 */
          <div className="rounded-lg bg-slate-50 px-2 py-1">
            <table className="w-full text-[10px] tabular-nums text-slate-600">
              <thead>
                <tr>
                  <th className="py-0.5 text-left font-semibold text-slate-400">内訳</th>
                  {segments.map((seg) => (
                    <th
                      key={seg.key}
                      className="whitespace-nowrap py-0.5 pl-1 text-right font-semibold text-slate-500"
                    >
                      <span className={`mr-0.5 inline-block h-1.5 w-1.5 rounded-sm ${seg.color}`} />
                      {seg.short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ type, values }) => (
                  <tr key={type} className="border-t border-slate-200/70">
                    <td className={`py-0.5 text-left font-bold ${TYPE_TEXT[type]}`}>
                      {TYPE_SHORT[type]}
                    </td>
                    {segments.map((seg) => (
                      <td key={seg.key} className="py-0.5 pl-1 text-right">
                        {Math.round(values[seg.key]).toLocaleString()}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {markerLegend && (
              <div className="mt-1 flex flex-wrap gap-x-2.5 text-[10px] text-slate-500">
                {markerLegend}
              </div>
            )}
          </div>
        ) : null}
      </div>
      {/* 開始時のステータス・SP率・実現確率（くわしい数字を開いたときだけ） */}
      {open && (
        <div className="mt-2">
          <DetailNumbers r={r} onOpenParabo={onOpenParabo} />
        </div>
      )}
      {/* スター性・ファン投票数は評価値に入るのでいつも出す。Pポイント・体力はくわしい数字の中 */}
      <div className="mt-2 flex flex-col gap-0.5 border-t border-slate-100 pt-1.5 text-sm text-slate-500">
        {r.scenario === "hif" && (
          <p>
            合計スター性: <b className="text-violet-600">{r.totalStar}</b>
          </p>
        )}
        {/* N.I.A: ファン投票数の合計と評価値換算（内訳は準備にも） */}
        {r.scenario === "niaMaster" && (
          <p className="flex flex-wrap items-center gap-x-1">
            ファン投票数:{" "}
            <b className="text-violet-600">{(r.scenarioValues.totalVotes ?? 0).toLocaleString()}</b>
            {open && (
              <span className="text-xs text-slate-400">
                （営業 {(r.scenarioValues.votesSales ?? 0).toLocaleString()}・1次2次{" "}
                {(r.scenarioValues.votesAuditions ?? 0).toLocaleString()}・最終{" "}
                {(r.scenarioValues.votesFinale ?? 0).toLocaleString()}・札{" "}
                {(r.scenarioValues.votesFuda ?? 0).toLocaleString()}）
              </span>
            )}
            → 評価値換算{" "}
            <b className="text-blue-600">{(r.scenarioValues.fanValue ?? 0).toLocaleString()}</b>
          </p>
        )}
        {open && (
          <>
        {/* サポカ由来のPポイントだけ（固定P・前イベP・P率換算・タイプSPレッスンP率） */}
        <p className="flex flex-wrap items-center gap-x-1">
          Pポイント（サポカ分）:{" "}
          <b className="text-cyan-700">{Math.round(r.resources.pCards).toLocaleString()}</b>
          <Hint text={GLOSSARY.pCards} />
        </p>
        {/* サポカ＋H.I.Fボーナス＋親愛度＋メモリー＋差し入れ（初は活動支給）を1行に */}
        <p className="flex flex-wrap items-center gap-x-1">
          Pポイント:{" "}
          <b className="text-cyan-700">{Math.round(r.resources.pBase).toLocaleString()}</b>
          <span className="text-xs text-slate-400">
            （サポカ {Math.round(r.resources.pCards).toLocaleString()}・レッスン{" "}
            {r.resources.pLessonTotal.toLocaleString()}
            {r.scenario === "hif" && `・H.I.Fボーナス ${r.resources.pHifBonus}`}・親愛度{" "}
            {r.resources.pAffection}・メモリー{" "}
            {Math.round(r.resources.pMemory).toLocaleString()}・{supplyLabel(r.scenario)}{" "}
            {r.resources.pSupply.toLocaleString()}
            {r.scenario === "niaMaster" && `・Pポイント営業 ${r.resources.pSales.toLocaleString()}`}）
          </span>
          <Hint text={GLOSSARY.pTotal} />
        </p>
        <p>
          体力: <b className="text-emerald-700">{Math.round(r.resources.hpTotal)}</b>
        </p>
          </>
        )}
      </div>
    </Card>
  );
}
