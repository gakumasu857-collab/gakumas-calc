/**
 * 計算ページのセーブデータ（保存・読み込み）の中身。
 *
 * 方針:
 * - 保存では「その育成の全状態」をスナップショットとして1件に閉じ込める
 *   （シナリオ・踏み方・メモリー・所持状況・発動回数・サポカ編成・イベント設定・設定値）。
 *   読み込みはこのスナップショットが唯一の正なので、あとでセットを消しても再現できる。
 * - あわせて「セーブデータ用」の控え（メモリーセット・発動回数セット・所持状況）も作る。
 *   各ページからも呼び出せるようにするためで、増えても既定では畳んで表示する。
 */
import type { AbilityName } from "@/data/constants";
import { SUPPORT_CARD_DB } from "@/data/supportCardsDb";
import type { CalcSave, CalcSaveSnapshot } from "./useCalcSettings";
import type { useCalcResult } from "./useCalcResult";
import { writeActiveSlotId, type useOwnedSaves } from "./useOwnedSaves";

type CalcResult = ReturnType<typeof useCalcResult>;
type OwnedSaves = ReturnType<typeof useOwnedSaves>;

/** 控えセットの名前（各ページで「セーブデータ用」と分かるように接頭辞をつける） */
export const SAVE_SET_PREFIX = "【セーブ】";

/** 現在の画面状態をまるごとスナップショットにする */
export function buildSnapshot(r: CalcResult): CalcSaveSnapshot {
  const selectedSet = r.selectedSet;
  return {
    scenario: r.scenario,
    schedule: {
      lessons: r.schedule.lessons,
      classTypes: r.schedule.classTypes,
      examScores: r.schedule.examScores,
    },
    nia: {
      lessons: r.niaSchedule.lessons,
      sales: r.niaSchedule.sales,
      auditions: r.niaSchedule.auditions,
      auditionVotes: r.niaSchedule.auditionVotes,
      finalScores: r.niaSchedule.finalScores,
    },
    hatsu: {
      lessons: r.hatsuSchedule.lessons,
      classTypes: r.hatsuSchedule.classTypes,
      midRank: r.hatsuSchedule.midRank,
      finalRank: r.hatsuSchedule.finalRank,
      midScore: r.hatsuSchedule.midScore,
      finalScore: r.hatsuSchedule.finalScore,
    },
    memoryIds: [...r.memoryStore.selected],
    memories: r.memoryStore.selected
      .map((id) => r.memoryStore.findMemory(id))
      .filter((m): m is NonNullable<typeof m> => m !== undefined)
      // 同じメモリーを複数スロットに入れている場合の重複を除く
      .filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i),
    abilityCounts: selectedSet ? r.ability.snapshotCounts(selectedSet) : {},
    abilitySetName: selectedSet?.name ?? "",
    abilitySetPlan: selectedSet?.plan ?? "",
    slots: [...r.selected.slots],
    eventCounts: { ...r.events.map },
    ownedLevels: { ...r.ownedLevels.levels },
    ownedCardCount: SUPPORT_CARD_DB.length,
    pIdols: { ...r.pIdols.map },
  };
}

/**
 * 保存の実処理。スナップショットを作り、控えのセット類も作って（上書きして）
 * それらのIDを返す。呼び出し側はこの戻り値を saveNew / overwrite に渡す。
 */
export function saveExtrasFor(
  r: CalcResult,
  ownedSaves: OwnedSaves,
  saveId: string,
  saveName: string,
): Pick<CalcSave, "snapshot" | "rating" | "cappedSum" | "linked"> {
  const snapshot = buildSnapshot(r);
  const label = `${SAVE_SET_PREFIX}${saveName}`;

  // 控え: メモリーセット・発動回数セット・所持状況（各ストアで saveId 紐づけ）
  const memorySetId = r.memoryStore.upsertSaveSet(
    saveId,
    label,
    snapshot.memoryIds,
  );
  // 発動回数セットは未選択のまま保存されることがあるので、そのときは控えを作らない
  const abilitySetId = snapshot.abilitySetName
    ? r.ability.upsertSaveSet(
        saveId,
        label,
        snapshot.abilitySetPlan,
        snapshot.abilityCounts,
      )
    : undefined;
  const ownedSaveId = ownedSaves.upsert({
    name: label,
    levels: snapshot.ownedLevels,
    pIdols: snapshot.pIdols,
    saveId,
  });

  return {
    snapshot,
    rating: Math.round(r.rating),
    cappedSum: Math.round(r.cappedSum),
    linked: { memorySetId, abilitySetId, ownedSaveId },
  };
}

/**
 * セーブデータを画面へ反映する。
 * v2（snapshot あり）は全状態を復元。v1（settings と ownedLevels のみ）は
 * 分かる範囲だけ復元して、何を戻したかを返す。
 */
export function applySave(
  r: CalcResult,
  save: CalcSave,
): { full: boolean } {
  r.calc.loadSave(save);
  // セーブの所持状況に置き換えるので、所持状況の保存先スロットは外す（別スロットへ上書きしないように）
  writeActiveSlotId(null);
  const snap = save.snapshot;
  if (!snap) {
    // 旧セーブ: 所持状況だけ分かれば戻す
    if (save.ownedLevels) r.ownedLevels.replaceAll(save.ownedLevels);
    return { full: false };
  }

  r.scenarioStore.setScenario(snap.scenario);
  r.schedule.replaceAll(snap.schedule);
  r.niaSchedule.replaceAll(snap.nia);
  r.hatsuSchedule.replaceAll(snap.hatsu);

  // メモリー: 消えている実体を補充してからスロットを復元
  r.memoryStore.ensureMemories(snap.memories);
  r.memoryStore.setSelection(snap.memoryIds);

  // 発動回数: 控えセットを保存時の回数へ戻してから参照セットに設定
  // （保存時に未選択だったセーブは、読み込んでも未選択のままにする）
  if (snap.abilitySetName) {
    const abilitySetId = r.ability.upsertSaveSet(
      save.id,
      `${SAVE_SET_PREFIX}${save.name}`,
      snap.abilitySetPlan,
      snap.abilityCounts,
    );
    r.ability.setSelectedSet(abilitySetId);
  } else {
    r.ability.setSelectedSet(null);
  }

  r.selected.setAll(snap.slots);
  r.events.replaceAll(snap.eventCounts);
  r.ownedLevels.replaceAll(snap.ownedLevels, snap.ownedCardCount);
  r.pIdols.replaceAll(snap.pIdols);
  return { full: true };
}

/** セーブ名を変えたとき、控えのセット類の名前も揃える */
export function renameSaveLinked(
  r: CalcResult,
  ownedSaves: OwnedSaves,
  save: CalcSave,
  newName: string,
) {
  const label = `${SAVE_SET_PREFIX}${newName}`;
  const memorySet = r.memoryStore.sets.find((s) => s.saveId === save.id);
  if (memorySet) {
    r.memoryStore.upsertSaveSet(save.id, label, memorySet.memoryIds);
  }
  const abilitySetId = save.linked?.abilitySetId;
  if (abilitySetId) r.ability.renameSaveSet(save.id, label);
  const owned = ownedSaves.saves.find((s) => s.saveId === save.id);
  if (owned) ownedSaves.rename(owned.id, label);
  r.calc.renameSave(save.id, newName);
}

/** セーブデータを消すとき、一緒に作った控えも消す */
export function deleteSaveLinked(
  r: CalcResult,
  ownedSaves: OwnedSaves,
  save: CalcSave,
) {
  r.memoryStore.deleteSetsBySaveId(save.id);
  r.ability.deleteSetsBySaveId(save.id);
  ownedSaves.removeBySaveId(save.id);
  r.calc.deleteSave(save.id);
}

/** 表示用: セーブの中身の要約（何が入っているか） */
export function saveSummary(save: CalcSave): string {
  if (!save.snapshot) return "旧形式（設定・所持状況のみ）";
  const snap = save.snapshot;
  const cards = snap.slots.filter(Boolean).length;
  const parts = [
    `サポカ${cards}枚`,
    `メモリー${snap.memoryIds.length}枚`,
    snap.abilitySetName ? `発動回数「${snap.abilitySetName}」` : "発動回数なし",
    `所持${Object.keys(snap.ownedLevels).length}枚`,
  ];
  return parts.join(" / ");
}

/** スナップショットの発動回数（表示用に0を除いた実効値） */
export function snapshotCountEntries(
  counts: Partial<Record<AbilityName, number>>,
): [AbilityName, number][] {
  return Object.entries(counts).filter(([, v]) => v > 0) as [
    AbilityName,
    number,
  ][];
}
