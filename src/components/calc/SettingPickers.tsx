import { useState } from "react";
import Modal from "@/components/Modal";
import Hint from "@/components/Hint";
import NumberField from "@/components/NumberField";
import StatOrderPicker from "@/components/calc/StatOrderPicker";
import { GLOSSARY } from "@/lib/glossary";
import { imageUrl } from "@/lib/config";
import { P_IDOL_MASTERS } from "@/lib/pIdol";
import {
  SCENARIO_KEYS,
  SCENARIO_LABELS,
  SCENARIO_NOTES,
  type ScenarioKey,
} from "@/data/scenarios";
import {
  TYPE_KEYS,
  TYPE_LABELS,
  type CalcSettings,
  type TypeKey,
} from "@/lib/useCalcSettings";

/** ステの高さの順を決めたときの初期値（Vo＞Da＞Vi） */
const DEFAULT_STAT_ORDER: TypeKey[] = ["vocal", "dance", "visual"];

/** −／＋ボタン（SP率持ちの枚数） */
const STEP_BTN =
  "flex h-7 w-7 items-center justify-center text-base font-bold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30";

const TYPE_CHIP: Record<TypeKey, string> = {
  vocal: "bg-red-100 text-red-700",
  dance: "bg-blue-100 text-blue-700",
  visual: "bg-yellow-100 text-yellow-700",
};

/** 編成6枠のタイプ割り振り（−/＋で枚数を変え、合計は6まで。余りは「自由」枠） */
function TypeSlotAllocator({
  ratio,
  disabled,
  onChange,
}: {
  ratio: Record<TypeKey, number>;
  disabled: boolean;
  onChange: (type: TypeKey, value: number) => void;
}) {
  const total = TYPE_KEYS.reduce((sum, t) => sum + Math.max(0, ratio[t]), 0);
  const free = Math.max(0, 6 - total);
  // 6枠のバー（Vo→Da→Vi の順に並べ、余りは自由）
  const bar: (TypeKey | "free")[] = [];
  for (const t of TYPE_KEYS) {
    for (let i = 0; i < ratio[t] && bar.length < 6; i++) bar.push(t);
  }
  while (bar.length < 6) bar.push("free");
  const btn =
    "flex h-6 w-6 items-center justify-center rounded-md border border-slate-300 bg-white text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1">
        {bar.map((s, i) => (
          <span
            key={i}
            className={`flex h-8 flex-1 items-center justify-center rounded-md text-[11px] font-bold ${
              s === "free"
                ? "border border-dashed border-slate-300 text-slate-400"
                : TYPE_CHIP[s]
            }`}
          >
            {s === "free" ? "自由" : TYPE_LABELS[s].slice(0, 2)}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {TYPE_KEYS.map((t) => (
          <div key={t} className="flex items-center gap-1">
            <span
              className={`rounded px-1 py-0.5 text-[11px] font-bold ${TYPE_CHIP[t]}`}
            >
              {TYPE_LABELS[t]}
            </span>
            <button
              type="button"
              className={btn}
              disabled={disabled || ratio[t] <= 0}
              onClick={() => onChange(t, Math.max(0, ratio[t] - 1))}
              aria-label={`${TYPE_LABELS[t]}を1枚減らす`}
            >
              −
            </button>
            <span className="w-4 text-center text-sm font-bold">{ratio[t]}</span>
            <button
              type="button"
              className={btn}
              disabled={disabled || total >= 6}
              onClick={() => onChange(t, ratio[t] + 1)}
              aria-label={`${TYPE_LABELS[t]}を1枚増やす`}
            >
              ＋
            </button>
          </div>
        ))}
        <span className="text-[11px] text-slate-500">自由 {free}枚</span>
      </div>
    </div>
  );
}

/**
 * 探索の条件（理論評価値を求めるときの前提）をまとめるモーダル。
 * 「基本」（SP率持ちの枚数・タイプ割合・試験補助・ステージ用BAN）と
 * 「詳細」（最低/最高ステ・取得回数）の2タブ。説明は ⓘ に寄せる。
 */
export function TheorySettingsModal({
  settings,
  scenario,
  onUpdate,
  onClose,
}: {
  settings: CalcSettings;
  /** 今のシナリオ（選抜の点数配分の項目は H.I.F のときだけ出す） */
  scenario: ScenarioKey;
  onUpdate: (patch: Partial<CalcSettings>) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"basic" | "advanced">("basic");
  const budget = settings.eventBudget;
  const ratio = settings.typeRatio;
  const tabBtn = (key: "basic" | "advanced", label: string) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
        tab === key
          ? "bg-blue-600 text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {label}
    </button>
  );
  const statRow = (
    values: Record<TypeKey, number>,
    onChange: (type: TypeKey, v: number) => void,
  ) => (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {TYPE_KEYS.map((type) => (
        <label key={type} className="flex items-center gap-1">
          <span
            className={`rounded px-1 py-0.5 text-[11px] font-bold ${TYPE_CHIP[type]}`}
          >
            {TYPE_LABELS[type]}
          </span>
          <NumberField
            value={values[type]}
            onChange={(v) => onChange(type, v)}
            max={3200}
            sliderMax={3200}
            className="w-20"
          />
        </label>
      ))}
    </div>
  );

  return (
    <Modal title="探索の条件" onClose={onClose} widthClass="max-w-lg">
      <div className="mb-3 flex items-center gap-1.5">
        {tabBtn("basic", "基本")}
        {tabBtn("advanced", "詳細")}
        <span className="ml-auto text-[11px] text-slate-400">変更はすぐ保存されます</span>
      </div>
      <div className="flex flex-col gap-4 text-sm text-slate-700">
        {tab === "basic" ? (
          <>
            {/* SPレッスン率アップ持ちの最低枚数（レッスンを多く踏む上位2タイプ） */}
            <section>
              <p className="flex items-center gap-1 font-semibold">
                SPレッスン率アップ持ちの最低枚数
                <Hint text={GLOSSARY.spHolders} />
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                {(
                  [
                    ["first", "レッスンを1番多く踏むタイプ"],
                    ["second", "2番目に多く踏むタイプ"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-600">{label}</span>
                    <span className="inline-flex items-center overflow-hidden rounded-lg border border-slate-300 bg-white">
                      <button
                        type="button"
                        aria-label="1枚減らす"
                        disabled={settings.spTop[key] <= 0}
                        onClick={() =>
                          onUpdate({
                            spTop: { ...settings.spTop, [key]: Math.max(0, settings.spTop[key] - 1) },
                          })
                        }
                        className={STEP_BTN}
                      >
                        −
                      </button>
                      <span className="min-w-16 px-1 text-center text-sm font-bold tabular-nums text-slate-800">
                        {settings.spTop[key] === 0 ? "条件なし" : `${settings.spTop[key]}枚以上`}
                      </span>
                      <button
                        type="button"
                        aria-label="1枚増やす"
                        disabled={settings.spTop[key] >= 6}
                        onClick={() =>
                          onUpdate({
                            spTop: { ...settings.spTop, [key]: Math.min(6, settings.spTop[key] + 1) },
                          })
                        }
                        className={STEP_BTN}
                      >
                        ＋
                      </button>
                    </span>
                  </label>
                ))}
              </div>
            </section>

            {/* ステの高さの順（探索で、育成後ステがこの順になる編成・踏み方を選ぶ。3本の柱で決める） */}
            <section className="border-t border-slate-100 pt-3">
              <label className="flex items-center gap-1.5 font-semibold">
                <input
                  type="checkbox"
                  checked={!!settings.statOrder}
                  onChange={(e) =>
                    onUpdate({
                      statOrder: e.target.checked ? [...(settings.statOrder ?? DEFAULT_STAT_ORDER)] : null,
                    })
                  }
                  className="accent-blue-600"
                />
                ステの高さの順を決める
                <Hint text={GLOSSARY.statOrder} />
              </label>
              <div className="mt-2">
                <StatOrderPicker
                  order={settings.statOrder ?? DEFAULT_STAT_ORDER}
                  disabled={!settings.statOrder}
                  onChange={(order) => onUpdate({ statOrder: order })}
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                一番高い柱を押すと2番目のタイプが一番高くなり、ほかの柱を押すとそのタイプが一番高くなります。
                育成後のステータスがこの順になる編成・踏み方を選びます。
              </p>
            </section>

            {/* サポカ編成のタイプ割合 */}
            <section className="border-t border-slate-100 pt-3">
              <label className="flex items-center gap-1.5 font-semibold">
                <input
                  type="checkbox"
                  checked={ratio.enabled}
                  onChange={(e) =>
                    onUpdate({ typeRatio: { ...ratio, enabled: e.target.checked } })
                  }
                  className="accent-blue-600"
                />
                サポカ編成のタイプ割合を決める
                <Hint text={GLOSSARY.typeRatio} />
              </label>
              <div className={`mt-1.5 ${ratio.enabled ? "" : "opacity-40"}`}>
                <TypeSlotAllocator
                  ratio={ratio}
                  disabled={!ratio.enabled}
                  onChange={(type, v) =>
                    onUpdate({ typeRatio: { ...ratio, [type]: v } })
                  }
                />
              </div>
            </section>

            {/* 試験補助 */}
            <section className="border-t border-slate-100 pt-3">
              <label className="flex items-center gap-1.5 font-semibold">
                <input
                  type="checkbox"
                  checked={settings.examAssist}
                  onChange={(e) => onUpdate({ examAssist: e.target.checked })}
                  className="accent-blue-600"
                />
                試験補助を強めにする（試験に強いサポカで編成）
                <Hint text={GLOSSARY.examAssist} />
              </label>
            </section>
            {/* ステージアイテム */}
            <section className="border-t border-slate-100 pt-3">
              <label className="flex items-center gap-1.5 font-semibold">
                <input
                  type="checkbox"
                  checked={settings.noStageItems}
                  onChange={(e) => onUpdate({ noStageItems: e.target.checked })}
                  className="accent-blue-600"
                />
                ステージに入るPアイテム・スキルのサポカを編成しない
                <Hint text={GLOSSARY.stageItems} />
              </label>
            </section>
            {/* 選抜の点数配分（H.I.Fだけ）: 手で変えた配分の確認と、極振りだけの探索 */}
            {scenario === "hif" && (
              <>
                <section className="border-t border-slate-100 pt-3">
                  <label className="flex items-center gap-1.5 font-semibold">
                    <input
                      type="checkbox"
                      checked={settings.examConfirm}
                      onChange={(e) => onUpdate({ examConfirm: e.target.checked })}
                      className="accent-blue-600"
                    />
                    選抜の点数配分設定をそのままにするかどうかの確認を挟む
                    <Hint text={GLOSSARY.examConfirm} />
                  </label>
                  {/* 確認を挟まないときの、手で変えた点数配分の扱い（確認の「次回以降表示しない」で選んだほうが入る） */}
                  <div
                    className={`mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-5 text-xs ${
                      settings.examConfirm ? "opacity-40" : ""
                    }`}
                  >
                    <span className="text-slate-600">確認を挟まないとき:</span>
                    <span className="inline-flex overflow-hidden rounded-lg border border-slate-300">
                      {(
                        [
                          [false, "探索で決め直す"],
                          [true, "手で変えた配分のまま探索"],
                        ] as const
                      ).map(([keep, label], i) => (
                        <button
                          key={label}
                          type="button"
                          disabled={settings.examConfirm}
                          onClick={() => onUpdate({ examKeepManual: keep })}
                          className={`px-2 py-1 font-semibold transition disabled:cursor-not-allowed ${
                            i > 0 ? "border-l border-slate-300" : ""
                          } ${
                            settings.examKeepManual === keep
                              ? "bg-blue-600 text-white"
                              : "bg-white text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </span>
                  </div>
                </section>
                <section className="border-t border-slate-100 pt-3">
                  <label className="flex items-center gap-1.5 font-semibold">
                    <input
                      type="checkbox"
                      checked={settings.examAllIn}
                      onChange={(e) => onUpdate({ examAllIn: e.target.checked })}
                      className="accent-blue-600"
                    />
                    選抜試験の点数を全て1つのタイプに分配する
                    <Hint text={GLOSSARY.examAllIn} />
                  </label>
                </section>
              </>
            )}
          </>
        ) : (
          <>
            {/* タイプ別の最低ステータス */}
            <section>
              <p className="flex items-center gap-1 font-semibold">
                最低ステータス
                <span className="text-xs font-normal text-slate-400">（0=条件なし）</span>
                <Hint text={GLOSSARY.minStat} />
              </p>
              {statRow(settings.minStats, (type, v) =>
                onUpdate({ minStats: { ...settings.minStats, [type]: v } }),
              )}
            </section>

            {/* タイプ別の最高ステータス */}
            <section className="border-t border-slate-100 pt-3">
              <p className="flex items-center gap-1 font-semibold">
                最高ステータス
                <span className="text-xs font-normal text-slate-400">（3200=制限なし）</span>
                <Hint text={GLOSSARY.maxStat} />
              </p>
              {statRow(settings.maxStats, (type, v) =>
                onUpdate({ maxStats: { ...settings.maxStats, [type]: v } }),
              )}
            </section>

            {/* 取得回数（前イベ取得・後イベ発動の上限） */}
            <section className="border-t border-slate-100 pt-3">
              <label className="flex items-center gap-1.5 font-semibold">
                <input
                  type="checkbox"
                  checked={budget.enabled}
                  onChange={(e) =>
                    onUpdate({
                      eventBudget: { ...budget, enabled: e.target.checked },
                    })
                  }
                  className="accent-blue-600"
                />
                前イベ・後イベの回数を制限する
                <Hint text={GLOSSARY.eventBudget} />
              </label>
              <div
                className={`mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 ${budget.enabled ? "" : "opacity-40"}`}
              >
                <label className="flex items-center gap-1.5">
                  前イベ取得
                  <NumberField
                    value={budget.pre}
                    onChange={(v) => onUpdate({ eventBudget: { ...budget, pre: v } })}
                    max={6}
                    sliderMax={6}
                    disabled={!budget.enabled}
                    className="w-14"
                  />
                  枚
                </label>
                <label className="flex items-center gap-1.5">
                  後イベ合計
                  <NumberField
                    value={budget.post}
                    onChange={(v) => onUpdate({ eventBudget: { ...budget, post: v } })}
                    max={6}
                    sliderMax={6}
                    disabled={!budget.enabled}
                    className="w-14"
                  />
                  回
                </label>
              </div>
            </section>

          </>
        )}
      </div>
    </Modal>
  );
}

/** シナリオごとの色付き■（グラデ・NIAは紫）と短縮名 */
const SCENARIO_SQUARE: Record<
  ScenarioKey,
  { short: string; grad: string; ring: string }
> = {
  hif: { short: "H.I.F", grad: "from-sky-400 to-sky-600", ring: "ring-sky-500" },
  niaMaster: {
    short: "N.I.A",
    grad: "from-violet-400 to-purple-600",
    ring: "ring-violet-500",
  },
  hatsuLegend: {
    short: "初",
    grad: "from-amber-400 to-orange-500",
    ring: "ring-amber-500",
  },
};

/** 育成シナリオをモーダルの色付き■3つから選ぶ */
export function ScenarioPickerModal({
  current,
  onPick,
  onClose,
}: {
  current: ScenarioKey;
  onPick: (key: ScenarioKey) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="育成シナリオを選ぶ" onClose={onClose} widthClass="max-w-lg">
      <div className="grid grid-cols-3 gap-3">
        {SCENARIO_KEYS.map((key) => {
          const s = SCENARIO_SQUARE[key];
          const on = current === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                onPick(key);
                onClose();
              }}
              title={SCENARIO_NOTES[key]}
              className="group flex flex-col items-center gap-2 rounded-xl p-1"
            >
              <span
                className={`flex aspect-square w-full items-center justify-center rounded-2xl bg-linear-to-br ${s.grad} text-xl font-black text-white shadow-md transition ${
                  on
                    ? `ring-4 ring-offset-2 ${s.ring}`
                    : "opacity-80 group-hover:scale-[1.03] group-hover:opacity-100"
                }`}
              >
                {s.short}
              </span>
              <span
                className={`text-center text-xs font-bold ${on ? "text-slate-900" : "text-slate-500"}`}
              >
                {SCENARIO_LABELS[key]}
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

const IDOLS = [...new Set(P_IDOL_MASTERS.map((m) => m.idol))];

/**
 * アイドルでフィルターして、Pアイドルを画像から選ぶモーダル。
 * Pアイドルを選ぶとアイドルも一緒に確定する。
 */
export function IdolPickerModal({
  currentIdol,
  currentPIdol,
  onPick,
  onClose,
}: {
  currentIdol: string;
  currentPIdol: string;
  onPick: (idol: string, pIdolCardName: string) => void;
  onClose: () => void;
}) {
  // アイドル未選択（初期状態）なら一覧の先頭のアイドルから見せる
  const [filterIdol, setFilterIdol] = useState(currentIdol || IDOLS[0] || "");
  const cards = P_IDOL_MASTERS.filter((m) => m.idol === filterIdol);
  return (
    <Modal
      title="アイドル・Pアイドルを選ぶ"
      onClose={onClose}
      widthClass="max-w-3xl"
    >
      {/* アイドルでフィルター */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {IDOLS.map((idol) => (
          <button
            key={idol}
            type="button"
            onClick={() => setFilterIdol(idol)}
            className={`rounded-full px-3 py-1 text-xs font-bold transition ${
              filterIdol === idol
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {idol}
          </button>
        ))}
      </div>
      {/* Pアイドルを画像から選ぶ */}
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
        {cards.map((m) => {
          const url = imageUrl(m.url);
          const selected =
            m.idol === currentIdol && m.cardName === currentPIdol;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => {
                onPick(m.idol, m.cardName);
                onClose();
              }}
              title={`${m.cardName}（${m.rarity}）${m.skillName ? `\n固有スキル: ${m.skillName}` : ""}`}
              className={`flex flex-col items-center gap-1 rounded-lg border-2 p-1.5 text-center transition ${
                selected
                  ? "border-blue-600 bg-blue-50"
                  : "border-transparent hover:border-blue-300 hover:bg-slate-50"
              }`}
            >
              {url ? (
                <img
                  src={url}
                  alt={m.cardName}
                  loading="lazy"
                  className="aspect-square w-full rounded-md object-cover"
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded-md bg-slate-100 text-[10px] text-slate-400">
                  {m.cardName}
                </div>
              )}
              <span className="line-clamp-2 text-[10px] font-semibold leading-tight text-slate-700">
                {m.cardName}
              </span>
              <span className="text-[9px] text-slate-400">{m.rarity}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
