import { Wand2 } from "lucide-react";
import {
  PLACEHOLDER_SKILLS,
  PLAN_STYLES,
  type PlaceholderSkill,
} from "@/lib/memoryTypes";
import Modal from "@/components/Modal";

type Props = {
  onSelect: (skill: PlaceholderSkill) => void;
  onClose: () => void;
};

/**
 * 「スキルから選択」の画像選択モーダル。
 * 各スキルには所属プランが割り当てられており、選ぶとメモリーのプランもそれになる。
 * スキルカードの実データ（名前・画像）が未定のため、いまは仮の一覧。
 */
export default function PlanSelectorModal({ onSelect, onClose }: Props) {
  return (
    <Modal title="スキルから選択" onClose={onClose}>
      <p className="mb-3 text-xs text-slate-500">
        ※ 仮データです。スキルを選ぶと、そのスキルの所属プランがメモリーに設定されます。
      </p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {PLACEHOLDER_SKILLS.map((skill) => (
          <button
            key={skill.name}
            type="button"
            onClick={() => onSelect(skill)}
            className="flex flex-col items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-2 transition hover:border-sky-400 hover:shadow-sm"
          >
            {/* アイコン背景は所属プランの色 */}
            <span
              className={`flex aspect-square w-full items-center justify-center rounded-md ${PLAN_STYLES[skill.plan].icon}`}
            >
              <Wand2 className="h-1/3 w-1/3 text-white" />
            </span>
            <span className="w-full truncate text-center text-[11px] text-slate-600">
              {skill.name}
            </span>
            <span className="text-[10px] text-slate-400">{skill.plan}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
