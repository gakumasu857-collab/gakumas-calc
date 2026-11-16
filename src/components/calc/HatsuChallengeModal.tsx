import Modal from "@/components/Modal";
import { BTN_SECONDARY, NOTE } from "@/components/ui";
import {
  HATSU_CHALLENGE_DEFAULT,
  hatsuChallengeChoices,
  hatsuChallengeEffectText,
  hatsuPlanOf,
  normalizeHatsuChallenge,
  type HatsuChallenge,
} from "@/data/hatsuChallenge";
import type { useCalcResult } from "@/lib/useCalcResult";

/**
 * 初レジェンドのチャレンジPアイテムを枠ごとに1つ選ぶモーダル（設定欄の「試験スコア・順位」の下の「調整」から）。
 * 計算に入るのはステータス（教科書のパラボ%・ボイスレコーダーなどの+15×5）とレッスン上限だけ。2026-11-16
 */
export default function HatsuChallengeModal({
  r,
  onClose,
}: {
  r: ReturnType<typeof useCalcResult>;
  onClose: () => void;
}) {
  const picked = normalizeHatsuChallenge(r.calc.settings.hatsuChallenge);
  const resolved = r.hatsuChallenge;
  const plan = hatsuPlanOf(r.pMaster?.plan);
  const setSlot = (slot: number, id: string) => {
    const next = [...picked] as HatsuChallenge;
    next[slot] = id;
    r.calc.update({ hatsuChallenge: next });
  };

  return (
    <Modal title="チャレンジPアイテム（初）" onClose={onClose} widthClass="max-w-2xl">
      <p className={`mb-2 ${NOTE}`}>
        3つの枠から1つずつ選びます。計算に入れるのは<b className="text-slate-700">ステータスとレッスン上限だけ</b>です
        （ライバルのスコア・パラメータ上昇量増加・好調や集中などの効果は入れません）。
        ボイスレコーダーなどの「+15」は、プロデュース中5回とも発動する前提です。
        2枠目・3枠目は{plan ? `Pアイドルのプラン（${plan}）` : "Pアイドルのプラン"}のアイテムです。
      </p>
      {([1, 2, 3] as const).map((slot) => {
        const choices = hatsuChallengeChoices(slot, plan);
        const current = resolved.items[slot - 1];
        const auto = picked[slot - 1] === null;
        return (
          <div key={slot} className="flex flex-col gap-1.5 border-b border-slate-100 py-2.5 last:border-b-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-bold text-slate-900">{slot}枠目</span>
              <span className="text-xs text-slate-500">
                {current.id}（{hatsuChallengeEffectText(current)}）{auto ? "・おまかせ" : ""}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {choices.map((c) => {
                const on = c.id === current.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSlot(slot - 1, c.id)}
                    className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition ${
                      on
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="font-bold">
                      {c.id}
                      {c.hard && (
                        <span className={`ml-1 text-[10px] font-semibold ${on ? "text-blue-100" : "text-rose-600"}`}>
                          高難易度
                        </span>
                      )}
                    </span>
                    <span className={`shrink-0 text-[11px] ${on ? "text-blue-100" : "text-slate-500"}`}>
                      {hatsuChallengeEffectText(c)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-slate-800">レッスン上限 合計 +{resolved.capBonus}</span>
        <button
          type="button"
          onClick={() => r.calc.update({ hatsuChallenge: [...HATSU_CHALLENGE_DEFAULT] as HatsuChallenge })}
          className={BTN_SECONDARY}
          title="1枠目は審査基準がいちばん高いタイプの高難易度、2・3枠目はプランの高難易度"
        >
          おまかせに戻す
        </button>
      </div>
    </Modal>
  );
}
