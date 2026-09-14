import Modal from "@/components/Modal";
import { NOTE } from "@/components/ui";
import type { useCalcResult } from "@/lib/useCalcResult";

/**
 * Pアイドルの特訓・才能開花を設定するモーダル（「まずここを設定」のアイドル欄の下から開く）。
 * 評価値の横のPアイドル画像の歯車と同じ設定。値はPアイドルごとにブラウザに保存される。
 */
export default function PIdolTrainingModal({
  r,
  onClose,
}: {
  r: ReturnType<typeof useCalcResult>;
  onClose: () => void;
}) {
  const key = r.pMaster?.key;
  const own = r.ownership;
  const btn = (on: boolean) =>
    `h-9 min-w-9 rounded-md px-2 text-sm font-bold transition ${
      on ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
    }`;
  if (!key) return null;
  return (
    <Modal title={`特訓・才能開花: ${r.pMaster?.cardName ?? ""}`} onClose={onClose} widthClass="max-w-md">
      <p className={`mb-3 ${NOTE}`}>
        特訓はアイテムで上げる段階、才能開花は同じPアイドルを重ねた回数です。どちらもPアイドルのステータスに効きます。
        「未」にすると未所持（未設定）になります。
      </p>
      <p className="mb-1 text-xs font-bold text-slate-700">特訓</p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => r.pIdols.setUnowned(key)} className={btn(!own)}>
          未
        </button>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => r.pIdols.setOwnership(key, { kunren: n })}
            className={btn(!!own && own.kunren >= n)}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="mb-1 mt-4 text-xs font-bold text-slate-700">才能開花</p>
      <div className="flex flex-wrap gap-1.5">
        {[0, 1, 2, 3, 4].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => r.pIdols.setOwnership(key, { kaika: n })}
            className={btn(!!own && own.kaika >= n)}
          >
            {n}
          </button>
        ))}
      </div>
      <p className={`mt-4 ${NOTE}`}>
        今の設定: <b className="text-slate-800">{own ? `特訓${own.kunren}・才能開花${own.kaika}` : "未所持"}</b>
      </p>
    </Modal>
  );
}
