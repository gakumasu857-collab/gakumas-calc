import Modal from "@/components/Modal";
import type { SupportCardData } from "@/data/supportCardsDb";
import {
  sheetScoreBreakdown,
  type SheetRole,
  type SheetScoreContext,
} from "@/lib/sheetScore";

/** ロール→タイプ表記（ユーザー向け表示。内部のメイン/サブ語は出さない） */
const ROLE_TYPE_SHORT: Record<SheetRole, string> = {
  main1: "Vo",
  main2: "Da",
  sub: "Vi",
};
/** 回数キーの内部表記をタイプ表記へ（例: メイン1レッスン → Voレッスン） */
const displayCountKey = (key: string) =>
  key.replace(/^メイン1/, "Vo").replace(/^メイン2/, "Da").replace(/^サブ/, "Vi");

/** 数値表示（小数は1桁まで） */
const fmt = (n: number) =>
  (Number.isInteger(n) ? n : Math.round(n * 10) / 10).toLocaleString();

/**
 * サポカ1枚の点数内訳モーダル。
 * extraCounts（編成の前イベ・後イベによる回数上乗せ）を渡すと、
 * イベント相互作用込みの「最終的なステータス詳細」になる。
 */
export default function ScoreDetailModal({
  card,
  level,
  role,
  ctx,
  extraCounts,
  rental,
  onClose,
}: {
  card: SupportCardData;
  level: number;
  role: SheetRole;
  ctx: SheetScoreContext;
  extraCounts?: Record<string, number>;
  rental?: boolean;
  onClose: () => void;
}) {
  const bd = sheetScoreBreakdown(card, level, role, ctx, extraCounts);
  const withEvents = extraCounts !== undefined;
  const th =
    "border-b-2 border-r border-slate-300 bg-slate-100 px-2 py-1.5 font-bold text-slate-700";
  const td = "border-b border-r border-slate-200 px-2 py-1.5";
  return (
    <Modal
      title={`${card.name}｜${level}凸${rental ? "（レンタル）" : ""}・${ROLE_TYPE_SHORT[role]}${withEvents ? "・イベント補正込み" : ""}の内訳`}
      onClose={onClose}
      widthClass="max-w-3xl"
    >
      {bd ? (
        <div className="flex flex-col gap-3">
          <table className="w-full border-separate border-spacing-0 text-[13px] tabular-nums">
            <thead>
              <tr>
                <th className={`${th} text-center`}>枠</th>
                <th className={`${th} text-left`}>アビリティ</th>
                <th className={`${th} text-right`}>効果量</th>
                <th className={`${th} text-left`}>× 発動回数</th>
                <th className={`${th} text-right`}>点数</th>
              </tr>
            </thead>
            <tbody>
              {bd.items.map((item) => {
                // 発動参照（trigger_tag）が未入力のアビリティだけ — 表示。
                // 参照はあるが回数0のもの（差し入れ等）は「×0回」と出す。
                const muted =
                  item.kind === "excluded" ||
                  item.kind === "none" ||
                  (item.kind === "count" &&
                    (item.count ?? 0) === 0 &&
                    (item.extraCount ?? 0) === 0);
                return (
                  <tr
                    key={item.slot}
                    className={muted ? "text-slate-400" : "text-slate-700"}
                  >
                    <td className={`${td} text-center`}>{item.slot}</td>
                    <td className={td}>{item.ability}</td>
                    <td className={`${td} text-right`}>
                      {item.kind === "parabo"
                        ? `${fmt((item.value ?? 0) * 100)}%`
                        : item.value === null
                          ? "—"
                          : item.value <= 1
                            ? // 率系（レッスンサポート率など）は%表示
                              `${Math.round(item.value * 1000) / 10}%`
                            : fmt(item.value)}
                    </td>
                    <td className={td}>
                      {item.kind === "count" && (
                        <>
                          × {item.count}回
                          {(item.extraCount ?? 0) > 0 && (
                            <b className="text-emerald-600">
                              ＋イベント{item.extraCount}回
                            </b>
                          )}
                          <span className="ml-1 text-slate-400">
                            （{displayCountKey(item.countKey ?? "")}）
                          </span>
                        </>
                      )}
                      {item.kind === "parabo" && (
                        <span className="text-slate-500">
                          レッスン・試験の獲得×%を個別にfloorして合算
                        </span>
                      )}
                      {item.kind === "excluded" && "—"}
                      {item.kind === "none" && "—"}
                    </td>
                    <td
                      className={`${td} text-right font-semibold ${muted ? "" : "text-slate-800"}`}
                    >
                      {item.kind === "excluded" || item.kind === "none"
                        ? "—"
                        : fmt(item.points)}
                    </td>
                  </tr>
                );
              })}
              {bd.itemBonus && (
                <tr className="text-slate-700">
                  <td className={`${td} text-center`}>—</td>
                  <td className={td}>アイテム補正（パラメ系Pアイテム）</td>
                  <td className={`${td} text-right`}>
                    {fmt(bd.itemBonus.perActivation)}
                  </td>
                  <td className={td}>
                    × {bd.itemBonus.activations}回
                    <span className="ml-1 text-slate-400">
                      （{bd.itemBonus.refKey}・floor）
                    </span>
                  </td>
                  <td
                    className={`${td} text-right font-semibold text-slate-800`}
                  >
                    {fmt(bd.itemBonus.points)}
                  </td>
                </tr>
              )}
              <tr className="font-bold text-slate-900">
                <td className={`${td} bg-slate-50`} colSpan={4}>
                  {withEvents
                    ? "合計（イベント相互作用・アイテム補正込みの最終値）"
                    : bd.itemBonus
                      ? "合計（アビリティ＋アイテム補正）"
                      : "合計（点数セルの値）"}
                </td>
                <td className={`${td} bg-slate-50 text-right text-blue-700`}>
                  {fmt(bd.total)}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="text-[11px] text-slate-400">
            ※ 効果量は凸数と枠位置に応じた段階の値。回数はレッスンページ・発動回数セット・固定回数・イベント回数設定（点数表）から。発動参照（trigger_tag）が未入力のアビリティは—表示。
            {withEvents ? (
              <>
                <b className="text-emerald-600">＋イベントn回</b>
                は編成6枚の前イベ・後イベ（スキル獲得・ランダム強化・チェンジ等）による上乗せ分です。「〜回まで」のアビリティは上限を超える分を切り捨てています。
              </>
            ) : (
              "編成に入れると、他のカードの前イベ・後イベによる回数上乗せ（イベント相互作用）がさらに加わります（「〜回まで」は上限まで）。"
            )}
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          このカードは計算不能です（Rカード等、効果量の段階表が未提供）。
        </p>
      )}
    </Modal>
  );
}
