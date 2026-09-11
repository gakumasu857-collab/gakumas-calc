import { Link } from "react-router-dom";
import Modal from "@/components/Modal";
import { BTN_PRIMARY, BTN_SECONDARY, NOTE } from "@/components/ui";

/**
 * 初回の探索前に、所持状況が未入力なら一度だけ出す確認。
 * 「このまま求める」を選ぶと以後は出ない（ownershipAck）。
 */
export default function OwnershipConfirmModal({
  onProceed,
  onClose,
}: {
  onProceed: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title="所持状況の確認" onClose={onClose} widthClass="max-w-md">
      <p className="text-sm leading-relaxed text-slate-700">
        所持状況（持っているサポカと凸数）を入力すると、
        <b>あなたの手持ちに沿った編成</b>が組めます。
      </p>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">
        今は未入力なので、<b>全サポカを完凸で持っている想定</b>で組みます。このまま求めてもいいですか？
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onProceed} className={BTN_PRIMARY}>
          このまま求める（全完凸の想定）
        </button>
        <Link to="/support" className={BTN_SECONDARY}>
          所持状況を入力する →
        </Link>
      </div>
      <p className={`mt-3 ${NOTE}`}>
        この確認は最初の1回だけ出ます。所持状況はいつでも上のタブ「所持状況」から入力できます。
      </p>
    </Modal>
  );
}
