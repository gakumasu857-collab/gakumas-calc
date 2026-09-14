import Modal from "@/components/Modal";
import { BTN_SECONDARY, NOTE } from "@/components/ui";
import {
  HIF_BASE_CAP,
  HIF_BONUS_CAP,
  HIF_BONUS_SP,
  HIF_BONUS_STAT_FIXED,
  HIF_BONUS_STAT_PCT,
  hifBonusMax,
  hifBonusValues,
  type HifBonusLevels,
} from "@/data/hifBonus";
import type { useCalcResult } from "@/lib/useCalcResult";
import { TYPE_KEYS, type TypeKey } from "@/lib/useCalcSettings";

/** ゲーム内の呼び名（ボーカル上昇 など） */
const JP: Record<TypeKey, string> = { vocal: "ボーカル", dance: "ダンス", visual: "ビジュアル" };

/**
 * H.I.F.ボーナスのレベルを調整するモーダル（設定欄の本戦ラウンド点数の下の「調整」から）。
 * 既定はすべて最大。計算に効く枠だけを置く（Vo/Da/Viは固定値とパラボが別のレベル）。
 */
export default function HifBonusModal({
  r,
  onClose,
}: {
  r: ReturnType<typeof useCalcResult>;
  onClose: () => void;
}) {
  const levels = hifBonusValues(r.calc.settings.hifBonus).levels;
  const set = (patch: Partial<HifBonusLevels>) =>
    r.calc.update({ hifBonus: { ...levels, ...patch } });
  const setType = (kind: "fixed" | "pct", type: TypeKey, lv: number) =>
    set({ [kind]: { ...levels[kind], [type]: lv } });

  /** レベルのボタン列（0＝無） */
  const buttons = (max: number, current: number, onPick: (lv: number) => void, valueAt: (lv: number) => string) => (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: max + 1 }, (_, lv) => (
        <button
          key={lv}
          type="button"
          onClick={() => onPick(lv)}
          title={valueAt(lv)}
          className={`h-8 min-w-9 rounded-md px-2 text-sm font-bold transition ${
            lv === current
              ? "bg-blue-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {lv === 0 ? "無" : lv}
        </button>
      ))}
    </div>
  );

  const fixedAt = (lv: number) => (lv === 0 ? "なし" : `固定 +${HIF_BONUS_STAT_FIXED[lv]}`);
  const pctAt = (lv: number) => (lv === 0 ? "なし" : `パラボ +${HIF_BONUS_STAT_PCT[lv]}%`);

  return (
    <Modal title="H.I.F.ボーナスの調整" onClose={onClose} widthClass="max-w-lg">
      <p className={`mb-2 ${NOTE}`}>
        H.I.F.専用のボーナスです。ふつうは全部最大にしているので、既定も最大です。
        Vo・Da・Viの上昇は固定値とパラボが別のレベルになっています。
        レベルを下げると、そのぶん固定値・パラボ%・SP率・本戦のステ上限が下がります。
      </p>
      {TYPE_KEYS.map((type) => (
        <div key={type} className="flex flex-col gap-1.5 border-b border-slate-100 py-2.5">
          <span className="text-sm font-bold text-slate-900">{JP[type]}上昇</span>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="w-24 shrink-0 text-xs text-slate-600">
              固定値 <b className="text-slate-800">Lv{levels.fixed[type]}</b>
              <span className="ml-1 text-slate-400">{fixedAt(levels.fixed[type])}</span>
            </span>
            {buttons(5, levels.fixed[type], (lv) => setType("fixed", type, lv), fixedAt)}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="w-24 shrink-0 text-xs text-slate-600">
              パラボ <b className="text-slate-800">Lv{levels.pct[type]}</b>
              <span className="ml-1 text-slate-400">{pctAt(levels.pct[type])}</span>
            </span>
            {buttons(5, levels.pct[type], (lv) => setType("pct", type, lv), pctAt)}
          </div>
        </div>
      ))}
      <div className="flex flex-col gap-1 border-b border-slate-100 py-2.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-bold text-slate-900">SPレッスン発生率増加（全タイプ）</span>
          <span className="text-xs text-slate-500">
            Lv{levels.spRate}: {levels.spRate === 0 ? "なし" : `SPレッスン率 +${HIF_BONUS_SP[levels.spRate]}%`}
          </span>
        </div>
        {buttons(5, levels.spRate, (lv) => set({ spRate: lv }), (lv) =>
          lv === 0 ? "なし" : `SPレッスン率 +${HIF_BONUS_SP[lv]}%`,
        )}
      </div>
      <div className="flex flex-col gap-1 py-2.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-bold text-slate-900">【本戦】パラメータ上限増加</span>
          <span className="text-xs text-slate-500">
            Lv{levels.finalCap}: 上限 {HIF_BASE_CAP + HIF_BONUS_CAP[levels.finalCap]}
            {levels.finalCap > 0 ? `（+${HIF_BONUS_CAP[levels.finalCap]}）` : ""}
          </span>
        </div>
        {buttons(6, levels.finalCap, (lv) => set({ finalCap: lv }), (lv) =>
          lv === 0 ? `上限 ${HIF_BASE_CAP}` : `上限 ${HIF_BASE_CAP + HIF_BONUS_CAP[lv]}（+${HIF_BONUS_CAP[lv]}）`,
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => set(hifBonusMax())} className={BTN_SECONDARY}>
          全部最大に戻す
        </button>
        <span className={NOTE}>
          試験前の体力回復量・選抜／本戦の初期Pポイント・相談の割引は評価値に影響しないので、ここにはありません。
        </span>
      </div>
    </Modal>
  );
}
