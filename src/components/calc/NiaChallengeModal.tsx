import Modal from "@/components/Modal";
import { BTN_SECONDARY, NOTE } from "@/components/ui";
import {
  NIA_CHALLENGE_CHOICES,
  NIA_CHALLENGE_MAX,
  niaChallengeTotal,
  normalizeNiaChallenge,
  type NiaChallenge,
} from "@/data/niaChallenge";
import type { useCalcResult } from "@/lib/useCalcResult";

/**
 * N.I.AのチャレンジPアイテムの「獲得ボーナス」を枠ごとに選ぶモーダル
 * （設定欄のファン投票数の下の「調整」から）。アイテム名ではなく%で選ぶ。既定は各枠の最大。
 */
export default function NiaChallengeModal({
  r,
  onClose,
}: {
  r: ReturnType<typeof useCalcResult>;
  onClose: () => void;
}) {
  const current = normalizeNiaChallenge(r.calc.settings.niaChallenge);
  const setSlot = (slot: number, pct: number) => {
    const next = [...current] as NiaChallenge;
    next[slot] = pct;
    r.calc.update({ niaChallenge: next });
  };

  return (
    <Modal title="チャレンジPアイテムの獲得ボーナス" onClose={onClose} widthClass="max-w-lg">
      <p className={`mb-2 ${NOTE}`}>
        N.I.AのチャレンジPアイテム3枠の「獲得ボーナス」（%）を枠ごとに選びます。
        獲得ボーナスはオーディションのステ上昇（素点）に掛かるパラボで、その上に通常のパラボが掛かります。
        アイテム名は関係なく、使っているアイテムの%を選んでください。
      </p>
      {NIA_CHALLENGE_CHOICES.map((choices, slot) => (
        <div key={slot} className="flex flex-col gap-1 border-b border-slate-100 py-2.5 last:border-b-0">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-bold text-slate-900">{slot + 1}枠目</span>
            <span className="text-xs text-slate-500">
              {current[slot] === 0 ? "使わない" : `獲得ボーナス +${current[slot]}%`}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {choices.map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => setSlot(slot, pct)}
                className={`h-8 min-w-12 rounded-md px-2 text-sm font-bold transition ${
                  pct === current[slot]
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {pct === 0 ? "無" : `${pct}%`}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-slate-800">合計 +{niaChallengeTotal(current)}%</span>
        <button
          type="button"
          onClick={() => r.calc.update({ niaChallenge: [...NIA_CHALLENGE_MAX] as NiaChallenge })}
          className={BTN_SECONDARY}
        >
          全部最大に戻す
        </button>
      </div>
    </Modal>
  );
}
