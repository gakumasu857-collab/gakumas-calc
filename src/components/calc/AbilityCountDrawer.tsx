import { useMemo, useState } from "react";
import { ListOrdered } from "lucide-react";
import { Link } from "react-router-dom";
import SetEditModal from "@/components/ability-counts/SetEditModal";
import Modal from "@/components/Modal";
import { abilityKeyFromLabel, type AbilityName } from "@/data/constants";
import { SUPPORT_CATALOG } from "@/data/supportCardCatalog";
import type { useCalcResult } from "@/lib/useCalcResult";

const CATALOG_BY_ID = new Map(SUPPORT_CATALOG.map((c) => [c.id, c]));

/**
 * 計算ページの右端タブから開く発動回数エディタ。
 * 発動回数ページでセット名をクリックしたときと同じモーダル（分類タブの表）を開く。
 * 「選択サポカのアビリティのみ」フィルター付き（デフォルトON）。
 */
export default function AbilityCountDrawer({
  r,
}: {
  r: ReturnType<typeof useCalcResult>;
}) {
  const [open, setOpen] = useState(false);
  const set = r.selectedSet;

  // 編成中サポカ6枚が持つアビリティの集合
  const formationKeys = useMemo(() => {
    const keys = new Set<AbilityName>();
    for (const slot of r.selected.slots) {
      if (!slot) continue;
      const card = CATALOG_BY_ID.get(slot.id);
      if (card) for (const key of card.abilityKeys) keys.add(key);
    }
    return keys;
  }, [r.selected.slots]);

  /**
   * 編成サポカの前イベ・後イベによる回数上乗せをアビリティキー別に合算する。
   * 上乗せ側のラベルは全角括弧（例「Pアイテム獲得（6回まで）」）、
   * アプリのラベルは半角括弧なので、キーへ正規化してから突き合わせる。
   */
  const eventExtras = useMemo(() => {
    const out: Partial<Record<AbilityName, number>> = {};
    for (const m of r.members) {
      if (!m) continue;
      for (const [label, n] of Object.entries(m.eventContrib)) {
        const key = abilityKeyFromLabel(label);
        if (key) out[key] = (out[key] ?? 0) + n;
      }
    }
    return out;
  }, [r.members]);

  return (
    <>
      {/* 左端の開くハンドル（上半分・縦書き。下半分はレッスン） */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="発動回数を編集"
        className="fixed bottom-[calc(50%+4px)] left-0 top-16 z-30 flex w-8 items-center justify-center gap-1.5 rounded-r-xl bg-blue-600 text-xs font-bold text-white shadow-lg transition hover:bg-blue-500"
        style={{ writingMode: "vertical-rl" }}
      >
        <ListOrdered size={14} />
        発動回数
      </button>

      {open &&
        (set ? (
          <SetEditModal
            set={set}
            deletable={r.ability.isUserSet(set.id)}
            getCount={r.ability.getCount}
            setCount={r.ability.setCount}
            formationKeys={formationKeys}
            eventExtras={eventExtras}
            onDelete={() => r.ability.deleteSet(set.id)}
            onDuplicate={() => {
              r.ability.duplicateSet(set);
              setOpen(false);
            }}
            onRename={(name) => r.ability.renameSet(set.id, name)}
            onSetPlan={
              r.ability.isUserSet(set.id)
                ? (plan) => r.ability.setPlan(set.id, plan)
                : undefined
            }
            onClose={() => setOpen(false)}
          />
        ) : (
          <Modal title="発動回数" onClose={() => setOpen(false)}>
            <p className="text-sm text-slate-600">
              参照セットが未選択です。「育成（発動回数セット）」で選ぶか、
              <Link to="/ability-counts" className="text-blue-600 underline">
                発動回数ページ
              </Link>
              でチェックしてください。
            </p>
          </Modal>
        ))}
    </>
  );
}
