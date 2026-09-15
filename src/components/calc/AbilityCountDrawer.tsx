import { useMemo } from "react";
import { Link } from "react-router-dom";
import SetEditModal from "@/components/ability-counts/SetEditModal";
import Modal from "@/components/Modal";
import { abilityKeyFromLabel, type AbilityName } from "@/data/constants";
import { SUPPORT_CATALOG } from "@/data/supportCardCatalog";
import type { useCalcResult } from "@/lib/useCalcResult";

const CATALOG_BY_ID = new Map(SUPPORT_CATALOG.map((c) => [c.id, c]));

/**
 * 計算ページ左端の「プロデュース」タブから開く、アビリティ発動回数のエディタ。
 * プロデュース設定ページ（/ability-counts）と同じモーダル（分類タブの表）だが、ここで変えるのは「この育成での回数」で、
 * プロデュース設定ページのデフォルトは変えない（useAbilityCounts の adjust レイヤー。「上書き保存」でデフォルトに書ける）。
 * 「選択サポカのアビリティのみ」フィルター付き（デフォルトON）。
 */
export default function AbilityCountDrawer({
  r,
  open,
  onClose,
}: {
  r: ReturnType<typeof useCalcResult>;
  open: boolean;
  onClose: () => void;
}) {
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
      {open &&
        (set ? (
          <SetEditModal
            set={set}
            mode="run"
            deletable={r.ability.isUserSet(set.id)}
            getCount={r.ability.getRunCount}
            setCount={r.ability.setRunCount}
            defaultCount={r.ability.getCount}
            isAdjusted={r.ability.isRunAdjusted}
            adjustedCount={r.ability.runAdjustCount(set)}
            onResetAdjust={() => r.ability.resetRunAdjust(set.id)}
            onCommitAdjust={() => r.ability.commitRunAdjust(set)}
            formationKeys={formationKeys}
            eventExtras={eventExtras}
            onDelete={() => r.ability.deleteSet(set.id)}
            onRename={(name) => r.ability.renameSet(set.id, name)}
            onSetPlan={
              r.ability.isUserSet(set.id)
                ? (plan) => r.ability.setPlan(set.id, plan)
                : undefined
            }
            onClose={() => onClose()}
          />
        ) : (
          <Modal title="プロデュース（アビリティ発動回数）" onClose={() => onClose()}>
            <p className="text-sm text-slate-600">
              プロデュースが未選択です。「設定欄」のプロデュースで選ぶか、
              <Link to="/ability-counts" className="text-blue-600 underline">
                プロデュース設定ページ
              </Link>
              にてチェックを入れてください。
            </p>
          </Modal>
        ))}
    </>
  );
}
