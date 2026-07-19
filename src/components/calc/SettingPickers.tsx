import { useState } from "react";
import Modal from "@/components/Modal";
import NumberField from "@/components/NumberField";
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

const TYPE_CHIP: Record<TypeKey, string> = {
  vocal: "bg-red-100 text-red-700",
  dance: "bg-blue-100 text-blue-700",
  visual: "bg-yellow-100 text-yellow-700",
};

/**
 * 理論評価値を求めるときの前提設定をまとめるモーダル。
 * 取得回数（前イベ取得・後イベ発動の上限）／踏み方のタイプ割合／試験補助。
 * ※前イベの強さ（カード別）は今後追加予定。
 */
export function TheorySettingsModal({
  settings,
  onUpdate,
  onClose,
}: {
  settings: CalcSettings;
  onUpdate: (patch: Partial<CalcSettings>) => void;
  onClose: () => void;
}) {
  const budget = settings.eventBudget;
  const ratio = settings.typeRatio;
  return (
    <Modal title="理論評価値の設定" onClose={onClose} widthClass="max-w-lg">
      <div className="flex flex-col gap-4 text-sm text-slate-700">
        {/* 取得回数（前イベ取得・後イベ発動の上限） */}
        <section>
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
            取得回数を制限する（前イベ取得・後イベ発動）
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
          <p className="mt-1 text-[11px] text-slate-400">
            前イベは合計この枚数だけ取得（カード1枚=1）、後イベは合計この回数だけ発動する前提で評価します（超過分は価値の低いカードから取得OFF・✕）。
          </p>
        </section>

        {/* SPレッスン率アップ持ちの最低枚数 */}
        <section className="border-t border-slate-100 pt-3">
          <p className="font-semibold">SPレッスン率アップ持ちの最低枚数</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {TYPE_KEYS.map((type) => (
              <label key={type} className="flex items-center gap-1">
                <span
                  className={`rounded px-1 py-0.5 text-[11px] font-bold ${TYPE_CHIP[type]}`}
                >
                  {TYPE_LABELS[type]}
                </span>
                <select
                  value={settings.spMin[type]}
                  onChange={(e) =>
                    onUpdate({
                      spMin: { ...settings.spMin, [type]: Number(e.target.value) },
                    })
                  }
                  className="rounded-lg border border-slate-300 bg-white px-1.5 py-1 text-sm"
                >
                  {[0, 1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n === 0 ? "条件なし" : `${n}枚以上`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            理想編成を組むとき、SPレッスン率アップ持ちのサポカをタイプごとに最低この枚数入れます。
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
            サポカ編成のタイプ割合を固定する
          </label>
          <div
            className={`mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 ${ratio.enabled ? "" : "opacity-40"}`}
          >
            {TYPE_KEYS.map((type) => (
              <label key={type} className="flex items-center gap-1">
                <span
                  className={`rounded px-1 py-0.5 text-[11px] font-bold ${TYPE_CHIP[type]}`}
                >
                  {TYPE_LABELS[type]}
                </span>
                <NumberField
                  value={ratio[type]}
                  onChange={(v) =>
                    onUpdate({ typeRatio: { ...ratio, [type]: v } })
                  }
                  max={6}
                  sliderMax={6}
                  disabled={!ratio.enabled}
                  className="w-12"
                />
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            編成6枚をこの比率のタイプ構成にします（例 1:3:2 → Vo1枚・Da3枚・Vi2枚）。合計が6にならなければ比率どおり6枚へ按分します。
          </p>
        </section>

        {/* タイプ別の最低ステータス */}
        <section className="border-t border-slate-100 pt-3">
          <p className="font-semibold">最低ステータス（0=条件なし）</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {TYPE_KEYS.map((type) => (
              <label key={type} className="flex items-center gap-1">
                <span
                  className={`rounded px-1 py-0.5 text-[11px] font-bold ${TYPE_CHIP[type]}`}
                >
                  {TYPE_LABELS[type]}
                </span>
                <NumberField
                  value={settings.minStats[type]}
                  onChange={(v) =>
                    onUpdate({ minStats: { ...settings.minStats, [type]: v } })
                  }
                  max={3200}
                  sliderMax={3200}
                  className="w-20"
                />
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            各タイプの最終ステータスがこの値以上になる編成・踏み方を優先します。全部を満たせないときは、そのアイドルの審査基準が高いタイプから順にできるだけ満たします。
          </p>
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
            試験補助を強めにする
          </label>
          <p className="mt-1 text-[11px] text-slate-400">
            ONにすると前イベ（アイテム/スキル）の価値を重めに見積もり、前イベが強いサポカを優先して編成します。※前イベの強さはカードごとの設定（今後追加予定）で精度が上がります。
          </p>
        </section>
      </div>
    </Modal>
  );
}

/** シナリオごとの色付き■（グラデ・NIAは紫）と短縮名 */
const SCENARIO_SQUARE: Record<
  ScenarioKey,
  { short: string; grad: string; ring: string }
> = {
  hif: { short: "H.I.F.", grad: "from-sky-400 to-sky-600", ring: "ring-sky-500" },
  niaMaster: {
    short: "N.I.A.",
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
  const [filterIdol, setFilterIdol] = useState(currentIdol);
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
              title={`${m.cardName}（${m.rarity}）`}
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
