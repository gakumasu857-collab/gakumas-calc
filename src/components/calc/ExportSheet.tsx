/**
 * 計算シートの画像出力。
 * 画面と同じデザイン言語（カード・チップ・表・配色）で情報を1枚に並べた
 * 出力専用ビューを画面外に描画し、DOMスクリーンショット（modern-screenshot）でPNG保存する。
 * 内容: 基本情報・評価値・現在のステ・シナリオ固有値・選択サポカ・メモリー・
 *       レッスン（踏み方/授業/営業/選抜/オーディション/試験）・アビリティ発動回数。
 * ※ サポカ画像はR2がCORS非対応のため載せない（タイプ色チップ＋名前で表現）。
 * ※ SP指定枚数・セーブデータは含めない（ユーザー指定）。
 */
import { createRoot } from "react-dom/client";
import { domToPng } from "modern-screenshot";
import { ABILITY_NAMES, type AbilityName } from "@/data/constants";
import { CLASSES, EXAMS, LESSONS } from "@/data/schedule";
import {
  HATSU_CLASSES,
  HATSU_EXAMS,
  HATSU_LESSONS,
  NIA_AUDITIONS,
  NIA_LESSONS,
  NIA_SALES,
  SCENARIO_LABELS,
} from "@/data/scenarios";
import type { useCalcResult } from "@/lib/useCalcResult";
import { TYPE_KEYS, type TypeKey } from "@/lib/useCalcSettings";

type CalcResult = ReturnType<typeof useCalcResult>;

const TYPE_JA: Record<TypeKey, string> = {
  vocal: "Vo",
  dance: "Da",
  visual: "Vi",
};
const TYPE_CHIP: Record<TypeKey, string> = {
  vocal: "bg-red-100 text-red-700",
  dance: "bg-blue-100 text-blue-700",
  visual: "bg-yellow-100 text-yellow-700",
};
const TYPE_TEXT: Record<TypeKey, string> = {
  vocal: "text-red-600",
  dance: "text-blue-600",
  visual: "text-yellow-600",
};

const fmt = (n: number) => Math.round(n).toLocaleString();

/** 出力専用ビューを画面外に描画してPNGでダウンロードする */
export async function exportSheetImage(r: CalcResult): Promise<void> {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-9999px";
  host.style.top = "0";
  host.style.width = "960px";
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(<ExportSheet r={r} />);
  // レイアウト確定を待ってからスナップショット
  await new Promise((resolve) => setTimeout(resolve, 80));
  try {
    const el = host.firstElementChild as HTMLElement;
    const dataUrl = await domToPng(el, { scale: 2 });
    const a = document.createElement("a");
    const stamp = new Date().toLocaleDateString("ja-JP").replace(/\//g, "-");
    a.href = dataUrl;
    a.download = `gakumas-calc-${stamp}.png`;
    a.click();
  } finally {
    root.unmount();
    host.remove();
  }
}

function ExportSheet({ r }: { r: CalcResult }) {
  const settings = r.calc.settings;
  const members = r.members.filter(
    (m): m is NonNullable<(typeof r.members)[number]> => m !== null,
  );
  return (
    <div className="flex w-240 flex-col gap-3 bg-slate-100 p-4 text-slate-900">
      {/* ヘッダー: タイトル＋評価値 */}
      <div className="flex items-center gap-4 rounded-xl border-2 border-blue-600 bg-white px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold text-slate-900">
            学マス育成 計算シート
          </p>
          <p className="text-xs text-slate-500">
            {SCENARIO_LABELS[r.scenario]}・
            {new Date().toLocaleDateString("ja-JP")}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-slate-500">評価値</p>
          <p className="text-3xl font-bold tabular-nums text-blue-600">
            {fmt(r.rating)}
          </p>
        </div>
      </div>

      {/* 基本情報＋現在のステ */}
      <div className="grid grid-cols-2 gap-3">
        <Card title="基本情報">
          <dl className="flex flex-col gap-1 text-sm">
            <Row label="アイドル" value={settings.idol} />
            <Row
              label="Pアイドル"
              value={
                r.pMaster
                  ? `${r.pMaster.cardName}（${r.pMaster.rarity}・特訓${r.ownership?.kunren ?? 0}・開花${r.ownership?.kaika ?? 0}）`
                  : "未選択"
              }
            />
            <Row label="育成セット" value={r.selectedSet?.name ?? "未選択"} />
            <Row label="プラン" value={r.plan ?? "—"} />
          </dl>
        </Card>
        <Card title={`現在のステ（上限${r.statCap}）`}>
          <div className="flex flex-col gap-1 text-sm tabular-nums">
            {TYPE_KEYS.map((type) => (
              <div key={type} className="flex items-center gap-2">
                <span
                  className={`w-10 rounded px-1 py-0.5 text-center text-xs font-bold ${TYPE_CHIP[type]}`}
                >
                  {TYPE_JA[type]}
                </span>
                <span className="text-base font-bold">
                  {fmt(r.perType[type].current)}
                </span>
                <span className="text-xs text-slate-400">
                  （+{r.perType[type].startPct}%）
                </span>
              </div>
            ))}
            <div className="mt-0.5 border-t border-slate-100 pt-1 text-sm">
              合計（上限適用後）{" "}
              <b className="text-blue-600">{fmt(r.cappedSum)}</b>
            </div>
          </div>
        </Card>
      </div>

      {/* シナリオ固有値 */}
      <Card
        title={
          r.scenario === "hif"
            ? "スター性・本戦"
            : r.scenario === "niaMaster"
              ? "ファン投票"
              : "試験"
        }
      >
        {r.scenario === "hif" && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs tabular-nums text-slate-600">
            <Chip label="スター性" value={String(r.totalStar)} />
            <span className="text-slate-400">
              （ワッペン{r.starParts.wappen}＋レッスン{r.starParts.lesson}＋選抜
              {r.starParts.exam}＋本戦{r.starParts.final}）
            </span>
            <Chip
              label="本戦R1"
              value={`${fmt(settings.round1)} → ${fmt(r.roundValues[0])}`}
            />
            <Chip
              label="本戦R2"
              value={`${fmt(settings.round2)} → ${fmt(r.roundValues[1])}`}
            />
          </div>
        )}
        {r.scenario === "niaMaster" && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs tabular-nums text-slate-600">
            <Chip label="営業" value={fmt(r.scenarioValues.votesSales ?? 0)} />
            <Chip
              label="1次・2次"
              value={fmt(r.scenarioValues.votesAuditions ?? 0)}
            />
            <Chip label="最終" value={fmt(r.scenarioValues.votesFinale ?? 0)} />
            <Chip
              label={`札${r.scenarioValues.totalFuda ?? 0}枚`}
              value={fmt(r.scenarioValues.votesFuda ?? 0)}
            />
            <span className="font-bold text-slate-800">
              = 合計 {fmt(r.scenarioValues.totalVotes ?? 0)}票
            </span>
            <span>
              → 評価値換算{" "}
              <b className="text-blue-600">
                {fmt(r.scenarioValues.fanValue ?? 0)}
              </b>
            </span>
          </div>
        )}
        {r.scenario === "hatsuLegend" && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs tabular-nums text-slate-600">
            <Chip
              label="中間"
              value={`${fmt(r.hatsuSchedule.midScore)} → ${fmt(r.scenarioValues.midValue ?? 0)}`}
            />
            <Chip
              label="最終"
              value={`${fmt(r.hatsuSchedule.finalScore)} → ${fmt(r.scenarioValues.finalValue ?? 0)}`}
            />
            <Chip
              label="順位分"
              value={fmt(r.scenarioValues.rankValue ?? 0)}
            />
          </div>
        )}
      </Card>

      {/* 選択サポカ＋メモリー */}
      <div className="grid grid-cols-2 gap-3">
        <Card title="選択サポカ">
          {members.length === 0 ? (
            <p className="text-xs text-slate-400">未選択</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-1.5">
                  <span
                    className={`w-8 shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-bold ${TYPE_CHIP[m.type]}`}
                  >
                    {TYPE_JA[m.type]}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {m.name}
                  </span>
                  <span className="shrink-0 text-[10px] text-slate-500">
                    {m.rental ? "レンタル・" : ""}
                    {m.level}凸
                  </span>
                  <span className="shrink-0 text-xs font-bold tabular-nums text-blue-600">
                    +{fmt(m.points + m.synergy)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="メモリー">
          <div className="flex flex-wrap items-center gap-1.5 text-xs tabular-nums">
            {TYPE_KEYS.map((type) => (
              <span
                key={type}
                className={`rounded px-1.5 py-0.5 font-semibold ${TYPE_CHIP[type]}`}
              >
                {TYPE_JA[type]} +{r.perType[type].memPct}% / +
                {r.perType[type].memFixed}
              </span>
            ))}
          </div>
        </Card>
      </div>

      {/* レッスン情報（シナリオ別） */}
      {r.scenario === "hif" && <HifPlan r={r} />}
      {r.scenario === "niaMaster" && <NiaPlan r={r} />}
      {r.scenario === "hatsuLegend" && <HatsuPlan r={r} />}

      {/* アビリティ発動回数 */}
      <Card
        title={`アビリティ発動回数${r.selectedSet ? `（${r.selectedSet.name}）` : ""}`}
      >
        <AbilityCounts r={r} />
      </Card>
    </div>
  );
}

/** H.I.F.: 踏み方・授業・選抜 */
function HifPlan({ r }: { r: CalcResult }) {
  return (
    <Card title="レッスン・授業・選抜">
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        <PlanTable
          head={["日程", "メイン", "サブ", "SP"]}
          rows={LESSONS.map((lesson, i) => {
            const pick = r.schedule.lessons[i];
            const sp = pick.sp ? 1 : 0;
            return [
              lesson.label,
              <TypeValue key="m" type={pick.main} value={lesson.main[sp]} />,
              <TypeValue key="s" type={pick.sub} value={lesson.sub[sp]} />,
              <SpMark key="sp" on={pick.sp} />,
            ];
          })}
        />
        <PlanTable
          head={["授業", "タイプ"]}
          rows={CLASSES.map((cls, i) => [
            cls.label,
            <TypeValue
              key="t"
              type={r.schedule.classTypes[i]}
              value={cls.gain}
            />,
          ])}
        />
        <PlanTable
          head={["選抜", ...TYPE_KEYS.map((t) => TYPE_JA[t]), "合計"]}
          rows={EXAMS.map((exam, i) => {
            const scores = r.schedule.examScores[i];
            const total = TYPE_KEYS.reduce((s, t) => s + scores[t], 0);
            return [
              exam.name,
              ...TYPE_KEYS.map((t) => (
                <span key={t} className="tabular-nums">
                  {fmt(scores[t])}
                </span>
              )),
              <b key="total" className="tabular-nums">
                {fmt(total)}
              </b>,
            ];
          })}
        />
      </div>
    </Card>
  );
}

/** N.I.A.: 自主レッスン・営業・オーディション */
function NiaPlan({ r }: { r: CalcResult }) {
  const nia = r.niaSchedule;
  return (
    <Card title="自主レッスン・営業・オーディション">
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        <PlanTable
          head={["レッスン", "タイプ", "SP"]}
          rows={NIA_LESSONS.map((lesson, i) => {
            const pick = nia.lessons[i];
            return [
              lesson.label,
              <TypeValue
                key="t"
                type={pick.main}
                value={lesson.value[pick.sp ? 1 : 0]}
              />,
              <SpMark key="sp" on={pick.sp} />,
            ];
          })}
        />
        <PlanTable
          head={["営業", "タイプ", "営業先", "成功度"]}
          rows={NIA_SALES.map((sale, i) => {
            const pick = nia.sales[i];
            return [
              sale.label,
              <TypeValue key="t" type={pick.type} value={sale.value} />,
              pick.resort ? "リゾート" : "その他",
              pick.great ? "大成功" : "成功",
            ];
          })}
        />
        <PlanTable
          head={["審査", ...TYPE_KEYS.map((t) => TYPE_JA[t]), "投票"]}
          rows={[
            ...NIA_AUDITIONS.map((audition, i) => [
              audition.name,
              ...TYPE_KEYS.map((t) => (
                <span key={t} className="tabular-nums">
                  {fmt(nia.auditions[i][t])}
                </span>
              )),
              <span key="v" className="tabular-nums">
                {fmt(nia.auditionVotes[i])}
              </span>,
            ]),
            [
              "最終",
              ...TYPE_KEYS.map((t) => (
                <span key={t} className="tabular-nums">
                  {fmt(nia.finalScores[t])}
                </span>
              )),
              <span key="v" className="text-slate-400">
                自動
              </span>,
            ],
          ]}
        />
      </div>
    </Card>
  );
}

/** 初: レジェンドレッスン・授業・試験 */
function HatsuPlan({ r }: { r: CalcResult }) {
  const hatsu = r.hatsuSchedule;
  return (
    <Card title="レジェンドレッスン・授業・試験">
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        <PlanTable
          head={["レッスン", "タイプ", "SP", "パフェ"]}
          rows={HATSU_LESSONS.map((lesson, i) => {
            const pick = hatsu.lessons[i];
            const sp = pick.sp ? 1 : 0;
            return [
              lesson.label,
              <TypeValue
                key="t"
                type={pick.main}
                value={pick.perfect ? lesson.perfectMain[sp] : lesson.clear[sp]}
              />,
              <SpMark key="sp" on={pick.sp} />,
              pick.perfect ? "パフェ" : "クリア",
            ];
          })}
        />
        <PlanTable
          head={["授業", "タイプ"]}
          rows={HATSU_CLASSES.map((cls, i) => [
            cls.label,
            <TypeValue key="t" type={hatsu.classTypes[i]} value={cls.gain} />,
          ])}
        />
        <PlanTable
          head={["試験", "順位", "スコア"]}
          rows={HATSU_EXAMS.map((exam, i) => {
            const isMid = i === 0;
            const rank = isMid ? hatsu.midRank : hatsu.finalRank;
            const score = isMid ? hatsu.midScore : hatsu.finalScore;
            return [
              exam.name,
              rank === 4 ? "4位以下" : `${rank}位`,
              <span key="s" className="tabular-nums">
                {fmt(score)}
              </span>,
            ];
          })}
        />
      </div>
    </Card>
  );
}

/** 発動回数（選択セットの回数>0をチップで列挙） */
function AbilityCounts({ r }: { r: CalcResult }) {
  if (!r.selectedSet) {
    return <p className="text-xs text-slate-400">セット未選択</p>;
  }
  const set = r.selectedSet;
  const entries = (Object.keys(ABILITY_NAMES) as AbilityName[])
    .map((key) => ({ key, count: r.ability.getCount(set, key) }))
    .filter((e) => e.count > 0);
  if (entries.length === 0) {
    return <p className="text-xs text-slate-400">回数の設定なし</p>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map((e) => (
        <span
          key={e.key}
          className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700"
        >
          {ABILITY_NAMES[e.key]}
          <b className="ml-0.5 tabular-nums">×{e.count}</b>
        </span>
      ))}
    </div>
  );
}

// ===== 小物 =====

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3.5">
      <h2 className="mb-2 text-sm font-bold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-xs leading-5 text-slate-500">
        {label}
      </dt>
      <dd className="min-w-0 text-sm font-medium">{value}</dd>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded bg-slate-100 px-1.5 py-0.5">
      {label} <b className="text-slate-700">{value}</b>
    </span>
  );
}

/** タイプ色つきの値表示（例: 赤字で「Vo 145」） */
function TypeValue({ type, value }: { type: TypeKey; value: number }) {
  return (
    <span className={`font-bold tabular-nums ${TYPE_TEXT[type]}`}>
      {TYPE_JA[type]} {value}
    </span>
  );
}

function SpMark({ on }: { on: boolean }) {
  return on ? (
    <span className="rounded bg-slate-700 px-1 py-0.5 text-[10px] font-bold text-white">
      SP
    </span>
  ) : (
    <span className="text-slate-300">—</span>
  );
}

/** ラベル列＋データ列の小さい表 */
function PlanTable({
  head,
  rows,
}: {
  head: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <table className="w-auto text-xs">
      <thead>
        <tr className="border-b border-slate-300 text-left font-semibold text-slate-500">
          {head.map((h, i) => (
            <th
              key={i}
              className={`px-1.5 py-0.5 font-semibold ${i === 0 ? "pr-3 text-left" : "text-center"}`}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((cells, i) => (
          <tr key={i}>
            {cells.map((cell, j) => (
              <td
                key={j}
                className={`px-1.5 py-0.5 ${j === 0 ? "whitespace-nowrap pr-3 font-medium text-slate-700" : "text-center"}`}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
