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
export const ABILITY_NAMES = {
  lesson: "レッスン",
  sp_lesson: "SPレッスン",
  normal_lesson: "通常レッスン",
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
  skill_del: "スキル削除",
  A_skill_del_ut3: "Aスキル削除(3回まで)",
  M_skill_del_ut3: "Mスキル削除(3回まで)",
  skill_del_ut4: "スキル削除(4回まで)",
  change_ut3: "チェンジ(3回まで)",
  study: "授業・営業",
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
  stage_finish_ut2: "試験終了時(2回まで)",
  stage_finish: "試験・オーディション",
  initial: "初期値",
  bonus: "パラメータボーナス",
  param_event: "パラメータイベント",
  p_point: "Pポイント",
  p_point_rate_type_sp: "タイプSPレッスンPポイント率",
  p_point_rate_lesson: "レッスンPポイント率",
  recovery_sp: "SPレッスン回復",
  recovery_type_sp: "タイプSPレッスン回復",
  recovery_stage_finish: "試験終了時回復",
  // 現行スプシ(abilityValues)にあるが従来コード化していなかった非スコア寄りアビリティ。
  // スコアはrawラベル経由でperfに一致して計算済み（ここは表示・dev警告解消・アビリティ一覧の
  // 完全化のための登録で点数は不変）。回復・率・Pポイント系は発動回数0に解決＝非スコア。
  // ラベルは半角括弧（照合はnormalizeLabelで全角/半角・空白を吸収）。
  lesson_support_rate: "レッスンサポート率",
  all_sp_lesson_rate_14: "全SPレッスン率(14%)",
  all_sp_lesson_rate_28: "全SPレッスン率(28%)",
  meeting_drink_discount: "相談ドリンク割引",
  p_point_event: "Pポイントイベント",
  recovery_type_sp_lesson: "タイプSPレッスン時回復",
  recovery_sp_lesson: "SPレッスン時回復",
  recovery_supply: "差し入れ時回復",
  recovery_event: "回復イベント",
  max_hp_up: "最大体力上昇",
  nothing: "なし",
} as const satisfies Record<string, string>;
export type AbilityName = keyof typeof ABILITY_NAMES;

/**
 * CSV/スプレッドシート側の表記ゆれ → キー。
 * ABILITY_NAMES のラベルと完全一致しない書き方はここに追記していく。
 */
const ABILITY_LABEL_ALIASES: Record<string, AbilityName> = {
  "SPレッスン率": "up_SP_lesson_rate",
  何もなし: "nothing",
  体力なし: "nothing",
  "試験終了時": "stage_finish_ut2",
  // 前イベのトリガー列（triggered_by）は括弧なし表記
  特別指導: "extra_lecture_ut3",
  // supMaster で英語キーのまま残っているセルの受け皿（本来スプシ側で「差し入れ時回復」に直す）
  recovery_supply: "recovery_supply",
  // 発動回数タブ(abilityCountsHIF/NIA)は旧名のままの行があるので受ける
  // （abilityValues/supMaster は改名済み。将来スプシ側で統一するのが本筋）
  "Pドリンク獲得": "drink_get",
  "Pドリンク交換": "drink_exchange",
  "好印象8枚以上(4回まで)": "charm_8plus_ut4", // NIAタブは旧名（HIFは新名「〜スキル獲得〜」）
};

/** ラベルの正規化: 全角括弧→半角、空白除去。照合はこの形で行う */
function normalizeLabel(label: string): string {
  return label
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/\s+/g, "")
    .trim();
}

// 正規化済みラベル → キー の逆引きテーブルを構築
const LABEL_TO_KEY = new Map<string, AbilityName>();
for (const [key, label] of Object.entries(ABILITY_NAMES)) {
  LABEL_TO_KEY.set(normalizeLabel(label), key as AbilityName);
}
for (const [label, key] of Object.entries(ABILITY_LABEL_ALIASES)) {
  LABEL_TO_KEY.set(normalizeLabel(label), key);
}

/**
 * 日本語ラベルからアビリティキーを引く。
 * 未知のラベルは undefined（呼び出し側で raw のまま保持して警告する）。
 */
export function abilityKeyFromLabel(label: string): AbilityName | undefined {
  return LABEL_TO_KEY.get(normalizeLabel(label));
}
