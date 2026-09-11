import { ArrowRight, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { SCENARIO_LABELS } from "@/data/scenarios";
import type { useCalcResult } from "@/lib/useCalcResult";

type CalcResult = ReturnType<typeof useCalcResult>;

/** 「所持状況は入力せず、全サポカ完凸のまま進む」を選んだ印（ブラウザに保存） */
const ACK_KEY = "gakumas:setup:ownershipAck:v1";

export function readOwnershipAck(): boolean {
  try {
    return localStorage.getItem(ACK_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeOwnershipAck(): void {
  try {
    localStorage.setItem(ACK_KEY, "1");
  } catch {
    /* 保存できない環境では毎回聞くだけ */
  }
}

/** 所持状況を一度でも触ったか（初期値は全サポカ4凸なので、4以外があれば入力済み） */
export function ownershipCustomized(levels: Record<string, number>): boolean {
  return Object.values(levels).some((v) => v !== 4);
}

const LINK =
  "inline-flex items-center gap-0.5 rounded-md bg-blue-600 px-2 py-0.5 text-[11px] font-bold text-white transition hover:bg-blue-500";
const LINK_SUB =
  "inline-flex items-center gap-0.5 rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100";

/**
 * 計算ページ上部の準備バー。「①所持状況 → ②育成の前提 → ③メモリー」の済・未を常に見せ、
 * 未設定の項目はその場から埋められる（ページ遷移はいちばん少なく）。
 */
export default function SetupBar({
  r,
  ack,
  onAck,
  onOpenScenario,
  onOpenIdol,
  onOpenSet,
  onOpenMemory,
}: {
  r: CalcResult;
  /** 「全完凸のまま進む」を選んだか */
  ack: boolean;
  onAck: () => void;
  onOpenScenario: () => void;
  onOpenIdol: () => void;
  onOpenSet: () => void;
  onOpenMemory: () => void;
}) {
  const settings = r.calc.settings;
  const levels = r.ownedLevels.levels;
  const customized = ownershipCustomized(levels);
  const ownedCount = Object.values(levels).filter((v) => v >= 0).length;
  const totalCount = Object.keys(levels).length;
  const ownershipOk = customized || ack;

  const scenarioOk = r.scenarioStore.chosen;
  const idolOk = !!(settings.pIdol && r.pMaster);
  const setOk = !!r.selectedSet;
  const premiseOk = scenarioOk && idolOk && setOk;
  const memoryOk = r.memoryStore.selected.length > 0;
  const allOk = ownershipOk && premiseOk && memoryOk;

  return (
    <div
      className={`flex flex-wrap items-stretch gap-x-3 gap-y-2 rounded-xl border px-3 py-2 ${
        allOk
          ? "border-emerald-200 bg-emerald-50/60"
          : "border-amber-300 bg-amber-50"
      }`}
    >
      <span className="self-center text-xs font-bold text-slate-700">準備</span>

      <Step
        no={1}
        ok={ownershipOk}
        label="所持状況"
        status={
          customized
            ? `登録済み（所持 ${ownedCount}/${totalCount}枚）`
            : ack
              ? "全サポカ完凸として計算"
              : "未入力"
        }
      >
        {customized ? (
          <Link to="/support" className={LINK_SUB}>
            変更
          </Link>
        ) : (
          <>
            <Link to="/support" className={LINK}>
              入力する
              <ArrowRight size={11} />
            </Link>
            {!ack && (
              <button type="button" onClick={onAck} className={LINK_SUB}>
                全完凸のまま進む
              </button>
            )}
          </>
        )}
      </Step>

      <Step
        no={2}
        ok={premiseOk}
        label="育成の前提"
        status={
          premiseOk
            ? `${SCENARIO_LABELS[r.scenario]} ／ ${settings.idol} ／ ${r.selectedSet?.name ?? ""}`
            : "未選択あり"
        }
      >
        {!scenarioOk && (
          <button type="button" onClick={onOpenScenario} className={LINK}>
            シナリオを選ぶ
          </button>
        )}
        {!idolOk && (
          <button type="button" onClick={onOpenIdol} className={LINK}>
            Pアイドルを選ぶ
          </button>
        )}
        {!setOk && (
          <button type="button" onClick={onOpenSet} className={LINK}>
            育成パターンを選ぶ
          </button>
        )}
      </Step>

      <Step
        no={3}
        ok={memoryOk}
        label="メモリー"
        status={memoryOk ? `${r.memoryStore.selected.length}枚` : "未設定"}
      >
        <button
          type="button"
          onClick={onOpenMemory}
          className={memoryOk ? LINK_SUB : LINK}
        >
          {memoryOk ? "変更" : "設定する"}
        </button>
      </Step>

      <span className="ml-auto self-center text-[11px] text-slate-500">
        {allOk
          ? "準備OK。青いボタンで求められます"
          : "3つそろうと自動探索できます"}
      </span>
    </div>
  );
}

function Step({
  no,
  ok,
  label,
  status,
  children,
}: {
  no: number;
  ok: boolean;
  label: string;
  status: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${
          ok ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
        }`}
        aria-label={ok ? "完了" : "未完了"}
      >
        {ok ? <Check size={12} strokeWidth={3} /> : no}
      </span>
      <span className="text-xs font-bold text-slate-800">{label}</span>
      <span
        className={`max-w-56 truncate text-[11px] ${ok ? "text-slate-500" : "font-bold text-amber-700"}`}
        title={status}
      >
        {status}
      </span>
      {children && <span className="flex items-center gap-1">{children}</span>}
    </div>
  );
}
