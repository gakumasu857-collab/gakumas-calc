import autoAbilityData from "./generated/autoAbilities.json" with { type: "json" };

/**
 * ゲーム内の名称・キーの定数定義（ユーザー提供のconstがベース）。
 *
 * 方針: コード内ではキー(英語)で扱い、表示・CSVの照合では日本語ラベルを使う。
 * CSVのラベル表記ゆれは ABILITY_LABEL_ALIASES と normalizeLabel() で吸収する。
 */

// レアリティ（CSVの「配布SSR」は EventSSR として扱う）
export const RARITY_NAMES = {
  R: "R",
  SR: "SR",
  SSR: "SSR",
  EventSSR: "イベントSSR",
} as const satisfies Record<string, string>;
export type Rarity = keyof typeof RARITY_NAMES;

/** CSV上のレアリティ表記 → キー */
export const RARITY_ALIASES: Record<string, Rarity> = {
  R: "R",
  SR: "SR",
  SSR: "SSR",
  配布SSR: "EventSSR",
  イベントSSR: "EventSSR",
  EventSSR: "EventSSR",
};

// アイドル
export const IDLE_NAMES = {
  hanami_saki: "花海 咲季",
  tsukimura_temari: "月村 手毬",
  hujita_kotone: "藤田 ことね",
  amaya_tsubame: "雨谷 燕",
  arimura_mao: "有村 麻央",
  katsuragi_lilja: "葛城 リーリヤ",
  kuramoto_china: "倉本 千奈",
  shiun_sumika: "紫雲 清夏",
  shinosawa_hiro: "篠澤 広",
  himesaki_rinami: "姫﨑 莉波",
  hanami_ume: "花海 佑芽",
  hataya_misuzu: "秦谷 美鈴",
  juo_sena: "十王 星南",
} as const satisfies Record<string, string>;

// サポカのタイプ
export const CARD_TYPE_NAMES = {
  vocal: "Vocal",
  dance: "Dance",
  visual: "Visual",
  assist: "アシスト",
} as const satisfies Record<string, string>;
export type CardType = keyof typeof CARD_TYPE_NAMES;

// アビリティ
// 注: 元のconstでは charge/aggressive のラベルが EFFECT_NAMES と逆だったため、
//     charge=温存 / aggressive=強気 に統一した。
// ここに無い名前がスプシに出てきたら、update-all（check:labels）が generated/autoAbilities.json に書き、
// 下の ABILITY_NAMES に `auto:<名前>` のキーで自動で入る（2026-10-14〜。オーナー「いちいち頼まずに update-all だけで」）。
// 特別なルール（踏み方から決まる・足し算・連動・固定回数）があるものや改名のときだけ、ここに手で書く。
const MANUAL_ABILITY_NAMES = {
  lesson: "タイプレッスン",
  sp_lesson: "タイプSPレッスン",
  normal_lesson: "タイプ通常レッスン",
  skill_ac: "スキル獲得",
  A_skill_ac: "Aスキル獲得",
  M_skill_ac: "Mスキル獲得",
  positive_skill_ac: "好調スキル獲得",
  focus_skill_ac: "集中スキル獲得",
  charm_skill_ac: "好印象スキル獲得",
  vitality_skill_ac: "やる気スキル獲得",
  charge_skill_ac: "温存スキル獲得",
  aggressive_skill_ac: "強気スキル獲得",
  burst_skill_ac: "全力スキル獲得",
  barrier_skill_ac: "元気スキル獲得",
  SSR_skill_ac: "SSRスキル獲得",
  skill_enhance: "スキル強化",
  A_skill_enhance: "Aスキル強化",
  M_skill_enhance: "Mスキル強化",
  // 「好調スキル強化」「好印象スキル強化」「温存スキル強化」のような属性つきのスキル強化は、ここには置かない
  // （いまは全部「スキル強化」として判定する。下の SKILL_ENHANCE_ATTRS）
  skill_del: "スキル削除",
  A_skill_del_ut3: "Aスキル削除(3回まで)",
  M_skill_del_ut3: "Mスキル削除(3回まで)",
  skill_del_ut4: "スキル削除(4回まで)",
  // チェンジ・カスタマイズは、系統でいちばん回数の多い「(N回まで)」をプロデュースで持つ（オーナー指定 2026-10-14）。
  // 同じ系統の小さい「(N回まで)」（例: カスタマイズ(3回まで)）はその頭打ち（abilityCounts.ts の capOfLabel）
  change_ut3: "チェンジ(3回まで)",
  study: "授業・営業",
  // N.I.A の営業先「Pポイント営業」を踏む回数（サポカのアビリティではなく、プロデュースの回数として持つ。1回 +50P）
  p_sale: "Pポイント営業",
  date: "お出かけ",
  date_ut2: "お出かけ(2回まで)",
  meeting: "相談",
  meeting_ut2: "相談(2回まで)",
  supply: "活動支給・差し入れ",
  supply_ut2: "活動支給・差し入れ(2回まで)",
  rest: "休む",
  extra_lecture_ut3: "特別指導(3回まで)",
  // ↓現行スプシでリネームされたので追従（旧: Pドリンク獲得/Pドリンク交換/好印象8枚以上(4回まで)）。
  // 発動回数セット(abilityCounts)はこのキーで回数を持つため、ラベルを現行名に合わせないと
  // カード側の現行ラベルから回数が引けず加点0になる（＝ドリンク採点が切れる）。
  drink_exchange: "ドリンク交換",
  drink_get: "ドリンク獲得",
  custom_ut6: "カスタマイズ(6回まで)",
  SP_lesson_20s_ut4: "20枚以上SPレッスン(4回まで)",
  p_item_get_ut6: "Pアイテム獲得(6回まで)",
  charm_8plus_ut4: "好印象8枚以上スキル獲得(4回まで)",
  up_SP_lesson_rate: "SPレッスン率アップ",
  // 2026-09 スプシ改名: 「試験・オーディション」→「試験・オーディション終了」（起動タグ・回復・(N回まで) すべて）
  stage_finish_ut2: "試験・オーディション終了(2回まで)",
  stage_finish: "試験・オーディション終了",
  initial: "初期値",
  bonus: "パラメータボーナス",
  param_event: "パラメータイベント",
  // 2026-09: カードのアビリティ枠は「○○イベント率」になった。イベント本体（パラメータ/Pポイント/
  // 回復）はステイベ・前イベ・後イベ列で持ち、率は対応するイベントの値に (1+率) で掛かる
  param_event_rate: "パラメータイベント率",
  p_point_event_rate: "Pポイントイベント率",
  recovery_event_rate: "回復イベント率",
  p_point: "Pポイント",
  p_point_rate_type_sp: "タイプSPレッスンPポイント率",
  p_point_rate_lesson: "レッスンPポイント率",
  recovery_stage_finish: "試験・オーディション終了回復",
  // 現行スプシ(abilityValues)にあるが従来コード化していなかった非スコア寄りアビリティ。
  // スコアはrawラベル経由でperfに一致して計算済み（ここは表示・dev警告解消・アビリティ一覧の
  // 完全化のための登録で点数は不変）。回復・率・Pポイント系は発動回数0に解決＝非スコア。
  // ラベルは半角括弧（照合はnormalizeLabelで全角/半角・空白を吸収）。
  lesson_support_rate: "レッスンサポート率",
  all_sp_lesson_rate_14: "全タイプSPレッスン率",
  all_sp_lesson_rate_28: "全タイプSPレッスン率(28%)",
  meeting_drink_discount: "相談ドリンク割引",
  p_point_event: "Pポイントイベント",
  recovery_type_sp_lesson: "タイプSPレッスン時回復",
  recovery_sp_lesson: "SPレッスン時回復",
  recovery_supply: "差し入れ時回復",
  recovery_event: "回復イベント",
  max_hp_up: "最大体力上昇",
  max_hp_up_1abi: "最大体力上昇(1アビ)",
  charge_8plus_ut4: "温存8枚以上スキル獲得(4回まで)",
  focus_8plus_ut4: "集中8枚以上スキル獲得(4回まで)",
  // 2026-09-21 新カード「わたしに、まかせて」のアビリティ
  burst_8plus_ut4: "全力8枚以上スキル獲得(4回まで)",
  // 2026-10-07 新カード「小悪魔になっちゃえ♪」のアビリティ
  positive_8plus_ut4: "好調8枚以上スキル獲得(4回まで)",
  drink_get_ut10: "ドリンク獲得(10回まで)",
  skill_exchange_ut5: "スキル交換(5回まで)",
  // 2026-09 新カード「もうすぐ本番ですね」のアビリティ（同月に「基本チェンジ」→「基本スキルチェンジ」に改名）
  basic_change_ut3: "基本スキルチェンジ(3回まで)",
  stage_finish_15plus_ut5: "15枚以上試験・オーディション終了(5回まで)",
  nothing: "なし",
} as const satisfies Record<string, string>;

/** 自動で登録したアビリティのキー（`auto:` ＋正規化した名前） */
export type AutoAbilityKey = `auto:${string}`;
export type AbilityName = keyof typeof MANUAL_ABILITY_NAMES | AutoAbilityKey;

/** 自動で登録したアビリティ（update-all の check:labels が書く）。count＝回数として参照されている（起動タグ・trigger_tag・発動回数タブ） */
type AutoAbilityEntry = { label: string; count: boolean };
const AUTO_ENTRIES: readonly AutoAbilityEntry[] =
  (autoAbilityData as { abilities?: AutoAbilityEntry[] }).abilities ?? [];

/**
 * スプレッドシート側の表記ゆれ → キー。
 * ABILITY_NAMES のラベルと完全一致しない書き方はここに追記していく。
 * ※スプシで名前を「変えた」ときは、ここに旧名を足すのではなく ABILITY_NAMES の日本語名を
 *   書き換える（docs/ARCHITECTURE.md 4-1 C-2）。ここは「同じものを別の場所で別表記にしている」用。
 */
const ABILITY_LABEL_ALIASES: Record<string, AbilityName> = {
  // カードのアビリティ名は「タイプSPレッスン率」（ABILITY_NAMES は表示用に「アップ」付き）。旧表記も受ける
  タイプSPレッスン率: "up_SP_lesson_rate",
  SPレッスン率: "up_SP_lesson_rate",
  // 2026-09 の改名前の表記（古いセーブや古いスプシ）
  レッスン: "lesson",
  SPレッスン: "sp_lesson",
  通常レッスン: "normal_lesson",
  全SPレッスン率: "all_sp_lesson_rate_14",
  "全SPレッスン率(28%)": "all_sp_lesson_rate_28",
  何もなし: "nothing",
  // 発動回数タブの行名がこの表記のまま（カード側は「ドリンク獲得」「ドリンク交換」）
  Pドリンク獲得: "drink_get",
  Pドリンク交換: "drink_exchange",
};

/** ラベルの正規化: 全角括弧→半角、空白除去。照合はこの形で行う */
function normalizeLabel(label: string): string {
  return label
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/\s+/g, "")
    .trim();
}

/**
 * 属性つきの「○○スキル強化」（前イベ起動タグの「好調スキル強化」「好印象スキル強化」「温存スキル強化」など）。
 * いまは全部「スキル強化」として判定する＝スキル強化が1回あったら1回発動（オーナー指定 2026-10-07）。
 * 2026-09-21 に入れた「温存スキル強化」専用の回数（charge_skill_enhance）と、後イベのランダム強化で
 * 属性を選ぶボタンは、この仕様変更でやめた。
 * 属性ごとの判定が必要になったら: 発動回数のシートに行を足し、その属性をここから外して ABILITY_NAMES に登録する。
 */
const SKILL_ENHANCE_ATTRS = [
  "好調",
  "集中",
  "好印象",
  "やる気",
  "温存",
  "強気",
  "全力",
  "元気",
  "SSR",
] as const;
const ATTR_SKILL_ENHANCE_LABELS: ReadonlySet<string> = new Set(
  SKILL_ENHANCE_ATTRS.map((attr) => normalizeLabel(`${attr}スキル強化`)),
);
/**
 * 属性つきのスキル強化の名前か（＝「スキル強化」として判定する名前）。
 * 発動回数のシートにこの名前の行があっても、回数としては使わない（abilityCounts.ts の toCountTable）。
 */
export function isAttrSkillEnhanceLabel(label: string): boolean {
  return ATTR_SKILL_ENHANCE_LABELS.has(normalizeLabel(label));
}

// 正規化済みラベル → キー の逆引きテーブルを構築
const LABEL_TO_KEY = new Map<string, AbilityName>();
for (const [key, label] of Object.entries(MANUAL_ABILITY_NAMES)) {
  LABEL_TO_KEY.set(normalizeLabel(label), key as AbilityName);
}
for (const [label, key] of Object.entries(ABILITY_LABEL_ALIASES)) {
  LABEL_TO_KEY.set(normalizeLabel(label), key);
}
// 属性つきのスキル強化は「スキル強化」と同じ回数で判定する
for (const label of ATTR_SKILL_ENHANCE_LABELS) LABEL_TO_KEY.set(label, "skill_enhance");
// 括弧なしの表記（supMaster の「前イベ起動タグ」列は「チェンジ」「特別指導」のように
// (N回まで) を付けない）は、「その名前(N回まで)」の正式名のうちいちばん N が大きいものへ結び付ける
// （例: 「カスタマイズ」→ カスタマイズ(6回まで)。2026-10-14 までは「ちょうど1つあるとき」だけ）。
// 「スキル削除」のように括弧なしの正式名が別にあるときはそちらが優先（上で登録済みなので触らない）。
function linkBareLabels(entries: [string, string][]): void {
  const best = new Map<string, { key: AbilityName; cap: number }>();
  for (const [key, label] of entries) {
    const m = normalizeLabel(label).match(/^(.+?)\((\d+)回まで\)$/);
    if (!m) continue;
    const cap = Number(m[2]);
    const cur = best.get(m[1]);
    if (!cur || cap > cur.cap) best.set(m[1], { key: key as AbilityName, cap });
  }
  for (const [base, { key }] of best) {
    if (!LABEL_TO_KEY.has(base)) LABEL_TO_KEY.set(base, key);
  }
}
linkBareLabels(Object.entries(MANUAL_ABILITY_NAMES));

/** 手で書いた名前だけで引いたキー（check:labels が「自動で登録が要る名前」を見つけるのに使う。自動で登録したキーは数えない） */
export function manualAbilityKeyFromLabel(label: string): AbilityName | undefined {
  const key = LABEL_TO_KEY.get(normalizeLabel(label));
  return key && !key.startsWith("auto:") ? key : undefined;
}

/** 自動で登録した名前（手で書いた名前と同じものは除く。手で登録したらそちらが優先） */
const AUTO_ABILITIES: { key: AutoAbilityKey; label: string; count: boolean }[] = [];
for (const entry of AUTO_ENTRIES) {
  const norm = normalizeLabel(entry.label);
  if (!norm || LABEL_TO_KEY.has(norm)) continue;
  const key: AutoAbilityKey = `auto:${norm}`;
  LABEL_TO_KEY.set(norm, key);
  AUTO_ABILITIES.push({ key, label: entry.label, count: entry.count });
}
// 自動で登録した「(N回まで)」だけの系統も、括弧なしの名前をいちばん N の大きいものへ
linkBareLabels(AUTO_ABILITIES.map((a) => [a.key, a.label]));

/** 自動で登録したアビリティのうち、回数として参照されるもの（プロデュース設定の「その他」に出す候補） */
export const AUTO_COUNT_ABILITY_KEYS: readonly AutoAbilityKey[] = AUTO_ABILITIES.filter(
  (a) => a.count,
).map((a) => a.key);

/** 自動で登録したアビリティのキーか */
export function isAutoAbilityKey(key: string): key is AutoAbilityKey {
  return key.startsWith("auto:");
}

/** アビリティの内部キー → 表示名（手で書いた名前＋自動で登録した名前） */
export const ABILITY_NAMES: Readonly<Record<AbilityName, string>> = {
  ...MANUAL_ABILITY_NAMES,
  ...Object.fromEntries(AUTO_ABILITIES.map((a) => [a.key, a.label])),
} as Record<AbilityName, string>;

/** ラベルの正規化（全角括弧→半角、空白除去）。外から照合に使う用 */
export function normalizeAbilityLabel(label: string): string {
  return normalizeLabel(label);
}

/**
 * 日本語ラベルからアビリティキーを引く。
 * 未知のラベルは undefined（呼び出し側で raw のまま保持して警告する）。
 * 点数計算の回数解決から毎評価呼ばれるため、ラベルごとの結果をメモ化する（ラベルは有限）。
 */
const keyCache = new Map<string, AbilityName | undefined>();
export function abilityKeyFromLabel(label: string): AbilityName | undefined {
  if (keyCache.has(label)) return keyCache.get(label);
  const key = LABEL_TO_KEY.get(normalizeLabel(label));
  keyCache.set(label, key);
  return key;
}
