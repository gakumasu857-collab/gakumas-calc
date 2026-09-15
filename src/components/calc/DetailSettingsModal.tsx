import Modal from "@/components/Modal";
import { BTN_SECONDARY, NOTE } from "@/components/ui";
import {
  AFFECTION_CHOICES,
  AFFECTION_DEFAULT,
  AFFECTION_MIN,
  affectionHpBonus,
  affectionLabel,
  affectionStarBonus,
  affectionStepP,
} from "@/data/affection";
import {
  HIF_BASE_CAP,
  HIF_BONUS_CAP,
  HIF_BONUS_SP,
  HIF_BONUS_STAT_FIXED,
  HIF_BONUS_STAT_PCT,
  hifBonusMax,
  hifBonusValues,
  type HifBonusLevels,
} from "@/data/hifBonus";
import type { useCalcResult } from "@/lib/useCalcResult";
import { TYPE_KEYS, type TypeKey } from "@/lib/useCalcSettings";

/** ゲーム内の呼び名（ボーカル上昇 など） */
const JP: Record<TypeKey, string> = { vocal: "ボーカル", dance: "ダンス", visual: "ビジュアル" };

/** レベルのボタン列（0＝無） */
function LevelButtons({
  max,
  current,
  onPick,
  valueAt,
}: {
  max: number;
  current: number;
  onPick: (lv: number) => void;
  valueAt: (lv: number) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: max + 1 }, (_, lv) => (
        <button
          key={lv}
          type="button"
          onClick={() => onPick(lv)}
          title={valueAt(lv)}
          className={`h-8 min-w-9 rounded-md px-2 text-sm font-bold transition ${
            lv === current
              ? "bg-blue-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {lv === 0 ? "無" : lv}
        </button>
      ))}
    </div>
  );
}

/**
 * 詳細設定（設定欄の「調整」から）。
 * - 親愛度: 全シナリオ共通。スター性ボーナス・初期Pポイント（STEP3）・最大体力に効く
 * - H.I.F.ボーナス: H.I.F.のときだけ。固定値・パラボ・SP率・本戦のステ上限
 * どちらも既定は最大（親愛度37＝一番星／H.I.F.ボーナス全部最大）。
 */
export default function DetailSettingsModal({
  r,
  onClose,
}: {
  r: ReturnType<typeof useCalcResult>;
  onClose: () => void;
}) {
  const { settings } = r.calc;
  const affection = settings.affection;
  const isHif = r.scenario === "hif";
  const levels = hifBonusValues(settings.hifBonus).levels;
  const set = (patch: Partial<HifBonusLevels>) =>
    r.calc.update({ hifBonus: { ...levels, ...patch } });
  const setType = (kind: "fixed" | "pct", type: TypeKey, lv: number) =>
    set({ [kind]: { ...levels[kind], [type]: lv } });

  const fixedAt = (lv: number) => (lv === 0 ? "なし" : `固定 +${HIF_BONUS_STAT_FIXED[lv]}`);
  const pctAt = (lv: number) => (lv === 0 ? "なし" : `パラボ +${HIF_BONUS_STAT_PCT[lv]}%`);

  const starPct = Math.round(affectionStarBonus(affection) * 100);
  const th = "border border-slate-300 bg-slate-100 px-2 py-1 font-bold";
  const td = "border border-slate-200 px-2 py-1 text-center";

  return (
    <Modal title="詳細設定" onClose={onClose} widthClass="max-w-lg">
      {/* ===== 親愛度（全シナリオ） ===== */}
      <h3 className="text-sm font-bold text-slate-900">親愛度</h3>
      <p className={`mb-2 ${NOTE}`}>
        育成するアイドルの親愛度Lv。<b>スター性の獲得率</b>（H.I.F.）・<b>初期Pポイント</b>（STEP3）・
        <b>最大体力</b>が変わります。Lv20以下はどれも0で同じなので1つにまとめています。既定は37。
      </p>
      <div className="flex flex-wrap gap-1">
        {AFFECTION_CHOICES.map((lv) => (
          <button
            key={lv}
            type="button"
            onClick={() => r.calc.update({ affection: lv })}
            title={`スター性+${Math.round(affectionStarBonus(lv) * 100)}%／初期P+${affectionStepP(lv)}／最大体力+${affectionHpBonus(lv)}`}
            className={`h-8 min-w-11 rounded-md px-1.5 text-sm font-bold transition ${
              lv === affection
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {lv === AFFECTION_MIN ? "20以下" : lv}
          </button>
        ))}
      </div>
      <table className="mt-2 w-full border-collapse text-xs tabular-nums">
        <thead>
          <tr>
            <th className={th}>今の親愛度</th>
            <th className={th}>スター性</th>
            <th className={th}>初期Pポイント</th>
            <th className={th}>最大体力</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={td}>{affectionLabel(affection)}</td>
            <td className={td}>{starPct > 0 ? `+${starPct}%` : "なし"}</td>
            <td className={td}>
              {affectionStepP(affection) > 0 ? `+${affectionStepP(affection)}` : "なし"}
            </td>
            <td className={td}>
              {affectionHpBonus(affection) > 0 ? `+${affectionHpBonus(affection)}` : "なし"}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ===== H.I.F.ボーナス（H.I.F.のときだけ） ===== */}
      {isHif && (
        <>
          <h3 className="mt-5 text-sm font-bold text-slate-900">H.I.F.ボーナス</h3>
          {TYPE_KEYS.map((type) => (
            <div key={type} className="flex flex-col gap-1.5 border-b border-slate-100 py-2.5">
              <span className="text-sm font-bold text-slate-900">{JP[type]}上昇</span>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="w-30 shrink-0 text-xs text-slate-600">
                  固定値 <b className="text-slate-800">Lv{levels.fixed[type]}</b>
                  <span className="ml-1 text-slate-400">{fixedAt(levels.fixed[type])}</span>
                </span>
                <LevelButtons
                  max={5}
                  current={levels.fixed[type]}
                  onPick={(lv) => setType("fixed", type, lv)}
                  valueAt={fixedAt}
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="w-30 shrink-0 text-xs text-slate-600">
                  パラボ <b className="text-slate-800">Lv{levels.pct[type]}</b>
                  <span className="ml-1 text-slate-400">{pctAt(levels.pct[type])}</span>
                </span>
                <LevelButtons
                  max={5}
                  current={levels.pct[type]}
                  onPick={(lv) => setType("pct", type, lv)}
                  valueAt={pctAt}
                />
              </div>
            </div>
          ))}
          <div className="flex flex-col gap-1 border-b border-slate-100 py-2.5">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-bold text-slate-900">SPレッスン発生率増加（全タイプ）</span>
              <span className="text-xs text-slate-500">
                Lv{levels.spRate}:{" "}
                {levels.spRate === 0 ? "なし" : `SPレッスン率 +${HIF_BONUS_SP[levels.spRate]}%`}
              </span>
            </div>
            <LevelButtons
              max={5}
              current={levels.spRate}
              onPick={(lv) => set({ spRate: lv })}
              valueAt={(lv) => (lv === 0 ? "なし" : `SPレッスン率 +${HIF_BONUS_SP[lv]}%`)}
            />
          </div>
          <div className="flex flex-col gap-1 py-2.5">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-bold text-slate-900">【本戦】パラメータ上限増加</span>
              <span className="text-xs text-slate-500">
                Lv{levels.finalCap}: 上限 {HIF_BASE_CAP + HIF_BONUS_CAP[levels.finalCap]}
                {levels.finalCap > 0 ? `（+${HIF_BONUS_CAP[levels.finalCap]}）` : ""}
              </span>
            </div>
            <LevelButtons
              max={6}
              current={levels.finalCap}
              onPick={(lv) => set({ finalCap: lv })}
              valueAt={(lv) =>
                lv === 0
                  ? `上限 ${HIF_BASE_CAP}`
                  : `上限 ${HIF_BASE_CAP + HIF_BONUS_CAP[lv]}（+${HIF_BONUS_CAP[lv]}）`
              }
            />
          </div>
        </>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() =>
            r.calc.update({ affection: AFFECTION_DEFAULT, hifBonus: hifBonusMax() })
          }
          className={BTN_SECONDARY}
        >
          全部最大に戻す
        </button>
      </div>
    </Modal>
  );
}
