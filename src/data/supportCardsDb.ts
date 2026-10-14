/**
 * サポカDB（CSV由来）へのアクセス層。
 *
 * generated/supportCards.json（gen:cardsで生成される「ヘッダー名→値」の生データ）を
 * 型の付いた SupportCardData に変換する。CSVの解釈はすべてこのファイルに集約し、
 * 列やアビリティ名が増えたときの修正箇所を1箇所にする。
 *
 * 変換の方針:
 * - 知らないアビリティラベル → キー変換せず { raw: "..." } で保持（データを落とさない）
 * - 知らない列 → extras にそのまま残す（後から使える）
 */
import preEventImageNames from "./generated/preEventImages.json";
import rawRows from "./generated/supportCards.json";
import {
  abilityKeyFromLabel,
  RARITY_ALIASES,
  type AbilityName,
  type CardType,
  type Rarity,
} from "./constants";

/** アビリティ枠。キー化できなかったラベルは raw のまま保持する */
export type AbilitySlot =
  | { key: AbilityName }
  | { raw: string };

/** 前イベで発動する1アクション（発動する内容と強さ）。value=0 は回数指定なしのフラグ（獲得スキルの種別など） */
export type PreEventAction = { label: string; value: number };

/** 前イベの詳細（トリガー・強さ・発動する内容）。データベース表示や計算内訳で使う */
export type PreEventInfo = {
  /** 種別: アイテム / スキル / 何もなし（= preEventType と同じ） */
  kind: string;
  /** 発動トリガー（＝発動回数の参照キー）。例: VisualSPレッスン / スキル強化 / 初期値 */
  trigger: string;
  /** 最大発動回数（9999=実質無制限） */
  maxActivations: number;
  /** パラメータ上昇値（前イベ=Pアイテムのパラメ獲得。0なら無し） */
  param: number;
  /** 発動する内容（スキル獲得・強化・削除・チェンジ・ドリンク・回復・Pポイント等） */
  actions: PreEventAction[];
};

export type SupportCardData = {
  /**
   * 保存キー `card:<スプシのid>`（2026-10-08〜。id が無い行だけ `card:<名前>`）。所持状況・固定/BAN・編成・セーブデータはこれで持つ。
   * 以前は `card:<名前>` だったので、カード名を変えると保存データが切れていた。旧キーは各ストアが読むときに idMigration.ts で写す。
   */
  id: string;
  /** スプシ supMaster の id 列（登場順の通し番号。2026-10-07 に重複が解消されて一意になった）。保存キーの元なので、スプシ側で変えない・使い回さない */
  sheetId: number;
  /** 登場日（YYYY-MM-DD。スプシの「登場日」列＝日付の通し番号から変換。無ければ ""）。一覧の「新しい順」と、データベースの表示に使う */
  releaseDate: string;
  name: string;
  rarity: Rarity;
  /** Vocal / Dance / Visual / アシスト */
  cardType: CardType | string;
  /**
   * アビリティ1〜6を位置そのままで保持（「何もなし」「空欄」は null）。
   * 枠の位置は凸解放段階に対応する可能性があるため詰めない。
   */
  abilities: (AbilitySlot | null)[];
  /**
   * アビリティ1〜6の効果タイプ（abi_type列: Vocal/Dance/Visual/Assist）。
   * アシスト（トレーナー）カードは枠ごとに効くタイプが違うため、これで判定する。
   * Assist はステに直接効かない枠（率系・P系・回復系など）。
   */
  abilityTypes: string[];
  /** 使用制限（プラン）: 共通 / センス / ロジック / アノマリー */
  plan: string;
  /** 前イベ（アイテム/スキル/パラメータ）・後イベ（強化/チェンジ/Pポイント等） */
  preEventType: string;
  postEventType: string;
  /**
   * ステイベ（1育成に1回のランダムイベント）の種類:
   * パラメータイベント / Pポイントイベント / 回復イベント / 何もなし。
   * 値は「レアリティ別の基本値 × (1 + 対応する○○イベント率アビリティ)」（sheetScore）。
   */
  statEventType: string;
  /** 前イベの構造化詳細（トリガー・強さ・発動内容） */
  preEvent: PreEventInfo;
  /**
   * スプシの「前イベ起動タグ」「最大発動回数」の生値（データベース表示用）。
   * 計算用の preEvent はスキル前イベに「初期値・1回」を補完しているが、
   * データベースページはスプシと同期した見た目にするため補完前の値を出す。
   */
  sheetPreEvent: { trigger: string; max: string };
  /** 検索タグ（スプシ「検索ワード」列。別名・アイドル名など。カンマ区切りを分割済み） */
  searchWords: string[];
  /** 前イベで得るアイテム/スキルの正式名（スプシ「前イベ名」列。無ければ""） */
  itemName: string;
  /**
   * アイテム評価（スプシ「強さ」列）。前イベで得るアイテム/スキルが
   * 試験中どれだけ強いかの評点（-5〜7程度）。空欄は null＝試験の助けにならない。
   */
  strongest: number | null;
  /**
   * 前イベ（アイテム/スキル）の画像パス（R2の preEvent/ 配下。無ければ null）。
   * 画像は前イベ名で命名されており、「前イベ名」列と一致するカードは
   * ここで自動的に対応づく（preEventImages.json = R2にある画像名の一覧）。
   */
  preEventImage: string | null;
  /**
   * アイテムのおすすめ育成スタイル（スプシ「おすすめプラン」列を分割）。
   * 例: ["好調","集中"] / ["やる気","好印象"] / ["共通"]（=どのスタイルでも有効）。
   * 試験補助の評点はこのスタイルが現在の育成に合うときだけ加点する。
   */
  recommendPlans: string[];
  /** ステージ（試験中）に持ち込むPアイテムか（スプシ「前イベ」列＝ステージ用アイテム） */
  stageItem: boolean;
  /** 上記以外の列すべて（列名→値）。新列は自動的にここへ入る */
  extras: Record<string, string>;
};

/** 変換時に見つかった未知のアビリティラベル（データ整備の手掛かり用） */
export const UNKNOWN_ABILITY_LABELS = new Set<string>();

// コード内部のキー名（スプシの日本語ヘッダーは HEADER_ALIASES でここへ写す）
const COL = {
  name: "name",
  rarity: "rarity",
  cardType: "type",
  abilityPrefix: "ability", // ability1〜6（値は日本語のまま）
  plan: "plan",
} as const;

/**
 * スプシ supMaster の日本語ヘッダー → コード内部のキー名。
 * スプシの列名を変えたらここを直す（列の意味が変わるときは convert() も）。
 * アビリティ枠（1アビ/1タイプ…）は normalizeRow で個別に写す。
 */
const HEADER_ALIASES: Record<string, string> = {
  サポカ名: "name",
  // 2026-10-07 追加: 登場日（スプシの日付＝1899-12-30 からの日数の通し番号）
  登場日: "release_date",
  レアリティ: "rarity",
  タイプ: "type",
  プラン: "plan",
  後イベ: "later_event",
  前イベ名: "item_name",
  // 前イベの種類: スキル / ステージ用アイテム / プロデュース用アイテム / パラメータイベント
  前イベ: "pre_event_kind",
  // ステイベの種類: パラメータイベント / Pポイントイベント / 回復イベント（空=無し）
  ステイベ: "stat_event",
  強さ: "strongest",
  おすすめプラン: "recommend_plan",
  前イベ起動タグ: "triggered_by",
  最大発動回数: "max",
  パラメータ: "param",
  スキル獲得: "skill_ac",
  Aスキル獲得: "A_skill_ac",
  Mスキル獲得: "M_skill_ac",
  好調スキル獲得: "positive_skill_ac",
  集中スキル獲得: "focus_skill_ac",
  好印象スキル獲得: "charm_skill_ac",
  やる気スキル獲得: "vitality_skill_ac",
  強気スキル獲得: "aggressive_skill_ac",
  温存スキル獲得: "charge_skill_ac",
  全力スキル獲得: "burst_skill_ac",
  元気スキル獲得: "barrier_skill_ac",
  SSRスキル獲得: "SSR_skill_ac",
  スキル強化: "skill_enhance",
  Aスキル強化: "A_skill_enhance",
  Mスキル強化: "M_skill_enhance",
  スキル削除: "skill_del",
  Aスキル削除: "A_skill_del_ut3",
  Mスキル削除: "M_skill_del_ut3",
  チェンジ: "change_ut3",
  ドリンク獲得: "drink_get",
  Pアイテム獲得: "p_item_get_ut3",
  Pポイント: "p_point",
  回復: "recovery",
  検索ワード: "Search_word",
};

/** スプシの行（日本語ヘッダー）を内部キー名の行へ写す */
function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const [jp, en] of Object.entries(HEADER_ALIASES)) {
    if (jp in row && !(en in out)) out[en] = row[jp];
  }
  for (let i = 1; i <= 6; i++) {
    if (`${i}アビ` in row && !(`ability${i}` in out)) out[`ability${i}`] = row[`${i}アビ`];
    if (`${i}タイプ` in row && !(`abi_type${i}` in out))
      out[`abi_type${i}`] = row[`${i}タイプ`];
  }
  return out;
}

/** ステイベの種類（スプシ「ステイベ」列の値） */
const STAT_EVENT_TYPES = new Set(["パラメータイベント", "Pポイントイベント", "回復イベント"]);

/** サポカのタイプ（英語）→ アプリ内の表記 */
const CARD_TYPE_JP: Record<string, string> = {
  Vocal: "Vocal",
  Dance: "Dance",
  Visual: "Visual",
  Assist: "アシスト",
};

/** スキル獲得の分類（英語 *_ac 列 → sheetScore が読むフラグキー。0/1→TRUE/FALSE） */
const SKILL_FLAG_MAP: Record<string, string> = {
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
};

/** 前イベの数値アクション（英語列 → sheetScore が読むキー。括弧は全角＝sheetScore準拠） */
const NUMERIC_ACTION_MAP: Record<string, string> = {
  skill_enhance: "スキル強化",
  A_skill_enhance: "Aスキル強化",
  M_skill_enhance: "Mスキル強化",
  skill_del: "スキル削除",
  A_skill_del_ut3: "Aスキル削除（3回まで）",
  M_skill_del_ut3: "Mスキル削除（3回まで）",
  change_ut3: "チェンジ", // 2026-10-14〜 元の回数（チェンジ（3回まで）はその頭打ち）
  drink_get: "ドリンク獲得",
  recovery: "体力回復",
};

/**
 * 後イベ（later_event の値 → アプリの後イベ語彙）。
 * トラブル削除（trouble_delete）とスキル削除は別物:
 * トラブル削除はデッキのトラブルカードを消す（汎用スキル削除アビのみ反応）、
 * スキル削除は選んだスキルを1枚消す（A/M属性を選択できる。デフォルトA）。
 */
const LATER_EVENT_MAP: Record<string, string> = {
  スキル強化: "強化",
  選択スキル強化: "強化", // 強化先を選べる（A/Mの割り振りUIは同じ）
  選択スキル削除: "スキル削除",
  Pポイントイベント: "Pポイント",
  チェンジ: "チェンジ",
  トラブル削除: "トラブル削除",
};

/** 「何もなし」系の空欄扱いにするラベル */
const EMPTY_LABELS = new Set(["", "何もなし", "なし", "-"]);

function toAbilitySlot(label: string): AbilitySlot | null {
  if (EMPTY_LABELS.has(label.trim())) return null;
  const key = abilityKeyFromLabel(label);
  if (key) return { key };
  UNKNOWN_ABILITY_LABELS.add(label);
  return { raw: label };
}

/** 前イベで発動する数値アクションの表示順（extras の日本語キー） */
const PRE_EVENT_ACTION_KEYS = [
  "スキル獲得",
  "スキル強化",
  "Aスキル強化",
  "Mスキル強化",
  "スキル削除",
  "Aスキル削除（3回まで）",
  "Mスキル削除（3回まで）",
  "チェンジ",
  "ドリンク獲得",
  "体力回復",
  "アイテムPポ",
] as const;
/** extras の「アイテムPポ」だけ表示名を Pポイント に読み替える */
const PRE_EVENT_ACTION_LABEL: Record<string, string> = { アイテムPポ: "Pポイント" };

/**
 * 前イベの構造化詳細を extras から組み立てる。
 * トリガー・最大発動回数・パラメータ・発動する内容（スキル獲得の種別＋数値アクション）をまとめる。
 */
function buildPreEvent(kind: string, extras: Record<string, string>): PreEventInfo {
  const n = (k: string) => numOf(extras[k]);
  const actions: PreEventAction[] = [];
  for (const key of PRE_EVENT_ACTION_KEYS) {
    const v = n(key);
    if (v > 0) actions.push({ label: PRE_EVENT_ACTION_LABEL[key] ?? key, value: v });
  }
  // 獲得スキルの分類フラグ（Mスキル獲得 等）は種別タグとして value=0 で並べる
  for (const label of Object.values(SKILL_FLAG_MAP)) {
    if (extras[label] === "TRUE") actions.push({ label, value: 0 });
  }
  return {
    kind,
    trigger: extras["前イベ発動参照回数"] ?? "",
    maxActivations: n("最大発動回数"),
    param: n("パラメータ上昇値"),
    actions,
  };
}

const numOf = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** スプシの日付（1899-12-30 からの日数の通し番号。例 46295＝2026-09-30）を YYYY-MM-DD にする。空・不正は "" */
function sheetDateToIso(v: unknown): string {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "";
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000).toISOString().slice(0, 10);
}
/** JSON値（string|number|null）を文字列に正規化して trim */
const str = (v: unknown): string =>
  v == null ? "" : (typeof v === "string" ? v : String(v)).trim();

/** R2にある前イベ画像の名前一覧（Search_word との突合用） */
const PRE_EVENT_IMAGE_SET = new Set<string>(preEventImageNames as string[]);

function convert(rawRow: Record<string, unknown>): SupportCardData | null {
  const row = normalizeRow(rawRow);
  const name = str(row[COL.name]);
  // 名前のない行やシート用のダミー行（固定用）はスキップ
  if (!name || name === "固定用") return null;

  // 6枠を位置そのままで保持（何もなし/空欄は null）
  const abilities: (AbilitySlot | null)[] = Array.from({ length: 6 }, (_, i) =>
    toAbilitySlot(str(row[`${COL.abilityPrefix}${i + 1}`])),
  );
  const abilityTypes = Array.from({ length: 6 }, (_, i) =>
    str(row[`abi_type${i + 1}`]),
  );

  // 前イベの種類（スプシ「前イベ」列）
  const preKind = str(row.pre_event_kind);
  const isSkill = preKind === "スキル";
  const isStageItem = preKind === "ステージ用アイテム";
  const itemName = str(row.item_name);
  // 前イベがアイテムを与えるか。「Pアイテム獲得」列は「Pアイテム獲得(6回まで)にカウント
  // されるか」のフラグで、カウントされないアイテム（近年のカード）は「前イベ名」で判定する
  const isItem = numOf(row.p_item_get_ut3) > 0 || (!isSkill && itemName !== "");
  const param = numOf(row.param);

  // sheetScore が読む extras を「アプリが期待する日本語キー」で組み立てる
  // （sheetScore 側は無改修＝ここで英語→日本語・0/1→TRUE/FALSE を吸収）。
  const extras: Record<string, string> = {};
  const setNum = (key: string, v: number) => {
    if (v > 0) extras[key] = String(v);
  };

  // 前イベ=Pアイテムでのパラメータ獲得（param>0 のカードが対象）
  if (param > 0) {
    extras["パラメPアイテム"] = "TRUE";
    extras["パラメータ上昇値"] = String(param);
  }
  // 前イベの発動回数。スキル前イベは supMaster が max/triggered_by 空なので
  // 旧挙動（max=1・参照=初期値で1回発動）を補完する。
  if (isSkill) {
    extras["最大発動回数"] = "1";
    extras["前イベ発動参照回数"] = "初期値";
  } else {
    setNum("最大発動回数", numOf(row.max));
    if (str(row.triggered_by)) extras["前イベ発動参照回数"] = str(row.triggered_by);
  }
  // 任意スキル○○: どの分類のスキルに作用するかをユーザーが選ぶアクション。
  // 合計回数は max(汎用列, 任意列)（スプシは行によって片方だけに書かれている）。
  const anyAc = numOf(row["任意スキル獲得"]);
  const anyEnhance = numOf(row["任意スキル強化"]);
  const anyDel = numOf(row["任意スキル削除"]);

  // スキル獲得（総数）＋分類フラグ
  setNum("スキル獲得", Math.max(numOf(row.skill_ac), anyAc));
  for (const [col, key] of Object.entries(SKILL_FLAG_MAP)) {
    if (numOf(row[col]) > 0) extras[key] = "TRUE";
  }
  // 任意スキル獲得: 1回ごとの分類（A/M・プラン属性・SSR等）は回数設定UIで選ぶ
  setNum("任意スキル獲得", anyAc);
  // 前イベの数値アクション（強化・削除・チェンジ・ドリンク・回復）
  for (const [col, key] of Object.entries(NUMERIC_ACTION_MAP)) {
    const base = numOf(row[col]);
    if (col === "skill_enhance") setNum(key, Math.max(base, anyEnhance));
    else if (col === "skill_del") setNum(key, Math.max(base, anyDel));
    else setNum(key, base);
  }
  setNum("アイテムPポ", numOf(row.p_point));
  // このアイテムの取得が「Pアイテム獲得(6回まで)」アビリティにカウントされるか
  // （sheetScore のイベント相互作用が参照。item_name だけのアイテムはカウントされない）
  if (numOf(row.p_item_get_ut3) > 0) extras["Pアイテム獲得対象"] = "TRUE";

  const preEventType = isSkill
    ? "スキル"
    : isItem
      ? "アイテム"
      : preKind === "パラメータイベント"
        ? "パラメータ" // Rサポカ: 前イベでパラメータイベント（率アビが掛かる）
        : "何もなし";
  const postEventType = LATER_EVENT_MAP[str(row.later_event)] ?? "何もなし";
  // ステイベ列（空=無し）
  const statRaw = str(row.stat_event);
  const statEventType = STAT_EVENT_TYPES.has(statRaw) ? statRaw : "何もなし";

  const sheetId = numOf(row.id);
  return {
    // 保存キーはスプシの id（id が無い行だけ名前）。旧キー card:名前 は idMigration.ts が読むときに写す
    id: sheetId > 0 ? `card:${sheetId}` : `card:${name}`,
    sheetId,
    releaseDate: sheetDateToIso(row.release_date),
    name,
    rarity: RARITY_ALIASES[str(row[COL.rarity])] ?? "SSR",
    cardType: CARD_TYPE_JP[str(row[COL.cardType])] ?? "",
    abilities,
    abilityTypes,
    plan: str(row[COL.plan]),
    preEventType,
    postEventType,
    preEvent: buildPreEvent(preEventType, extras),
    sheetPreEvent: { trigger: str(row.triggered_by), max: str(row.max) },
    // 区切りは半角カンマのみ（「その本、おもしろい？」のように語の中に
    // 読点が入るため、読点では区切らない。スプシ側も , 区切りで統一されている）
    searchWords: str(row.Search_word)
      .split(",")
      .map((w) => w.trim())
      .filter(Boolean),
    itemName,
    // 前イベ画像は「前イベ名」と同名の R2 画像（preEvent/<前イベ名>.webp）
    preEventImage:
      itemName && PRE_EVENT_IMAGE_SET.has(itemName)
        ? `preEvent/${itemName}.webp`
        : null,
    strongest: str(row.strongest) === "" ? null : numOf(row.strongest),
    // 区切りはカンマ・読点のほか誤記のドットも許容（例: "強気.全力"）
    recommendPlans: str(row.recommend_plan)
      .split(/[,、.]/)
      .map((w) => w.trim())
      .filter(Boolean),
    stageItem: isStageItem,
    statEventType,
    extras,
  };
}

/** CSV由来のサポカ全件（gen:cards 未実行のうちは空配列） */
export const SUPPORT_CARD_DB: SupportCardData[] = (
  rawRows as unknown as Record<string, unknown>[]
)
  .map(convert)
  .filter((c): c is SupportCardData => c !== null);

if (UNKNOWN_ABILITY_LABELS.size > 0 && process.env.NODE_ENV !== "production") {
  console.warn(
    "[supportCardsDb] 未知のアビリティ名があります（constants.tsのABILITY_NAMESかALIASESに追加してください）:",
    [...UNKNOWN_ABILITY_LABELS],
  );
}
