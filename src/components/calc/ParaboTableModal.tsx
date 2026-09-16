import Modal from "@/components/Modal";
import { TYPE_SOLID } from "@/components/ui";
import {
  CARD_PARABO_ROWS,
  formatExpected,
  formatRange,
  MEMORY_PARABO_PCTS,
  paraboGainsByType,
  paraboRange,
} from "@/lib/paraboTable";
import type { useCalcResult } from "@/lib/useCalcResult";
import { TYPE_KEYS, TYPE_LABELS, type TypeKey } from "@/lib/useCalcSettings";

/** タイプ列の淡い背景（Vo=赤・Da=青・Vi=黄） */
const TYPE_BG: Record<TypeKey, string> = {
  vocal: "bg-red-50",
  dance: "bg-blue-50",
  visual: "bg-yellow-50",
};

/**
 * パラボ%→固定値の変換表。
 * 今の踏み方（＝%が掛かるレッスン・試験の獲得量）を母数に、
 * メモリー・サポカ・今の編成のパラボが実際どれだけのステになるかを示す。
 * 数字を主役にして大きく、タイプ列はVo/Da/Viの色で塗り分ける。
 */
export default function ParaboTableModal({
  r,
  onClose,
}: {
  r: ReturnType<typeof useCalcResult>;
  onClose: () => void;
}) {
  const gains = paraboGainsByType(r.ctx);
  const th = "border border-slate-300 bg-slate-100 px-2 py-1.5 text-xs font-bold text-slate-700";
  const tdLabel = "border border-slate-200 px-2 py-1.5 text-left text-sm font-semibold text-slate-700";
  const tdValue = (type: TypeKey) =>
    `border border-slate-200 px-2 py-1.5 text-center text-sm font-bold tabular-nums text-slate-900 ${TYPE_BG[type]}`;

  /** タイプの見出し（色チップ） */
  const typeHead = (
    <tr>
      <th className={th}>パラボ</th>
      {TYPE_KEYS.map((type) => (
        <th key={type} className={`${th} ${TYPE_BG[type]}`}>
          <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${TYPE_SOLID[type]}`}>
            {TYPE_LABELS[type]}
          </span>
        </th>
      ))}
    </tr>
  );

  /** 1枠ぶんの変換値（大きい数字＝平均、かっこ内＝最小〜最大。幅が無ければ数字1つ） */
  const pctCell = (pct: number, type: TypeKey) => {
    const range = paraboRange(pct, gains[type]);
    return (
      <td key={type} className={tdValue(type)}>
        {formatExpected(range)}
        {range.min !== range.max && (
          <span className="ml-1 text-xs font-semibold text-slate-500">
            ({formatRange(range)})
          </span>
        )}
      </td>
    );
  };

  /** %の行（ラベル＋Vo/Da/Viの変換値） */
  const pctRow = (pct: number, key: string) => (
    <tr key={key}>
      <td className={tdLabel}>+{pct}%</td>
      {TYPE_KEYS.map((type) => pctCell(pct, type))}
    </tr>
  );

  return (
    <Modal title="パラボ変換表" onClose={onClose} widthClass="max-w-3xl">
      <p className="mb-3 text-xs leading-relaxed text-slate-500">
        今の踏み方で、パラメータボーナスが最終的に何点分のステータスになるかの表です。
        パラボはレッスン・試験の獲得ごとに「獲得量×%」を切り捨てて足します。
        <b className="text-slate-600">合計</b>
        は全部の%を合算してから1回で変換するので値が1つに決まります（＝実際にステへ足されている値）。
        1枠ずつの表は「その枠を足したときに増える量」で、大きい数字は平均（サポカの点数もこの値で数えます）、
        かっこ内は他のパラボと重なると端数が繰り上がるために出る幅です（最小＝端数が全て切り捨てされたとき／最大＝端数が全部繰り上がったとき）。
        レッスンや選抜スコアを変えると素のステが変わるので、この表の値も変わります。
      </p>

      <h3 className="mb-1 text-sm font-bold text-slate-800">今の編成のプロデュース開始時のパラボ</h3>
      <table className="mb-5 w-full border-collapse">
        <thead>{typeHead}</thead>
        <tbody>
          <tr>
            <td className={tdLabel}>
              合計（メモリー＋サポカ＋Pアイドル
              {r.scenario === "hif" ? "＋H.I.F.10%" : ""}）
            </td>
            {TYPE_KEYS.map((type) => (
              <td key={type} className={tdValue(type)}>
                {/* 合計は全ソースの%を足してから1回だけ変換するので値が1つに決まる。
                    表示ブレを避けるため、計算に使っている変換値そのものを出す */}
                <span className="text-xl text-blue-700">
                  {r.paraboDetail[type].conv.toLocaleString()}
                </span>
                <span className="ml-1 text-xs font-semibold text-slate-500">
                  (+{r.paraboDetail[type].totalPct}%)
                </span>
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      <h3 className="mb-1 text-sm font-bold text-slate-800">メモリーアビリティのパラボ</h3>
      <table className="mb-5 w-full border-collapse">
        <thead>{typeHead}</thead>
        <tbody>{MEMORY_PARABO_PCTS.map((pct) => pctRow(pct, `m-${pct}`))}</tbody>
      </table>

      <h3 className="mb-1 text-sm font-bold text-slate-800">サポカのパラボ</h3>
      <p className="mb-1 text-[11px] text-slate-500">
        値はアビリティ枠と凸数で決まります（凸ごとの%は点数表の内訳モーダルで確認できます）。
      </p>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>レアリティ</th>
            <th className={th}>パラボ</th>
            {TYPE_KEYS.map((type) => (
              <th key={type} className={`${th} ${TYPE_BG[type]}`}>
                <span
                  className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${TYPE_SOLID[type]}`}
                >
                  {TYPE_LABELS[type]}
                </span>
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
                    className="border border-slate-200 px-2 py-1.5 text-sm font-bold text-slate-700"
                  >
                    {group.rarity}
                  </td>
                )}
                <td className={tdLabel}>+{pct}%</td>
                {TYPE_KEYS.map((type) => pctCell(pct, type))}
              </tr>
            )),
          )}
        </tbody>
      </table>
    </Modal>
  );
}
