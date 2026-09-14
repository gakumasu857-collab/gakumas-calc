import { statOrderShortfall } from "./formation";
/**
 * 今の編成が「探索の必須条件」を満たしているかの判定と、評価値の下に出す条件チップ。
 *
 * 計算ページは「探索結果が今の評価値を下回ったら変更しない」ガードを持つが、
 * それは今の編成が条件を満たしているときだけ効かせる（条件外の編成が評価値だけ高くても、
 * 条件を満たす結果で置き換える）。ここで条件を見落とすと、例えば「固定を入れた結果のほうが
 * 低いので変更なし」のように結果が吸われる。なので探索エンジン側の必須条件
 * （固定・BAN・レンタルNG・プラン・ステージ用の除外・SP率持ち・タイプ割合・最低/最高ステ）を
 * 全部ここで見る。純関数なので scratchpad のテストで各条件を確認できる。
 */
import { SUPPORT_CARD_DB } from "@/data/supportCardsDb";
import { planAllows, type CardFlagSets } from "./formation";
import type { SelectedMember } from "./useCalcResult";
import { TYPE_KEYS, type CalcSettings, type TypeKey } from "./useCalcSettings";

const DB_BY_ID = new Map(SUPPORT_CARD_DB.map((c) => [c.id, c]));
const TYPE_JA: Record<TypeKey, "Vo" | "Da" | "Vi"> = {
  vocal: "Vo",
  dance: "Da",
  visual: "Vi",
};

export type ConditionStatus = { label: string; ok: boolean; detail?: string };

export type ConditionInput = {
  /** 今の編成（空枠は除く） */
  members: SelectedMember[];
  flags: CardFlagSets;
  settings: CalcSettings;
  /** Pアイドルのプラン（センス／ロジック／アノマリー）。null は制限なし */
  plan: string | null;
  /** タイプ別のSP率持ち最低枚数（今の踏み方で上位タイプを解決済み） */
  spMin: Record<TypeKey, number>;
  /** 今の育成後ステ（上限適用後） */
  capped: Record<TypeKey, number>;
  statCap: number;
  /** 所持凸（-1=未所持）。固定カードを編成に入れられるかの判定に使う */
  getLevel: (id: string) => number;
};

/** 編成に入れられる固定カード（プランが合い、所持かレンタル可）のID */
function usablePinned(input: ConditionInput): string[] {
  const out: string[] = [];
  for (const id of input.flags.pinned) {
    const db = DB_BY_ID.get(id);
    if (!db || !planAllows(db.plan, input.plan)) continue;
    if (input.getLevel(id) >= 0 || !input.flags.rentalNg?.has(id)) out.push(id);
  }
  return out;
}

/** 編成に入れられる固定カードのうち、今の編成に入っていないものの名前 */
export function missingPinned(input: ConditionInput): string[] {
  const ids = new Set(input.members.map((m) => m.id));
  return usablePinned(input)
    .filter((id) => !ids.has(id))
    .map((id) => DB_BY_ID.get(id)?.name ?? id);
}

/** アシストはどのタイプにも数えない */
function typeCounts(members: SelectedMember[]): Record<TypeKey, number> {
  const counts: Record<TypeKey, number> = { vocal: 0, dance: 0, visual: 0 };
  for (const m of members) if (!m.assist) counts[m.type]++;
  return counts;
}

/** 今の編成が必須条件を満たさない理由（空なら満たしている） */
export function formationIssues(input: ConditionInput): string[] {
  const { members, flags, settings, plan } = input;
  if (members.length < 6) return ["サポカが6枚そろっていない"];
  const issues: string[] = [];
  if (members.filter((m) => m.rental).length > 1) issues.push("レンタルが2枚以上");
  for (const m of members) {
    const db = DB_BY_ID.get(m.id);
    if (!db) {
      issues.push(`${m.name}: カードが見つからない`);
      continue;
    }
    if (!planAllows(db.plan, plan)) issues.push(`${db.name}: プラン外`);
    if (m.rental && flags.rentalNg?.has(m.id)) issues.push(`${db.name}: レンタルNG`);
    if (flags.pinned.has(m.id)) continue; // 固定はBAN・ステージ用の除外を貫通する
    if (flags.banned.has(m.id)) issues.push(`${db.name}: BAN`);
    if (settings.noStageItems && (db.stageItem || db.preEventType === "スキル"))
      issues.push(`${db.name}: ステージ用（除外の設定）`);
  }
  for (const name of missingPinned(input)) issues.push(`固定「${name}」が入っていない`);
  for (const t of TYPE_KEYS) {
    const need = input.spMin[t] ?? 0;
    // 全SPレッスン率（トレーナー等）は全タイプの1枚として数える
    if (need > 0 && members.filter((m) => m.spTypes.includes(t)).length < need)
      issues.push(`${TYPE_JA[t]}のSP率持ちが${need}枚未満`);
  }
  if (settings.typeRatio.enabled) {
    const counts = typeCounts(members);
    const sum = TYPE_KEYS.reduce((s, t) => s + settings.typeRatio[t], 0);
    for (const t of TYPE_KEYS) {
      const want = settings.typeRatio[t];
      // 合計6以上=枚数固定、6未満=最低枚数
      if (sum >= 6 ? counts[t] !== want : counts[t] < want)
        issues.push(`タイプ割合（${TYPE_JA[t]}が${counts[t]}枚）`);
    }
  }
  // ステの高さの順（育成後ステ・上限適用後で判定）
  if (settings.statOrder && statOrderShortfall(input.capped, settings.statOrder) > 0) {
    issues.push(`ステの順（${settings.statOrder.map((t) => TYPE_JA[t]).join("＞")}）を満たしていない`);
  }
  for (const t of TYPE_KEYS) {
    const stat = input.capped[t];
    const min = settings.minStats[t];
    if (min > 0 && stat < min) issues.push(`${TYPE_JA[t]}が最低ステ未達`);
    const max = settings.maxStats[t];
    if (max > 0 && max < input.statCap && stat > max) issues.push(`${TYPE_JA[t]}が最高ステ超過`);
  }
  return issues;
}

/** 今の編成が必須条件を全部満たしているか（ガードを効かせてよいか） */
export function currentMeetsConditions(input: ConditionInput): boolean {
  return formationIssues(input).length === 0;
}

/** 評価値の下に出す条件チップ（条件を設定していない項目は出さない） */
export function conditionChips(input: ConditionInput): ConditionStatus[] {
  const out: ConditionStatus[] = [];
  const { members, settings } = input;
  if (members.length < 6) return out;
  // 固定（編成に入れられる固定があるときだけ）
  if (usablePinned(input).length > 0) {
    const missing = missingPinned(input);
    out.push({
      label: "固定",
      ok: missing.length === 0,
      detail: missing.length ? `${missing.join("・")}が未編成` : undefined,
    });
  }
  // レンタル（1枚まで。所持状況を変えて未所持になったカードもレンタル扱いになる）
  const rentals = members.filter((m) => m.rental);
  if (rentals.length > 0) {
    const ng = rentals.filter((m) => input.flags.rentalNg?.has(m.id));
    out.push({
      label: "レンタル",
      ok: rentals.length <= 1 && ng.length === 0,
      detail:
        rentals.length > 1
          ? `${rentals.length}枚（1枚まで）`
          : ng.length > 0
            ? `${ng.map((m) => m.name).join("・")}はレンタルNG`
            : rentals[0].name,
    });
  }
  if (settings.spTop.first > 0 || settings.spTop.second > 0) {
    let short = 0;
    for (const t of TYPE_KEYS) {
      short += Math.max(
        0,
        (input.spMin[t] ?? 0) - members.filter((m) => m.spTypes.includes(t)).length,
      );
    }
    out.push({
      label: "SP率持ち",
      ok: short === 0,
      detail: short > 0 ? `あと${short}枚` : undefined,
    });
  }
  if (settings.typeRatio.enabled) {
    const counts = typeCounts(members);
    const sum = TYPE_KEYS.reduce((s, t) => s + settings.typeRatio[t], 0);
    const ok = TYPE_KEYS.every((t) =>
      sum >= 6 ? counts[t] === settings.typeRatio[t] : counts[t] >= settings.typeRatio[t],
    );
    out.push({
      label: "タイプ割合",
      ok,
      detail: `Vo${counts.vocal} Da${counts.dance} Vi${counts.visual}`,
    });
  }
  // ステの高さの順（指定があるときだけ。NGなら今の順を添える）
  if (settings.statOrder) {
    const short = statOrderShortfall(input.capped, settings.statOrder);
    const now = [...TYPE_KEYS]
      .sort((a, b) => input.capped[b] - input.capped[a])
      .map((t) => TYPE_JA[t])
      .join("＞");
    out.push({
      label: `ステの順（${settings.statOrder.map((t) => TYPE_JA[t]).join("＞")}）`,
      ok: short === 0,
      detail: short > 0 ? `今は ${now}` : undefined,
    });
  }
  if (TYPE_KEYS.some((t) => settings.minStats[t] > 0)) {
    const bad = TYPE_KEYS.filter(
      (t) => settings.minStats[t] > 0 && input.capped[t] < settings.minStats[t],
    );
    out.push({
      label: "最低ステ",
      ok: bad.length === 0,
      detail: bad.length ? bad.map((t) => TYPE_JA[t]).join("・") + "未達" : undefined,
    });
  }
  if (
    TYPE_KEYS.some((t) => settings.maxStats[t] > 0 && settings.maxStats[t] < input.statCap)
  ) {
    const bad = TYPE_KEYS.filter(
      (t) =>
        settings.maxStats[t] > 0 &&
        settings.maxStats[t] < input.statCap &&
        input.capped[t] > settings.maxStats[t],
    );
    out.push({
      label: "最高ステ",
      ok: bad.length === 0,
      detail: bad.length ? bad.map((t) => TYPE_JA[t]).join("・") + "超過" : undefined,
    });
  }
  return out;
}
