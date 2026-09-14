import Modal from "@/components/Modal";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/ui";

/**
 * 探索を押したとき、選んでいるPアイドルが所持状況で「未所持」だったら出す注意。
 * 未所持のままだと特訓0・才能開花0のステータスで計算されるので、直すか、そのまま進むかを選ぶ。
 */
export default function PIdolUnownedModal({
  name,
  onFix,
  onProceed,
  onClose,
}: {
  name: string;
  /** 特訓・才能開花のモーダルを開く */
  onFix: () => void;
  /** 未所持のまま探索する */
  onProceed: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Pアイドルが未所持になっています" onClose={onClose} widthClass="max-w-md">
      <p className="text-sm leading-relaxed text-slate-700">
        選んでいるPアイドル「<b className="text-slate-900">{name}</b>
        」は、所持状況で「未所持」になっています。未所持のまま探索すると、特訓0・才能開花0のステータスで計算します。
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onFix} className={BTN_PRIMARY}>
          特訓・才能開花を設定する
        </button>
        <button type="button" onClick={onProceed} className={BTN_SECONDARY}>
          このまま探索する
        </button>
      </div>
    </Modal>
  );
}
