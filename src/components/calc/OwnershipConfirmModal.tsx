import { Link } from "react-router-dom";
import Modal from "@/components/Modal";
import { NOTE } from "@/components/ui";

/**
 * 初回の探索前に、所持状況が未入力なら一度だけ出す確認。
 * 選択肢は2つだけ（このまま求める＝全完凸の想定／自分の所持状況に合わせる）。
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
    <Modal title="所持しているサポカが未入力です" onClose={onClose} widthClass="max-w-md">
      <p className="text-sm text-slate-600">
        今は「全サポカを完凸で持っている」想定で計算します。どちらにしますか？
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onProceed}
          className="flex flex-col items-center rounded-xl bg-blue-600 px-3 py-3 text-white transition hover:bg-blue-500"
        >
          <span className="text-base font-bold">このまま求める</span>
          <span className="text-[11px] text-blue-100">全完凸の想定</span>
        </button>
        <Link
          to="/support"
          className="flex flex-col items-center rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-800 transition hover:border-blue-400 hover:bg-blue-50/40"
        >
          <span className="text-base font-bold">自分の所持状況に合わせる</span>
          <span className="text-[11px] text-slate-500">持っているサポカと凸数を入力</span>
        </Link>
      </div>
      <p className={`mt-3 ${NOTE}`}>
        この確認は最初の1回だけ。所持状況は上のタブ「所持状況」からいつでも入力できます。
      </p>
    </Modal>
  );
}
