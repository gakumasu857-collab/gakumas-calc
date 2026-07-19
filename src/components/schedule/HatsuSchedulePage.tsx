import NumberField from "@/components/NumberField";
import {
  HATSU_CLASSES,
  HATSU_EXAMS,
  HATSU_LESSONS,
  HATSU_RANK_VALUES,
  hatsuExamValue,
} from "@/data/scenarios";
import { computeHatsuGains } from "@/lib/scenarioGains";
import { useCalcResult } from "@/lib/useCalcResult";
import {
  TYPE_KEYS,
  TYPE_LABELS,
  type TypeKey,
} from "@/lib/useCalcSettings";

const TYPE_STYLE: Record<TypeKey, { on: string; off: string; head: string }> = {
  vocal: {
    on: "bg-red-500 text-white shadow-sm",
    off: "bg-red-50 text-red-400 hover:bg-red-100",
    head: "text-red-600",
  },
  dance: {
    on: "bg-blue-500 text-white shadow-sm",
    off: "bg-blue-50 text-blue-400 hover:bg-blue-100",
    head: "text-blue-600",
  },
  visual: {
    on: "bg-yellow-400 text-yellow-950 shadow-sm",
    off: "bg-yellow-50 text-yellow-500 hover:bg-yellow-100",
    head: "text-yellow-600",
  },
};
const TYPE_CHIP: Record<TypeKey, string> = {
  vocal: "bg-red-100 text-red-700",
  dance: "bg-blue-100 text-blue-700",
  visual: "bg-yellow-100 text-yellow-700",
};
const TYPE_DOT: Record<TypeKey, string> = {
  vocal: "bg-red-400",
  dance: "bg-blue-400",
  visual: "bg-yellow-400",
};

/**
 * 定期公演『初』（レジェンド）のスケジュールページ。
 * レジェンドレッスン（クリア/パーフェクト・SP）、授業、試験（順位＋スコア）を扱う。
 */
export default function HatsuSchedulePage() {
  const r = useCalcResult();
  const hatsu = r.hatsuSchedule;

  const { gains, pPoints } = computeHatsuGains(hatsu);

  return (
    <div className="flex flex-col gap-4">
      {/* ===== サマリー ===== */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TYPE_KEYS.map((type) => (
          <div key={type} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              <span className={`h-2.5 w-2.5 rounded-full ${TYPE_DOT[type]}`} />
              {TYPE_LABELS[type]}
            </p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-800">
              +{gains[type].toLocaleString()}
            </p>
          </div>
        ))}
      </div>
      <p className="-mt-2 text-xs text-slate-400">
        ※ 初（レジェンド）。上限3000・Pポイント{pPoints}
        。パラメータボーナス%はこのページでは適用しません（レッスン獲得に計算ページ側で反映）。
      </p>

      {/* ===== レジェンドレッスン・授業 ===== */}
      <Section
        title="レジェンドレッスン・授業"
        action={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            <span className="flex items-center gap-1">
              レッスン一括:
              {TYPE_KEYS.map((type) => (
                <BulkButton
                  key={type}
                  type={type}
                  onClick={() => hatsu.applyAllMain(type)}
                />
              ))}
            </span>
            <span className="flex items-center gap-1">
              授業一括:
              {TYPE_KEYS.map((type) => (
                <BulkButton
                  key={type}
                  type={type}
                  onClick={() => hatsu.applyAllClasses(type)}
                />
              ))}
            </span>
          </div>
        }
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch lg:gap-0">
          <div className="overflow-x-auto lg:pr-8">
            <table className="w-auto text-sm">
              <thead>
                <tr className="border-b-2 border-slate-300 text-left text-sm font-semibold text-slate-500">
                  <th className="py-1.5 pr-4 font-semibold">日程</th>
                  {TYPE_KEYS.map((type) => (
                    <th
                      key={type}
                      className={`px-2.5 py-1.5 text-center font-bold ${TYPE_STYLE[type].head}`}
                    >
                      {TYPE_LABELS[type]}
                    </th>
                  ))}
                  <th className="px-2 py-1.5 text-center font-semibold">SP</th>
                  <th
                    className="px-2 py-1.5 text-center font-semibold"
                    title="パーフェクト達成（クリア超過分が残り2タイプにも入る）"
                  >
                    パフェ
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300">
                {HATSU_LESSONS.map((lesson, i) => {
                  const pick = hatsu.lessons[i];
                  const spIndex = pick.sp ? 1 : 0;
                  const mainValue = pick.perfect
                    ? lesson.perfectMain[spIndex]
                    : lesson.clear[spIndex];
                  const subValue = pick.perfect
                    ? lesson.perfectSub[spIndex]
                    : 0;
                  const mainType = pick.main;
                  return (
                    <tr key={i}>
                      <td className="whitespace-nowrap py-1.5 pr-4">
                        <div className="font-medium text-slate-800">
                          {lesson.label}
                        </div>
                        {pick.perfect && (
                          <div className="mt-0.5 text-[10px] text-slate-400">
                            残り2タイプ +{subValue}
                          </div>
                        )}
                      </td>
                      {TYPE_KEYS.map((type) => (
                        <td key={type} className="px-2.5 py-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => hatsu.setLessonMain(i, type)}
                            title={TYPE_LABELS[type]}
                            className={`h-11 w-11 rounded-lg text-sm font-bold tabular-nums transition ${
                              mainType === type
                                ? TYPE_STYLE[type].on
                                : TYPE_STYLE[type].off
                            }`}
                          >
                            {mainType === type || !pick.perfect
                              ? mainValue
                              : subValue}
                          </button>
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-center">
                        <Toggle
                          on={pick.sp}
                          label="SP"
                          onToggle={() => hatsu.toggleLessonSp(i)}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <Toggle
                          on={pick.perfect}
                          label="PF"
                          onToggle={() => hatsu.toggleLessonPerfect(i)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 授業（同じ枠内・PCは横並び） */}
          <div className="overflow-x-auto lg:border-l lg:border-slate-200 lg:pl-8">
            <table className="w-auto text-sm">
              <thead>
                <tr className="border-b-2 border-slate-300 text-left text-sm font-semibold text-slate-500">
                  <th className="py-1.5 pr-4 font-semibold">授業</th>
                  {TYPE_KEYS.map((type) => (
                    <th
                      key={type}
                      className={`px-2.5 py-1.5 text-center font-bold ${TYPE_STYLE[type].head}`}
                    >
                      {TYPE_LABELS[type]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300">
                {HATSU_CLASSES.map((cls, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap py-1.5 pr-4 font-medium text-slate-800">
                      {cls.label}
                    </td>
                    {TYPE_KEYS.map((type) => (
                      <td key={type} className="px-2.5 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => hatsu.setClassType(i, type)}
                          title={TYPE_LABELS[type]}
                          className={`h-11 w-11 rounded-lg text-sm font-bold tabular-nums transition ${
                            hatsu.classTypes[i] === type
                              ? TYPE_STYLE[type].on
                              : TYPE_STYLE[type].off
                          }`}
                        >
                          {cls.gain}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          ※
          パーフェクト値はチャレンジPアイテムでレッスン上限を最大（+90）にした時の数値です。クリアのみの場合は選んだタイプにクリア値だけ入ります。
        </p>
      </Section>

      {/* ===== 試験 ===== */}
      <Section
        title="中間・最終試験"
        hint="ステ上昇は順位で決まる固定値（全タイプ一律）。スコアは評価値換算に使用"
      >
        <div className="flex flex-col divide-y divide-slate-300">
          {HATSU_EXAMS.map((exam, i) => {
            const isMid = i === 0;
            const rank = isMid ? hatsu.midRank : hatsu.finalRank;
            const score = isMid ? hatsu.midScore : hatsu.finalScore;
            const gain = exam.rankGains[rank - 1] ?? 0;
            const value = hatsuExamValue(isMid ? 0 : 1, score);
            return (
              <div
                key={exam.name}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5"
              >
                <span className="w-20 shrink-0 font-medium text-slate-800">
                  {exam.name}
                </span>
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  順位
                  <select
                    value={rank}
                    onChange={(e) =>
                      hatsu.update(
                        isMid
                          ? { midRank: Number(e.target.value) }
                          : { finalRank: Number(e.target.value) },
                      )
                    }
                    className="rounded-lg border border-slate-300 bg-white px-1.5 py-1 text-sm text-slate-700"
                  >
                    {exam.ranks.map((n) => (
                      <option key={n} value={n}>
                        {n === 4 ? "4位以下" : `${n}位`}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="rounded-md bg-emerald-100 px-1.5 py-1 text-xs font-bold tabular-nums text-emerald-700">
                  全タイプ +{gain}
                </span>
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  スコア
                  <NumberField
                    value={score}
                    onChange={(v) =>
                      hatsu.update(isMid ? { midScore: v } : { finalScore: v })
                    }
                    sliderMax={isMid ? 250000 : 2000000}
                    className="w-32"
                  />
                </label>
                <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-400">
                  スコア評価値
                  <span className="inline-block w-20 rounded-md bg-slate-100 px-1 py-1 text-center font-bold tabular-nums text-slate-700">
                    {value.toLocaleString()}
                  </span>
                  {!isMid && (
                    <span
                      className="inline-block w-20 rounded-md bg-blue-100 px-1 py-1 text-center font-bold tabular-nums text-blue-700"
                      title="最終試験の順位分"
                    >
                      順位 +{(HATSU_RANK_VALUES[rank - 1] ?? 0).toLocaleString()}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          ※
          試験の順位報酬にはパラメータボーナスは掛からない想定です（仕様不明のため）。スコア→評価値換算は有志検証の推定値。
        </p>
      </Section>
    </div>
  );
}

function BulkButton({ type, onClick }: { type: TypeKey; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-xs font-bold transition ${TYPE_CHIP[type]} hover:brightness-95`}
    >
      {TYPE_LABELS[type]}
    </button>
  );
}

/** SP/パフェのトグル。ON=濃い灰色×白文字、OFF=白背景×打ち消し線 */
function Toggle({
  on,
  label,
  onToggle,
}: {
  on: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={on ? `${label} ON（クリックでOFF）` : `${label} OFF（クリックでON）`}
      className={`h-9 w-9 rounded-lg border text-xs font-bold transition ${
        on
          ? "border-slate-700 bg-slate-700 text-white hover:bg-slate-600"
          : "border-slate-300 bg-white text-slate-500 line-through decoration-2 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <div>{children}</div>
    </section>
  );
}
