import { useState } from "react";
import { ChevronDown, ClipboardCopy, Settings, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY } from "@/components/ui";

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
  diagLog?: string | null;
};

/** 探索ボタンに必要なもの（操作パネルとスマホの下バーで共通） */
export type RunHandlers = {
  busy: boolean;
  ready: boolean;
  notReadyTitle?: string;
  onRun: () => void;
  onFormationOnly: () => void;
  onPlanOnly: () => void;
};

/**
 * 主役ボタン「理想の編成と踏み方を求める」＋ ▾（編成だけ／踏み方だけ）。
 * PCの操作パネルとスマホの下バーで共用する（下バーでは一覧を上へ開く）。
 */
export function RunButtons({
  busy,
  ready,
  notReadyTitle,
  onRun,
  onFormationOnly,
  onPlanOnly,
  menuUp = false,
  className = "",
}: RunHandlers & { menuUp?: boolean; className?: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className={`flex items-stretch ${className}`}>
      <button
        type="button"
        onClick={onRun}
        disabled={busy || !ready}
        title={notReadyTitle}
        className={`${BTN_PRIMARY} min-w-0 flex-1 justify-center rounded-r-none`}
      >
        <Sparkles size={15} className="shrink-0" />
        <span className="min-w-0 truncate">
          {busy ? "計算中…" : "理想の編成と踏み方を求める"}
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
          <ChevronDown size={14} className={menuUp ? "rotate-180" : ""} />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
            <div
              role="menu"
              className={`absolute right-0 z-30 w-72 rounded-lg border border-slate-200 bg-white p-1 text-left shadow-lg ${
                menuUp ? "bottom-full mb-1" : "top-full mt-1"
              }`}
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
 * 操作パネル（「育成の前提」のすぐ下＝前提を入れたらそのまま押す）。
 * PCでは主役ボタン＋「探索の条件」をここに出す。スマホではボタンは画面下のバー
 * （MobileActionBar）にあるので、ここには所持状況の注記と直近の探索の内訳だけを出す。
 */
export default function ActionPanel({
  busy,
  ready,
  missingInputs,
  notReadyTitle,
  ownershipUnset,
  status,
  onRun,
  onFormationOnly,
  onPlanOnly,
  onConditions,
}: RunHandlers & {
  missingInputs: string[];
  /** 所持状況ページをまだ開いていない（全サポカ完凸で計算中） */
  ownershipUnset: boolean;
  status: RunStatus | null;
  onConditions: () => void;
}) {
  const [logShown, setLogShown] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyLog = () => {
    const log = status?.diagLog;
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

  const delta =
    status && status.before != null && status.after != null
      ? status.after - status.before
      : null;
  // 注記も内訳も無いときはスマホでは何も出さない（PCはボタンがあるので常に出す）
  const hasBody = ownershipUnset || !!status;

  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white p-3 ${hasBody ? "" : "hidden lg:block"}`}
    >
      {/* ボタン列はPCだけ（スマホは画面下のバーに同じボタンがある） */}
      <div className="hidden lg:block">
        <RunButtons
          busy={busy}
          ready={ready}
          notReadyTitle={notReadyTitle}
          onRun={onRun}
          onFormationOnly={onFormationOnly}
          onPlanOnly={onPlanOnly}
        />
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onConditions}
            className={`${BTN_SECONDARY} shrink-0`}
            title="タイプ割合・最低/最高ステ・SP率持ち・取得回数・試験補助など"
          >
            <Settings size={13} />
            探索の条件
          </button>
          {!ready && (
            <p className="text-[11px] font-semibold text-amber-600">
              「育成の前提」で {missingInputs.join("・")} を選ぶと押せます
            </p>
          )}
        </div>
      </div>

      {hasBody && (
        <div className="flex flex-col gap-1.5 lg:mt-2">
          {ownershipUnset && (
            <p className="text-[11px] text-amber-700">
              所持状況が未入力です（全サポカ完凸で計算）
              <Link to="/support" className="ml-1 font-bold underline">
                入力する
              </Link>
            </p>
          )}

          {/* 直近の探索の内訳 */}
          {status && (
            <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600">
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
                      今の評価値を下回ったため変更なし
                    </span>
                  )}
                </p>
              )}
              {status.notes?.map((n) => (
                <p key={n} className="text-amber-700">
                  ・{n}
                </p>
              ))}
              {status.diagLog && (
                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={copyLog}
                    className={`${BTN_GHOST} -ml-2`}
                    title="今の設定・踏み方・メモリー・発動回数・所持状況と探索結果をJSONでコピーします（結果に納得できないときに送ってください）"
                  >
                    <ClipboardCopy size={12} />
                    診断ログをコピー
                  </button>
                  {copied && <span className="text-emerald-600">コピーしました</span>}
                </div>
              )}
              {logShown && status.diagLog && (
                <textarea
                  readOnly
                  value={status.diagLog}
                  onFocus={(e) => e.currentTarget.select()}
                  className="mt-1 h-24 w-full rounded-lg border border-slate-300 bg-white p-2 font-mono text-[10px] text-slate-600"
                  title="コピーできなかったので本文を表示しています。全選択してコピーしてください"
                />
              )}
            </div>
          )}
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
