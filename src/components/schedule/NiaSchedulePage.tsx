import NumberField from "@/components/NumberField";
import {
  NIA_AUDITION_CAPS,
  NIA_AUDITIONS,
  NIA_LESSONS,
  NIA_SALES,
  niaFanValue,
} from "@/data/scenarios";
import { computeNiaGains, niaFinaleStats } from "@/lib/scenarioGains";
import { niaFudaVotes, type NiaTag } from "@/data/scenarios";
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
 * N.I.A.（マスター）のスケジュールページ。
 * 自主レッスン、営業（単タイプ＋営業先＋大成功）、1次・2次オーディション（素点＋投票手入力）、
 * 最終オーディション（タイプ別スコアから素点・投票を導出）、札を扱う。
 */
export default function NiaSchedulePage() {
  const r = useCalcResult();
  const nia = r.niaSchedule;

  // 審査タイプ（バランス=flat / 特化=skew）: 上限と最終導出式が変わる
  const tag: NiaTag = r.ranks?.tag === "特化" ? "skew" : "flat";
  const tagLabel = tag === "skew" ? "特化型" : "バランス型";

  const { gains, pPoints, votes } = computeNiaGains(nia, tag, r.typeRanks);
  const finaleStats = niaFinaleStats(nia, r.typeRanks, tag);
  const setFuda = r.scenarioValues.setFuda ?? 0;
  const totalFuda = setFuda + (r.scenarioValues.supportFuda ?? 0);
  const totalVotes = votes.base + niaFudaVotes(totalFuda);
  const finaleTotal = TYPE_KEYS.reduce((sum, t) => sum + nia.finalScores[t], 0);

  /** タイプごとのオーディション上限（審査基準ランクで決まる） */
  const capOf = (auditionIndex: number, type: TypeKey) =>
    NIA_AUDITION_CAPS[tag][auditionIndex][r.typeRanks[type] - 1];

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
        ※ N.I.A.（マスター）・{r.calc.settings.idol}は{tagLabel}
        。上限2600・Pポイント{pPoints}
        。パラメータボーナス%は計算ページ側で反映します。
      </p>

      {/* ===== 自主レッスン ===== */}
      <Section
        title="自主レッスン"
        action={
          <span className="flex items-center gap-1 text-sm text-slate-500">
            一括:
            {TYPE_KEYS.map((type) => (
              <BulkButton
                key={type}
                type={type}
                onClick={() => nia.applyAllMain(type)}
              />
            ))}
          </span>
        }
      >
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
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-300">
            {NIA_LESSONS.map((lesson, i) => {
              const pick = nia.lessons[i];
              const value = lesson.value[pick.sp ? 1 : 0];
              return (
                <tr key={i}>
                  <td className="whitespace-nowrap py-1.5 pr-4 font-medium text-slate-800">
                    {lesson.label}
                  </td>
                  {TYPE_KEYS.map((type) => (
                    <td key={type} className="px-2.5 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => nia.setLessonMain(i, type)}
                        title={TYPE_LABELS[type]}
                        className={`h-11 w-11 rounded-lg text-sm font-bold tabular-nums transition ${
                          pick.main === type
                            ? TYPE_STYLE[type].on
                            : TYPE_STYLE[type].off
                        }`}
                      >
                        {value}
                      </button>
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-center">
                    {/* ON=濃い灰色×白文字、OFF=白背景×打ち消し線 */}
                    <button
                      type="button"
                      onClick={() => nia.toggleLessonSp(i)}
                      title={pick.sp ? "SPレッスン（クリックで通常に）" : "通常レッスン（クリックでSPに）"}
                      className={`h-9 w-9 rounded-lg border text-xs font-bold transition ${
                        pick.sp
                          ? "border-slate-700 bg-slate-700 text-white hover:bg-slate-600"
                          : "border-slate-300 bg-white text-slate-500 line-through decoration-2 hover:bg-slate-50"
                      }`}
                    >
                      SP
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      {/* ===== 営業 ===== */}
      <Section
        title="営業"
        hint="授業と同じく選んだ1タイプだけ上昇（パラボ無効）。ファン投票数は営業先と成功度で決まる"
        action={
          <span className="flex items-center gap-1 text-sm text-slate-500">
            一括:
            {TYPE_KEYS.map((type) => (
              <BulkButton
                key={type}
                type={type}
                onClick={() => nia.applyAllSales(type)}
              />
            ))}
          </span>
        }
      >
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
              <th className="px-2 py-1.5 text-center font-semibold">営業先</th>
              <th className="px-2 py-1.5 text-center font-semibold">成功度</th>
              <th className="py-1.5 pl-2 text-right font-semibold">投票数</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-300">
            {NIA_SALES.map((sale, i) => {
              const pick = nia.sales[i];
              const voteValue =
                sale.votes[pick.resort ? "resort" : "other"][pick.great ? 1 : 0];
              return (
                <tr key={i}>
                  <td className="whitespace-nowrap py-1.5 pr-4 font-medium text-slate-800">
                    {sale.label}
                  </td>
                  {TYPE_KEYS.map((type) => (
                    <td key={type} className="px-2.5 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => nia.setSale(i, { type })}
                        title={TYPE_LABELS[type]}
                        className={`h-11 w-11 rounded-lg text-sm font-bold tabular-nums transition ${
                          pick.type === type
                            ? TYPE_STYLE[type].on
                            : TYPE_STYLE[type].off
                        }`}
                      >
                        {sale.value}
                      </button>
                    </td>
                  ))}
                  {/* 営業先（リゾート/それ以外） */}
                  <td className="px-2 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => nia.setSale(i, { resort: !pick.resort })}
                      title="営業先を切り替え（リゾートは投票数が少なめ）"
                      className={`h-9 rounded-lg border px-2 text-xs font-bold transition ${
                        pick.resort
                          ? "border-teal-400 bg-teal-100 text-teal-700"
                          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {pick.resort ? "リゾート" : "その他"}
                    </button>
                  </td>
                  {/* 成功/大成功 */}
                  <td className="px-2 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => nia.setSale(i, { great: !pick.great })}
                      title="成功⇔大成功を切り替え"
                      className={`h-9 rounded-lg border px-2 text-xs font-bold transition ${
                        pick.great
                          ? "border-amber-400 bg-amber-100 text-amber-700"
                          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {pick.great ? "大成功" : "成功"}
                    </button>
                  </td>
                  <td className="whitespace-nowrap py-1.5 pl-2 text-right text-xs tabular-nums text-slate-500">
                    +{voteValue.toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      {/* ===== オーディション（1次・2次） ===== */}
      <Section
        title="オーディション（1次・2次）"
        hint={`タイプ別の素点とファン投票数を入力。上限は${tagLabel}の値（審査基準の順で決まる）`}
      >
        <div className="flex flex-col divide-y divide-slate-300">
          {NIA_AUDITIONS.map((audition, i) => (
            <div
              key={audition.name}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5"
            >
              <span className="w-10 shrink-0 font-medium text-slate-800">
                {audition.name}
              </span>
              {TYPE_KEYS.map((type) => (
                <label
                  key={type}
                  className="flex items-center gap-1 text-xs text-slate-500"
                >
                  <span className={`font-bold ${TYPE_STYLE[type].head}`}>
                    {TYPE_LABELS[type]}
                  </span>
                  <NumberField
                    value={nia.auditions[i][type]}
                    onChange={(v) => nia.setAudition(i, type, v)}
                    max={capOf(i, type)}
                    className="w-16"
                  />
                  <span className="text-slate-400">/{capOf(i, type)}</span>
                </label>
              ))}
              <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
                ファン投票数
                <NumberField
                  value={nia.auditionVotes[i]}
                  onChange={(v) => nia.setAuditionVotes(i, v)}
                  sliderMax={20000}
                  className="w-24"
                />
              </label>
            </div>
          ))}
        </div>
      </Section>

      {/* ===== 最終オーディション ===== */}
      <Section
        title="最終オーディション"
        hint={`Vo/Da/Viそれぞれのスコアから、そのタイプの審査基準ランクの式でステ素点を導出（${tagLabel}）。投票数は合計スコアから`}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {TYPE_KEYS.map((type) => (
            <label
              key={type}
              className="flex items-center gap-1 text-xs text-slate-500"
            >
              <span className={`font-bold ${TYPE_STYLE[type].head}`}>
                {TYPE_LABELS[type]}
              </span>
              <NumberField
                value={nia.finalScores[type]}
                onChange={(v) => nia.setFinalScore(type, v)}
                sliderMax={500000}
                className="w-24"
              />
              <span
                className={`inline-block w-14 rounded-md px-1 py-1 text-center font-bold ${
                  nia.finalScores[type] > 0
                    ? TYPE_CHIP[type]
                    : "bg-slate-100 text-slate-300"
                }`}
              >
                +{finaleStats[type]}
              </span>
            </label>
          ))}
          <span
            className={`inline-block rounded-md px-1.5 py-1 text-center text-xs font-bold ${
              finaleTotal > 0
                ? "bg-cyan-100 text-cyan-700"
                : "bg-slate-100 text-slate-300"
            }`}
          >
            投票 +{votes.finale.toLocaleString()}
          </span>
        </div>
      </Section>

      {/* ===== ファン投票数・札 ===== */}
      <Section title="ファン投票数" hint="評価値 = floor(Σステ×2.3) + ファン投票数換算">
        <div className="flex flex-wrap items-center gap-1.5 text-xs tabular-nums text-slate-600">
          <Chip label="営業" value={votes.sales} />
          <Chip label="1次・2次" value={votes.auditions} />
          <Chip label="最終" value={votes.finale} />
          <Chip label={`札${totalFuda}枚`} value={niaFudaVotes(totalFuda)} />
          <span className="font-bold text-slate-800">
            = 合計 {totalVotes.toLocaleString()}
          </span>
          <span className="text-slate-500">
            → 評価値換算{" "}
            <b className="text-blue-600">
              {niaFanValue(totalVotes).toLocaleString()}
            </b>
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          札 = 発動回数セットの「スキル獲得」{setFuda}枚 ＋ サポカ分{" "}
          {r.scenarioValues.supportFuda ?? 0}
          枚（編成のスキル獲得から自動）。2枚ごとに3,000票、余りの1枚は無効。理想編成も札込みで評価します。
        </p>
      </Section>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded bg-slate-100 px-1.5 py-0.5">
      {label} <b className="text-slate-700">{value.toLocaleString()}</b>
    </span>
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
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}
