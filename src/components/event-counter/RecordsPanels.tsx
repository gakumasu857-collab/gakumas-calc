/**
 * イベントカウンターの記録・統計まわりのUIパネル。
 * ロジックは lib/eventCounter（tracker/stats/store）側にあり、ここは表示だけ。
 */
import { useMemo, useState } from "react";
import { Download, Pause, Play, Trash2 } from "lucide-react";
import {
  selectRuns,
  summarize,
  toCsvRows,
  type Summary,
} from "@/lib/eventCounter/stats";
import type { StoredRun, Team } from "@/lib/eventCounter/store";
import {
  EVENT_LABELS,
  FINALS,
  KINDS_ORDER,
  QUALIFIER,
  STAGE_LABELS,
  type EventKind,
  type ProduceRun,
  type Stage,
} from "@/lib/eventCounter/tracker";

const cardLabel = (team: Team | null, index: number | null): string => {
  if (index === null) return "？";
  return team?.names[index] || `サポカ${index + 1}`;
};

/** 記録の状態＋今の育成＋お知らせログ */
export function TrackerStatusPanel({
  stateLabel,
  run,
  paused,
  capturing,
  log,
  onTogglePause,
  onDropRun,
}: {
  stateLabel: string;
  run: ProduceRun | null;
  paused: boolean;
  capturing: boolean;
  log: string[];
  onTogglePause: () => void;
  onDropRun: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
            !capturing
              ? "bg-slate-100 text-slate-400"
              : paused
                ? "bg-amber-100 text-amber-700"
                : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {capturing ? stateLabel : "キャプチャ停止中"}
        </span>
        <button
          type="button"
          onClick={onTogglePause}
          disabled={!capturing}
          className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
        >
          {paused ? <Play size={12} /> : <Pause size={12} />}
          {paused ? "記録を再開" : "記録を止める"}
        </button>
        {run ? (
          <span className="text-xs text-slate-500">
            今の育成:
            <b className="mx-1 text-slate-700">
              {run.stage ? (STAGE_LABELS[run.stage] ?? "?") : "手動"}
            </b>
            {run.turns}日目／イベント{run.events.length}件
          </span>
        ) : (
          <span className="text-xs text-slate-400">
            育成は始まっていません（開始確認画面か日数表示を検出すると自動で始まります）
          </span>
        )}
        {run && (
          <button
            type="button"
            onClick={onDropRun}
            className="ml-auto flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-500 transition hover:bg-red-50"
          >
            <Trash2 size={12} />
            今の育成を捨てる
          </button>
        )}
      </div>
      {log.length > 0 && (
        <ul className="mt-2 max-h-24 space-y-0.5 overflow-y-auto border-t border-slate-100 pt-2 text-[11px] leading-relaxed text-slate-500">
          {log.map((line, i) => (
            <li key={`${i}-${line}`}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 今の育成のイベント一覧（削除つき） */
export function CurrentEventsPanel({
  run,
  team,
  onDeleteEvent,
}: {
  run: ProduceRun | null;
  team: Team | null;
  onDeleteEvent: (index: number) => void;
}) {
  if (!run || run.events.length === 0) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <h3 className="mb-1.5 text-xs font-bold text-slate-700">
        今の育成のイベント
      </h3>
      <table className="w-full text-xs tabular-nums">
        <tbody>
          {run.events.map((event, i) => (
            <tr key={i} className="border-t border-slate-100">
              <td className="py-1 font-semibold text-slate-700">
                {EVENT_LABELS[event.kind] ?? event.kind}
              </td>
              <td className="py-1 text-slate-500">
                {cardLabel(team, event.card)}
              </td>
              <td className="py-1 text-right text-slate-500">
                {event.turn}日目
              </td>
              <td className="py-1 text-right text-slate-400">
                {event.manual ? "手動" : event.score.toFixed(3)}
              </td>
              <td className="w-8 py-1 text-right">
                <button
                  type="button"
                  onClick={() => onDeleteEvent(i)}
                  title="このイベントを削除"
                  className="text-slate-300 transition hover:text-red-500"
                >
                  <Trash2 size={13} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 記録一覧（この編成の育成たち） */
export function RunListPanel({
  runs,
  onDelete,
}: {
  runs: StoredRun[];
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (runs.length === 0) return null;
  const shown = open ? [...runs].reverse() : [...runs].reverse().slice(0, 5);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <h3 className="mb-1.5 flex items-center gap-2 text-xs font-bold text-slate-700">
        記録一覧（{runs.length}育成）
        {runs.length > 5 && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="text-[11px] font-semibold text-blue-600 hover:underline"
          >
            {open ? "たたむ" : "すべて見る"}
          </button>
        )}
      </h3>
      <table className="w-full text-xs tabular-nums">
        <tbody>
          {shown.map((run) => (
            <tr key={run.id} className="border-t border-slate-100">
              <td className="py-1 text-slate-500">
                {new Date(run.started * 1000).toLocaleString("ja-JP", {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </td>
              <td className="py-1 font-semibold text-slate-700">
                {run.stage ? (STAGE_LABELS[run.stage] ?? "?") : "手動"}
              </td>
              <td className="py-1 text-right text-slate-500">{run.turns}日</td>
              <td className="py-1 text-right text-slate-500">
                イベント{run.events.length}件
              </td>
              <td className="py-1 text-right">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    run.completed
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {run.completed ? "完走" : "中断"}
                </span>
              </td>
              <td className="w-8 py-1 text-right">
                <button
                  type="button"
                  onClick={() => onDelete(run.id)}
                  title="この記録を削除"
                  className="text-slate-300 transition hover:text-red-500"
                >
                  <Trash2 size={13} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 統計（発生率・CSV出力） */
export function StatsPanel({
  runs,
  team,
}: {
  runs: StoredRun[];
  team: Team | null;
}) {
  const [stage, setStage] = useState<Stage | null>(null);
  const [includeIncomplete, setIncludeIncomplete] = useState(true);

  const selected = useMemo(
    () => selectRuns(runs, includeIncomplete, stage),
    [runs, includeIncomplete, stage],
  );
  const summary: Summary = useMemo(() => summarize(selected), [selected]);

  const downloadCsv = () => {
    const rows = toCsvRows(summary, team?.names);
    const csv =
      "﻿" +
      rows
        .map((row) =>
          row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","),
        )
        .join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `event-counter-stats-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (runs.length === 0) return null;
  const kindLabels: Record<EventKind, string> = {
    pre: "前イベ",
    post: "後イベ",
    status: "ステイベ",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-bold text-slate-700">統計</h3>
        <div className="flex overflow-hidden rounded-lg border border-slate-300 text-[11px] font-semibold">
          {(
            [
              [null, "選抜+本戦"],
              [QUALIFIER, "選抜のみ"],
              [FINALS, "本戦のみ"],
            ] as [Stage | null, string][]
          ).map(([value, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => setStage(value)}
              className={`px-2 py-1 transition ${
                stage === value
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-500 hover:bg-slate-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-[11px] text-slate-500">
          <input
            type="checkbox"
            checked={includeIncomplete}
            onChange={(e) => setIncludeIncomplete(e.target.checked)}
            className="accent-blue-600"
          />
          中断も含める
        </label>
        <span className="text-[11px] text-slate-400">
          {summary.runs}育成（完走{summary.completed}）／平均
          {summary.avgTurns.toFixed(1)}日
        </span>
        <button
          type="button"
          onClick={downloadCsv}
          className="ml-auto flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100"
        >
          <Download size={12} />
          CSV出力
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-xs tabular-nums">
          <thead>
            <tr className="text-[10px] text-slate-400">
              <th className="py-1 text-left font-normal">サポカ</th>
              {KINDS_ORDER.map((kind) => (
                <th key={kind} colSpan={2} className="py-1 font-normal">
                  {kindLabels[kind]}（率 / 回）
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summary.perCard.map((entry) => (
              <tr key={entry.card} className="border-t border-slate-100">
                <td className="max-w-32 truncate py-1 text-slate-600">
                  {cardLabel(team, entry.card)}
                </td>
                {KINDS_ORDER.map((kind) => (
                  <td
                    key={kind}
                    colSpan={2}
                    className="py-1 text-center text-slate-600"
                  >
                    {entry[kind].count > 0 ? (
                      <>
                        <b className="text-blue-700">
                          {(entry[kind].rate * 100).toFixed(0)}%
                        </b>
                        <span className="text-slate-400">
                          {" "}
                          / {entry[kind].count}回
                          {entry[kind].avgTurn !== null &&
                            `（平均${entry[kind].avgTurn.toFixed(1)}日目）`}
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-slate-200">
              <td className="py-1 font-semibold text-slate-500">(全体)</td>
              {KINDS_ORDER.map((kind) => (
                <td
                  key={kind}
                  colSpan={2}
                  className="py-1 text-center text-slate-600"
                >
                  {summary.perKind[kind].count > 0 ? (
                    <>
                      <b className="text-blue-700">
                        {(summary.perKind[kind].rate * 100).toFixed(0)}%
                      </b>
                      <span className="text-slate-400">
                        {" "}
                        / {summary.perKind[kind].count}回
                      </span>
                    </>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[10px] text-slate-400">
        発生率は「1回の育成で1回でも起きる確率」の推定値。中断した育成は「そのターンまで見ていた」データとして計算に入れています（Kaplan-Meier法）。
      </p>
    </div>
  );
}
