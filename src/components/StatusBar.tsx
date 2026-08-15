import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import ScoreDetailModal from "@/components/ScoreDetailModal";
import SupportPickerModal from "@/components/calc/SupportPickerModal";
import { SUPPORT_CARD_DB } from "@/data/supportCardsDb";
import { imageUrl } from "@/lib/config";
import { sumEventContrib } from "@/lib/formation";
import { useStoreVersion } from "@/lib/storeSync";
import {
  useCalcResult,
  type PerTypeResult,
  type SelectedMember,
} from "@/lib/useCalcResult";
import { useCardFlags } from "@/lib/useCardFlags";
import { TYPE_KEYS, type TypeKey } from "@/lib/useCalcSettings";

const CARD_BY_ID = new Map(SUPPORT_CARD_DB.map((c) => [c.id, c]));

const TYPE_JA: Record<TypeKey, string> = {
  vocal: "Vo",
  dance: "Da",
  visual: "Vi",
};
const TYPE_CHIP: Record<TypeKey, string> = {
  vocal: "bg-red-100 text-red-700",
  dance: "bg-blue-100 text-blue-700",
  visual: "bg-yellow-100 text-yellow-700",
};

type Snapshot = {
  perType: Record<TypeKey, PerTypeResult>;
  cappedSum: number;
  rating: number;
  members: (SelectedMember | null)[];
  statCap: number;
};

/**
 * 再読込中（ストアのlocalStorage読み込みが済むまで）の値ちらつきを防ぐため、
 * 最後に表示した確定値をモジュール変数に保持しておく。
 */
let lastSnapshot: Snapshot | null = null;

/**
 * 全ページ下部に常駐する「現在のステ・評価値・選択サポカ」バー。
 * どのページでストアが更新されても再読込して追従する。計算ページでは控えめ表示。
 */
export default function StatusBar() {
  // ストア更新のたびに key が変わり、localStorage を読み直す
  const version = useStoreVersion();
  return <StatusBarInner key={version} />;
}

function StatusBarInner() {
  const r = useCalcResult();
  const flags = useCardFlags();
  const pathname = useLocation().pathname;
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [detail, setDetail] = useState<SelectedMember | null>(null);

  const allLoaded =
    r.levelsLoaded &&
    r.calc.loaded &&
    r.schedule.loaded &&
    r.scenarioStore.loaded &&
    r.niaSchedule.loaded &&
    r.hatsuSchedule.loaded &&
    r.memoryStore.loaded &&
    r.ability.loaded &&
    r.pIdols.loaded &&
    r.selected.loaded &&
    r.events.loaded;

  const live: Snapshot = {
    perType: r.perType,
    cappedSum: r.cappedSum,
    rating: r.rating,
    members: r.members,
    statCap: r.statCap,
  };
  // 読み込み完了までは前回の確定値を表示してちらつきを防ぐ
  const shown = allLoaded ? live : (lastSnapshot ?? live);
  useEffect(() => {
    if (allLoaded) lastSnapshot = live;
  });

  // 計算ページ（/calc）では同じ情報がページ内にあるので表示しない
  if (pathname === "/calc") return null;

  const activeMembers = shown.members.filter(
    (m): m is SelectedMember => m !== null,
  );

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-300 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 text-sm">
          {/* 現在のステ（上限まであとどれくらいかも表示） */}
          {TYPE_KEYS.map((type) => {
            const p = shown.perType[type];
            const remain = shown.statCap - p.current;
            return (
              <span
                key={type}
                className="flex flex-col items-center leading-tight"
              >
                <span
                  className={`rounded px-2 py-0.5 text-base font-bold tabular-nums ${TYPE_CHIP[type]}`}
                >
                  {TYPE_JA[type]} {Math.round(p.current).toLocaleString()}
                </span>
                <span
                  className={`text-[10px] tabular-nums ${remain < 0 ? "text-amber-500" : "text-slate-400"}`}
                >
                  {remain >= 0
                    ? `あと${Math.round(remain).toLocaleString()}`
                    : `超過${Math.round(-remain).toLocaleString()}`}
                </span>
              </span>
            );
          })}
          <span className="flex flex-col items-center leading-tight">
            <span className="rounded bg-slate-100 px-2 py-0.5 text-base font-bold tabular-nums text-slate-700">
              合計 {Math.round(shown.cappedSum).toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-400">上限適用後</span>
          </span>

          {/* 選択サポカ（画像クリックで変更・点数クリックで詳細） */}
          <span className="flex items-center gap-2 pl-1">
            {shown.members.map((member, i) => {
              if (!member) {
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPickerSlot(i)}
                    title={`スロット${i + 1}: クリックで選択`}
                    className="flex h-11 w-22 items-center justify-center rounded-md border-2 border-dashed border-slate-300 text-sm font-bold text-slate-300 transition hover:border-blue-400 hover:text-blue-400"
                  >
                    ＋
                  </button>
                );
              }
              const url = imageUrl(member.image);
              return (
                <span key={i} className="relative">
                  <button
                    type="button"
                    onClick={() => setPickerSlot(i)}
                    title={`${member.name}（${member.level}凸${member.rental ? "・レンタル" : ""}）クリックで変更`}
                    className="block overflow-hidden rounded-md ring-1 ring-slate-200 transition hover:ring-blue-400"
                  >
                    {url ? (
                      <img
                        src={url}
                        alt={member.name}
                        loading="lazy"
                        className="h-11 w-22 object-cover"
                      />
                    ) : (
                      <span className="flex h-11 w-22 items-center justify-center bg-slate-100 p-0.5 text-center text-[9px] leading-tight text-slate-500">
                        {member.name}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetail(member)}
                    title="クリックで内訳を表示"
                    className="absolute -bottom-1 -right-1 rounded bg-white/95 px-1 text-[11px] font-bold tabular-nums text-blue-600 ring-1 ring-slate-200 hover:text-blue-500"
                  >
                    +{Math.round(member.points + member.synergy)}
                  </button>
                </span>
              );
            })}
          </span>

          {/* 評価値（クリックで計算ページへ） */}
          <Link
            to="/calc"
            className="ml-auto flex items-baseline gap-1.5"
            title="計算ページを開く"
          >
            <span className="text-xs font-semibold text-slate-400">評価値</span>
            <b className="text-2xl font-bold tabular-nums text-blue-600">
              {shown.rating.toLocaleString()}
            </b>
          </Link>
        </div>
      </div>

      {/* モーダルは backdrop-blur の外に置く（中に置くと fixed の基準がバーになり表示が壊れる） */}
      {pickerSlot !== null && (
        <SupportPickerModal
          slotIndex={pickerSlot}
          usedIds={
            new Set(
              r.selected.slots
                .filter((s, i) => s && i !== pickerSlot)
                .map((s) => s!.id),
            )
          }
          ctx={r.ctx}
          typeRole={r.roles.typeRole}
          plan={r.plan}
          rentalNg={flags.rentalNg}
          getLevel={r.getLevel}
          onPick={(entry) => {
            r.selected.setSlot(pickerSlot, entry);
            setPickerSlot(null);
          }}
          onClose={() => setPickerSlot(null)}
        />
      )}

      {/* カードの最終ステータス詳細 */}
      {detail &&
        r.roles.typeRole[detail.type] &&
        CARD_BY_ID.get(detail.id) && (
          <ScoreDetailModal
            card={CARD_BY_ID.get(detail.id)!}
            level={detail.level}
            role={r.roles.typeRole[detail.type]!}
            ctx={r.ctx}
            extraCounts={sumEventContrib(activeMembers)}
            rental={detail.rental}
            onClose={() => setDetail(null)}
          />
        )}
    </>
  );
}
