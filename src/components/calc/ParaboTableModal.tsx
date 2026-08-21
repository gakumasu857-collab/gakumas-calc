import Modal from "@/components/Modal";
import { TIER_LABELS } from "@/lib/sheetScore";
import {
  CARD_PARABO_ROWS,
  formatRange,
  MEMORY_PARABO_PCTS,
  paraboGainsByType,
  paraboRange,
} from "@/lib/paraboTable";
import type { useCalcResult } from "@/lib/useCalcResult";
import { TYPE_KEYS, TYPE_LABELS, type TypeKey } from "@/lib/useCalcSettings";

const TYPE_TEXT: Record<TypeKey, string> = {
  vocal: "text-red-600",
  dance: "text-blue-600",
  visual: "text-yellow-600",
};

/**
 * パラボ%→固定値の変換表。
 * 今の踏み方（＝%が掛かるレッスン・試験の獲得量）を母数に、
 * メモリー・サポカ・今の編成のパラボが実際どれだけのステになるかを示す。
 */
export default function ParaboTableModal({
  r,
  onClose,
}: {
  r: ReturnType<typeof useCalcResult>;
  onClose: () => void;
}) {
  const gains = paraboGainsByType(r.ctx);
  const th =
    "border border-slate-300 bg-slate-100 px-2 py-1 font-bold text-slate-700";
  const td = "border border-slate-200 px-2 py-1 text-center tabular-nums";

  /** pct列＋Vo/Da/Viの変換値セル */
  const row = (pct: number, label?: string) => (
    <>
      <td className={`${td} font-semibold text-slate-700`}>
        {label ?? `+${pct}%`}
      </td>
      {TYPE_KEYS.map((type) => (
        <td key={type} className={td}>
          {formatRange(paraboRange(pct, gains[type]))}
        </td>
      ))}
    </>
  );

  const typeHead = (
    <tr>
      <th className={th}>パラボ</th>
      {TYPE_KEYS.map((type) => (
        <th key={type} className={`${th} ${TYPE_TEXT[type]}`}>
          {TYPE_LABELS[type]}
        </th>
      ))}
    </tr>
  );

  return (
    <Modal title="パラボ変換表" onClose={onClose} widthClass="max-w-3xl">
      <p className="mb-3 text-xs leading-relaxed text-slate-500">
        今の踏み方で、パラメータボーナス%が最終的に何点ぶんのステータスになるかの表です。
        パラボはレッスン・試験の獲得ごとに「獲得量×%」を切り捨てて足すので、
        同じ%でも他のパラボと重なったときに端数が繰り上がるぶん幅が出ます
        （最小＝端数が全部切り捨てられた場合／最大＝全部繰り上がった場合）。
        レッスンや選抜スコアを変えると母数が変わるので、この表の値も変わります。
      </p>

      <h3 className="mb-1 text-xs font-bold text-slate-700">
        今の編成のプロデュース開始時のパラボ
      </h3>
      <table className="mb-4 w-full border-collapse text-xs">
        <thead>{typeHead}</thead>
        <tbody>
          <tr>
            <td className={`${td} font-semibold text-slate-700`}>
              合計（メモリー＋サポカ＋Pアイドル
              {r.scenario === "hif" ? "＋H.I.F.10%" : ""}）
            </td>
            {TYPE_KEYS.map((type) => (
              <td key={type} className={td}>
                <b className="text-blue-700">
                  {formatRange(
                    paraboRange(r.perType[type].startPct, gains[type]),
                  )}
                </b>
                <span className="ml-1 text-[10px] text-slate-400">
                  (+{r.perType[type].startPct}%)
                </span>
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      <h3 className="mb-1 text-xs font-bold text-slate-700">
        メモリー1枠のパラボ（4段階）
      </h3>
      <table className="mb-4 w-full border-collapse text-xs">
        <thead>{typeHead}</thead>
        <tbody>
          {MEMORY_PARABO_PCTS.map((pct) => (
            <tr key={pct}>{row(pct)}</tr>
          ))}
        </tbody>
      </table>

      <h3 className="mb-1 text-xs font-bold text-slate-700">
        サポカのパラボ（レアリティ×強化段階）
      </h3>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className={th}>レアリティ</th>
            <th className={th}>段階</th>
            {TYPE_KEYS.map((type) => (
              <th key={type} className={`${th} ${TYPE_TEXT[type]}`}>
                {TYPE_LABELS[type]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CARD_PARABO_ROWS.map((group) =>
            group.pcts.map((pct, i) => (
              <tr key={`${group.rarity}-${i}`}>
                {i === 0 && (
                  <td
                    rowSpan={group.pcts.length}
                    className={`${td} font-bold text-slate-700`}
                  >
                    {group.rarity}
                  </td>
                )}
                <td className={`${td} text-slate-500`}>
                  {TIER_LABELS[i]}
                  <span className="ml-1 text-[10px] text-slate-400">
                    +{pct}%
                  </span>
                </td>
                {TYPE_KEYS.map((type) => (
                  <td key={type} className={td}>
                    {formatRange(paraboRange(pct, gains[type]))}
                  </td>
                ))}
              </tr>
            )),
          )}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-slate-400">
        ※ 段階（Ⅰ〜Ⅴ）はアビリティ枠と凸数で決まります（凸ごとの段階は点数表の内訳モーダルで確認できます）。
      </p>
    </Modal>
  );
}
