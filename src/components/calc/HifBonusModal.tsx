import Modal from "@/components/Modal";
import { BTN_SECONDARY, NOTE } from "@/components/ui";
import {
  HIF_BASE_CAP,
  HIF_BONUS_CAP,
  HIF_BONUS_MAX,
  HIF_BONUS_SP,
  HIF_BONUS_STAT_FIXED,
  HIF_BONUS_STAT_PCT,
  hifBonusValues,
  type HifBonusLevels,
} from "@/data/hifBonus";
import type { useCalcResult } from "@/lib/useCalcResult";

/**
 * H.I.F.ボーナスのレベルを調整するモーダル（設定欄の本戦ラウンド点数の下の「調整」から）。
 * 既定はすべて最大。計算に効く5枠だけを置く。
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

  const row = (
    key: keyof HifBonusLevels,
    label: string,
    max: number,
    valueAt: (lv: number) => string,
  ) => (
    <div key={key} className="flex flex-col gap-1 border-b border-slate-100 py-2.5 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm font-bold text-slate-900">{label}</span>
        <span className="text-xs text-slate-500">
          Lv{levels[key]}: {valueAt(levels[key])}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: max + 1 }, (_, lv) => (
          <button
            key={lv}
            type="button"
            onClick={() => set({ [key]: lv })}
            title={valueAt(lv)}
            className={`h-8 min-w-9 rounded-md px-2 text-sm font-bold transition ${
              lv === levels[key]
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {lv === 0 ? "無" : lv}
          </button>
        ))}
      </div>
    </div>
  );

  const statValue = (lv: number) =>
    lv === 0 ? "なし" : `固定 +${HIF_BONUS_STAT_FIXED[lv]}・パラボ +${HIF_BONUS_STAT_PCT[lv]}%`;

  return (
    <Modal title="H.I.F.ボーナスの調整" onClose={onClose} widthClass="max-w-lg">
      <p className={`mb-2 ${NOTE}`}>
        H.I.F.専用のボーナスです。ふつうは全部最大にしているので、既定も最大です。
        レベルを下げると、そのぶん固定値・パラボ%・SP率・本戦のステ上限が下がります。
      </p>
      {row("vocal", "ボーカル上昇", 5, statValue)}
      {row("dance", "ダンス上昇", 5, statValue)}
      {row("visual", "ビジュアル上昇", 5, statValue)}
      {row("spRate", "SPレッスン発生率増加（全タイプ）", 5, (lv) =>
        lv === 0 ? "なし" : `SPレッスン率 +${HIF_BONUS_SP[lv]}%`,
      )}
      {row("finalCap", "【本戦】パラメータ上限増加", 6, (lv) =>
        lv === 0 ? `上限 ${HIF_BASE_CAP}` : `上限 ${HIF_BASE_CAP + HIF_BONUS_CAP[lv]}（+${HIF_BONUS_CAP[lv]}）`,
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => set({ ...HIF_BONUS_MAX })} className={BTN_SECONDARY}>
          全部最大に戻す
        </button>
        <span className={NOTE}>
          試験前の体力回復量・選抜／本戦の初期Pポイント・相談の割引は評価値に影響しないので、ここにはありません。
        </span>
      </div>
    </Modal>
  );
}
