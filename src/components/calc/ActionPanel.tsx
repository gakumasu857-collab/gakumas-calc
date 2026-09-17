import { useState } from "react";
import { ArrowDown, ChevronDown, Settings, Sparkles } from "lucide-react";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/ui";

/** 直近の探索の状況（1行で出す。結果そのものは編成・踏み方・評価値に出る） */
export type RunStatus = {
  /** 短い通知（編成だけ／踏み方だけ／エラーなど） */
  message?: string;
  evaluated?: number;
  elapsedMs?: number;
  before?: number | null;
  after?: number;
  /** 探索結果が今の評価値を下回ったため反映しなかった */
  kept?: boolean;
  notes?: string[];
};

type RunHandlers = {
  busy: boolean;
  ready: boolean;
  notReadyTitle?: string;
  onRun: () => void;
  onFormationOnly: () => void;
  onPlanOnly: () => void;
};

/** 主役ボタン「理想の編成と踏み方を求める」＋ ▾（編成だけ／踏み方だけ） */
function RunButtons({
  busy,
  ready,
  notReadyTitle,
  highlight,
  onRun,
  onFormationOnly,
  onPlanOnly,
}: RunHandlers & {
  /** 初回（前提がそろって、まだ一度も押していない）は光らせる */
  highlight: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div
      className={`flex min-w-0 flex-1 items-stretch rounded-lg ${
        highlight ? "shadow-[0_0_0_4px_rgba(147,197,253,0.7)]" : ""
      }`}
    >
      <button
        type="button"
        onClick={onRun}
        disabled={busy || !ready}
        title={notReadyTitle}
        className={`${BTN_PRIMARY} min-w-0 flex-1 justify-center rounded-r-none`}
      >
        <Sparkles size={15} className="shrink-0" />
        <span className="min-w-0 text-center leading-tight sm:truncate">
          {busy ? "計算中…" : "評価値が最も高くなる編成と踏み方を求める"}
        </span>
      </button>
      <div className="relative flex">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          disabled={busy || !ready}
          title="編成だけ／踏み方だけを最適化"
          aria-label="そのほかの探索"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className={`${BTN_PRIMARY} rounded-l-none border-l border-blue-400 px-2`}
        >
          <ChevronDown size={14} />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
            <div
              role="menu"
              className="absolute right-0 top-full z-30 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-1 text-left shadow-lg"
            >
              <MenuItem
                title="今の踏み方のまま、サポカ編成だけ"
                desc="レッスンの踏み方は変えずに6枚を選び直す"
                onClick={() => {
                  setMenuOpen(false);
                  onFormationOnly();
                }}
              />
              <MenuItem
                title="今のサポカ編成のまま、踏み方だけ"
                desc="6枚は変えずにレッスン・授業（営業）・選抜の配分を最適化"
                onClick={() => {
                  setMenuOpen(false);
                  onPlanOnly();
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 操作パネル（「設定欄」のすぐ下＝設定を入れたらそのまま押す。PC・スマホ共通）。
 * 主役ボタン＋▾と「条件設定」を同じ行に。前提がそろって初めて押すまでは、動く矢印で押す場所を示す
 * （所持状況が未入力なら「全完凸の想定で探索できる」ことと入力先を一緒に案内する）。
 * 下に所持状況の注記と、直近の探索の内訳（何通り・何秒・前後の評価値）。
 * 診断ログ（JSONのコピー）はデバッグページ（/debug）にある。
 */
export default function ActionPanel({
  busy,
  ready,
  missingInputs,
  notReadyTitle,
  showArrow,
  status,
  onRun,
  onFormationOnly,
  onPlanOnly,
  onConditions,
}: RunHandlers & {
  missingInputs: string[];
  /** 前提がそろっていて、まだ一度も探索を押していない */
  showArrow: boolean;
  status: RunStatus | null;
  onConditions: () => void;
}) {
  const delta =
    status && status.before != null && status.after != null
      ? status.after - status.before
      : null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3">
      {showArrow && (
        <p className="mb-2 flex items-start gap-1.5 text-sm font-bold text-blue-700">
          <ArrowDown size={18} className="mt-0.5 shrink-0 animate-bounce" />
          <span>あなたの手持ちに合ったサポカ編成と踏み方を求めます</span>
        </p>
      )}
      <div className="flex items-stretch gap-2">
        <RunButtons
          busy={busy}
          ready={ready}
          notReadyTitle={notReadyTitle}
          highlight={showArrow}
          onRun={onRun}
          onFormationOnly={onFormationOnly}
          onPlanOnly={onPlanOnly}
        />
        <button
          type="button"
          onClick={onConditions}
          className={`${BTN_SECONDARY} shrink-0`}
          title="条件設定（SP率持ちの枚数・タイプ割合・試験補助・ステージ用BAN・最低/最高ステなど）"
        >
          <Settings size={14} />
          {/* 幅の狭い画面では主役ボタンの文字を切らないよう、アイコンだけにする（説明は title） */}
          <span className="hidden sm:inline">条件設定</span>
        </button>
      </div>
      {!ready && (
        <p className="mt-1.5 text-[11px] font-semibold text-amber-600">
          上の「設定欄」で {missingInputs.join("・")} を選択してください
        </p>
      )}

      {/* 直近の探索の内訳 */}
      {status && (
        <div className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600">
          {status.message ? (
            <p className="font-semibold text-slate-700">{status.message}</p>
          ) : (
            <p className="tabular-nums">
              前回の探索:{" "}
              {status.evaluated !== undefined && <b>{status.evaluated.toLocaleString()}通り</b>}
              {status.elapsedMs !== undefined && `・${(status.elapsedMs / 1000).toFixed(1)}秒`}
              {status.before != null && status.after != null && (
                <>
                  {" ／ "}
                  {status.before.toLocaleString()} → {status.after.toLocaleString()}
                  {delta !== null && (
                    <span className={delta >= 0 ? "text-emerald-600" : "text-red-600"}>
                      （{delta >= 0 ? "+" : ""}
                      {delta.toLocaleString()}）
                    </span>
                  )}
                </>
              )}
              {status.kept && (
                <span className="ml-1 font-semibold text-slate-700">
                  現在の評価値を下回ったため変更なし
                </span>
              )}
            </p>
          )}
          {status.notes?.map((n) => (
            <p key={n} className="text-amber-700">
              ・{n}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

/** 分割メニュー（▾）の1項目 */
function MenuItem({
  title,
  desc,
  onClick,
}: {
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-md px-3 py-2 text-left transition hover:bg-slate-100"
    >
      <span className="block text-xs font-bold text-slate-800">{title}</span>
      <span className="block text-[11px] text-slate-500">{desc}</span>
    </button>
  );
}
