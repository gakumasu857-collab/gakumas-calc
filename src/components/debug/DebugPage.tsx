import { useState } from "react";
import { Sparkles } from "lucide-react";
import {
  runFullOptimize,
  type AutoOptimizeResult,
} from "@/lib/autoOptimize";
import { buildAutoOptimizeInput } from "@/lib/buildOptimizeInput";
import {
  findBestFormation,
  scoreOwnedCards,
  scoreRentalCandidates,
  type Formation,
  type ScoredCard,
} from "@/lib/formation";
import { useCalcResult } from "@/lib/useCalcResult";
import { useCardFlags } from "@/lib/useCardFlags";
import {
  TYPE_KEYS,
  TYPE_LABELS,
  type TypeKey,
} from "@/lib/useCalcSettings";

const TYPE_CHIP: Record<TypeKey, string> = {
  vocal: "bg-red-100 text-red-700",
  dance: "bg-blue-100 text-blue-700",
  visual: "bg-yellow-100 text-yellow-700",
};

/** 理想編成デバッグの実行結果 */
type FormationDebug = {
  elapsedMs: number;
  ownedCount: number;
  rentalCount: number;
  topOwned: Record<TypeKey, ScoredCard[]>;
  best: Formation | null;
};

/**
 * デバッグページ（/debug）。
 * 評価値・現在のステ・パラボ合算・理想編成の中身を数値で開示する。
 */
export default function DebugPage() {
  const r = useCalcResult();
  const flags = useCardFlags();
  const [formation, setFormation] = useState<FormationDebug | null>(null);
  const [search, setSearch] = useState<AutoOptimizeResult | null>(null);
  const [searching, setSearching] = useState(false);

  /**
   * 「理論評価値を求める」と同じ探索を回して、選定過程だけ表示する（設定は変更しない）。
   * 焼きなましは乱数がシード非固定なので、押すたびに少し違う結果になることがある。
   */
  const runSearch = () => {
    setSearching(true);
    setTimeout(() => {
      try {
        setSearch(runFullOptimize(buildAutoOptimizeInput(r, flags, r.calc.settings)));
      } finally {
        setSearching(false);
      }
    }, 30);
  };

  /** 理想編成を実行して中間情報ごと表示する */
  const runFormation = () => {
    const opts = { flags, plan: r.plan };
    const start = performance.now();
    const owned = scoreOwnedCards(r.getLevel, r.ctx, r.roles.typeRole, opts);
    const rentals = scoreRentalCandidates(r.ctx, r.roles.typeRole, opts);
    const best = findBestFormation(owned, rentals, r.baseStats, {
      pinned: flags.pinned,
      spMin: r.calc.settings.spMin,
      cap: r.statCap,
      extraScore: r.niaFudaExtra,
    });
    const elapsedMs = performance.now() - start;
    const topOwned = {} as Record<TypeKey, ScoredCard[]>;
    for (const type of TYPE_KEYS) {
      topOwned[type] = owned
        .filter((c) => c.type === type)
        .sort((a, b) => b.points - a.points)
        .slice(0, 10);
    }
    setFormation({
      elapsedMs,
      ownedCount: owned.length,
      rentalCount: rentals.length,
      topOwned,
      best,
    });
  };

  const num = (v: number, digits = 0) =>
    v.toLocaleString(undefined, { maximumFractionDigits: digits });

  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-xs text-slate-500">
        計算の中身をそのまま表示するページです（シナリオ: {r.scenario} / 上限{" "}
        {r.statCap}）。
      </p>

      {/* ===== 全自動最適化の選定過程 ===== */}
      <Section
        title="理論評価値の探索（どう編成が選ばれたか）"
        action={
          <button
            type="button"
            onClick={runSearch}
            disabled={searching}
            className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-500 disabled:cursor-wait disabled:opacity-60"
          >
            <Sparkles size={13} />
            {searching ? "探索中…" : "探索を実行（設定は変更しない）"}
          </button>
        }
      >
        {!search ? (
          <p className="text-xs text-slate-400">
            ボタンを押すと、実際の全自動最適化（焼きなまし法＋各タイプ別の候補プール）を回して、
            どのサポカが候補で・どの踏み方で・どの6枚が選ばれたのかを表示します。設定・選択サポカは変更しません。
            乱数はシード非固定なので、押すたびに結果が少し変わることがあります。
          </p>
        ) : (
          <SearchDebug res={search} num={num} />
        )}
      </Section>

      {/* ===== 評価値の内訳 ===== */}
      <Section title="評価値の内訳">
        <table className="w-auto tabular-nums">
          <tbody className="divide-y divide-slate-200">
            <Row label="Σmin(上限, ステ)（cappedSum）" value={num(r.cappedSum)} />
            {r.scenario === "hif" && (
              <>
                <Row label="ステ×2" value={num(r.cappedSum * 2)} />
                <Row
                  label={`スター性 ${r.totalStar}（ワッペン${r.starParts.wappen}＋レッスン${r.starParts.lesson}＋選抜${r.starParts.exam}＋本戦${r.starParts.final}）→ floor(×7.5)`}
                  value={num(Math.floor(r.totalStar * 7.5))}
                />
                <Row
                  label={`本戦評価値（R1 ${num(r.roundValues[0])} + R2 ${num(r.roundValues[1])}）`}
                  value={num(r.roundValues[0] + r.roundValues[1])}
                />
                <Row label="固定減算" value="−2000" />
              </>
            )}
            {r.scenario === "niaMaster" && (
              <>
                <Row label="floor(ステ×2.3)" value={num(Math.floor(r.cappedSum * 2.3))} />
                <Row label="ファン投票数換算" value={num(r.scenarioValues.fanValue ?? 0)} />
              </>
            )}
            {r.scenario === "hatsuLegend" && (
              <>
                <Row label="floor(ステ×2.1)" value={num(Math.floor(r.cappedSum * 2.1))} />
                <Row label="最終順位分" value={num(r.scenarioValues.rankValue ?? 0)} />
                <Row label="中間スコア換算" value={num(r.scenarioValues.midValue ?? 0)} />
                <Row label="最終スコア換算" value={num(r.scenarioValues.finalValue ?? 0)} />
              </>
            )}
            <Row label="= 評価値" value={num(r.rating)} strong />
          </tbody>
        </table>
      </Section>

      {/* ===== 現在のステの内訳 ===== */}
      <Section title="現在のステの内訳（パラボは全ソース合算→1回変換）">
        <div className="overflow-x-auto">
          <table className="w-auto whitespace-nowrap text-right tabular-nums">
            <thead>
              <tr className="border-b-2 border-slate-300 text-xs text-slate-500">
                <th className="px-2 py-1 text-left">項目</th>
                {TYPE_KEYS.map((t) => (
                  <th key={t} className={`px-2 py-1 ${TYPE_CHIP[t]}`}>
                    {TYPE_LABELS[t]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <TRow label="授業/営業" get={(t) => num(r.perType[t].classGain)} />
              <TRow label="メモリー固定" get={(t) => num(r.perType[t].memFixed)} />
              <TRow label="Pアイドル固定（+100込み）" get={(t) => num(r.perType[t].idolFixed)} />
              <TRow label="レッスン" get={(t) => num(r.perType[t].lessonGain)} />
              <TRow label="選抜/試験/オーディション" get={(t) => num(r.perType[t].examGain)} />
              <TRow label="基礎固定合計（baseNoConv）" get={(t) => num(r.baseNoConv[t])} strong />
              <TRow label="メモリー%" get={(t) => `${r.perType[t].memPct}%`} />
              <TRow label="Pアイドル%（+10込み）" get={(t) => `${r.perType[t].idolPct}%`} />
              <TRow label="基礎%（basePct）" get={(t) => `${r.basePct[t]}%`} />
              <TRow label="サポカ%込み合算（totalPct）" get={(t) => `${r.paraboDetail[t].totalPct}%`} />
              <TRow label="パラボ変換（conv）" get={(t) => num(r.paraboDetail[t].conv)} />
              <TRow label="サポカ点（パラボ抜き＋シナジー）" get={(t) => num(r.paraboDetail[t].support)} />
              <TRow label="サポカ点（個別変換・参考値）" get={(t) => num(r.perType[t].supportPoints)} />
              <TRow label="= 現在のステ" get={(t) => num(r.perType[t].current)} strong />
              <TRow label="上限適用後" get={(t) => num(r.perType[t].capped)} strong />
              <TRow label="サポカ抜き基礎ステ（baseStats）" get={(t) => num(r.baseStats[t])} />
            </tbody>
          </table>
        </div>
      </Section>

      {/* ===== 選択サポカ ===== */}
      <Section title="選択サポカの内訳">
        <div className="overflow-x-auto">
          <table className="w-auto whitespace-nowrap text-right tabular-nums">
            <thead>
              <tr className="border-b-2 border-slate-300 text-xs text-slate-500">
                <th className="px-2 py-1 text-left">カード</th>
                <th className="px-2 py-1">タイプ</th>
                <th className="px-2 py-1">凸</th>
                <th className="px-2 py-1">基本点</th>
                <th className="px-2 py-1">うちアイテム</th>
                <th className="px-2 py-1">パラボ%</th>
                <th className="px-2 py-1">シナジー</th>
                <th className="px-2 py-1 text-left">イベント上乗せ（回数キー→回数）</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {r.members.map((m, i) =>
                m ? (
                  <tr key={i}>
                    <td className="max-w-52 truncate px-2 py-1 text-left font-medium">
                      {m.name}
                      {m.rental && (
                        <span className="ml-1 text-xs text-amber-600">レンタル</span>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      {m.assist ? (
                        <span className="rounded bg-slate-200 px-1 text-xs font-bold text-slate-600">
                          アシスト
                        </span>
                      ) : (
                        <span className={`rounded px-1 text-xs font-bold ${TYPE_CHIP[m.type]}`}>
                          {TYPE_LABELS[m.type]}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1">{m.level}</td>
                    <td className="px-2 py-1">{num(m.points)}</td>
                    <td className="px-2 py-1">{num(m.itemBonus)}</td>
                    <td className="px-2 py-1">{m.bonusPercent}%</td>
                    <td className="px-2 py-1">{num(m.synergy)}</td>
                    <td className="max-w-96 truncate px-2 py-1 text-left text-xs text-slate-500">
                      {Object.entries(m.eventContrib)
                        .map(([k, v]) => `${k}+${v}`)
                        .join(" / ") || "—"}
                    </td>
                  </tr>
                ) : (
                  <tr key={i}>
                    <td className="px-2 py-1 text-left text-slate-300" colSpan={8}>
                      （空きスロット）
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ===== 理想編成デバッグ ===== */}
      <Section
        title="理想編成の組まれ方"
        action={
          <button
            type="button"
            onClick={runFormation}
            className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-500"
          >
            <Sparkles size={13} />
            現在の設定で実行
          </button>
        }
      >
        {!formation ? (
          <p className="text-xs text-slate-400">
            ボタンを押すと、候補プール・タイプ別上位カード・採用結果を表示します。ベース=サポカ抜き基礎ステ（baseStats）、上限{r.statCap}
            、SP条件 {TYPE_KEYS.map((t) => `${TYPE_LABELS[t]}${r.calc.settings.spMin[t]}`).join("/")}
            、固定{flags.pinned.size}枚・BAN{flags.banned.size}枚・レンタルNG{flags.rentalNg.size}枚。
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-slate-500">
              実行時間 {formation.elapsedMs.toFixed(1)}ms ／ 所持プール{" "}
              {formation.ownedCount}枚 ／ レンタル候補 {formation.rentalCount}枚
              {formation.best && formation.best.spShortfall > 0 && (
                <span className="ml-2 font-semibold text-amber-600">
                  SP条件 不足{formation.best.spShortfall}枚
                </span>
              )}
            </p>
            {formation.best ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-auto whitespace-nowrap text-right tabular-nums">
                    <thead>
                      <tr className="border-b-2 border-slate-300 text-xs text-slate-500">
                        <th className="px-2 py-1 text-left">採用カード</th>
                        <th className="px-2 py-1">タイプ</th>
                        <th className="px-2 py-1">基本点</th>
                        <th className="px-2 py-1">シナジー</th>
                        <th className="px-2 py-1">計</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {formation.best.picks.map((p) => (
                        <tr key={p.id}>
                          <td className="max-w-52 truncate px-2 py-1 text-left font-medium">
                            {p.name}
                            {p.rental && (
                              <span className="ml-1 text-xs text-amber-600">レンタル</span>
                            )}
                          </td>
                          <td className="px-2 py-1">
                            {p.assist ? (
                              <span className="rounded bg-slate-200 px-1 text-xs font-bold text-slate-600">
                                アシスト
                              </span>
                            ) : (
                              <span className={`rounded px-1 text-xs font-bold ${TYPE_CHIP[p.type]}`}>
                                {TYPE_LABELS[p.type]}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1">{num(p.points)}</td>
                          <td className="px-2 py-1">{num(p.synergy)}</td>
                          <td className="px-2 py-1 font-bold">{num(p.points + p.synergy)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs tabular-nums text-slate-600">
                  探索時の到達値（ベース込み・カード個別パラボの近似）:{" "}
                  {TYPE_KEYS.map(
                    (t) =>
                      `${TYPE_LABELS[t]} ${num(formation.best!.totals[t].raw)}→min(${r.statCap})=${num(formation.best!.totals[t].capped)}`,
                  ).join(" / ")}{" "}
                  合計 {num(formation.best.score)}
                </p>
              </>
            ) : (
              <p className="text-xs text-red-500">編成を組めませんでした。</p>
            )}
            {/* タイプ別上位候補 */}
            <div className="grid gap-3 lg:grid-cols-3">
              {TYPE_KEYS.map((type) => (
                <div key={type}>
                  <p className={`mb-1 inline-block rounded px-1.5 text-xs font-bold ${TYPE_CHIP[type]}`}>
                    {TYPE_LABELS[type]} 上位候補（所持）
                  </p>
                  <ol className="flex flex-col gap-0.5 text-xs tabular-nums text-slate-600">
                    {formation.topOwned[type].map((c, i) => (
                      <li key={c.id} className="flex gap-1">
                        <span className="w-4 text-right text-slate-400">{i + 1}.</span>
                        <span className="min-w-0 flex-1 truncate">{c.name}</span>
                        <span className="font-semibold">{num(c.points)}</span>
                        {c.hasSpUp && <span className="text-blue-500">SP</span>}
                      </li>
                    ))}
                    {formation.topOwned[type].length === 0 && (
                      <li className="text-slate-300">なし</li>
                    )}
                  </ol>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

/** 全自動最適化の探索結果（候補プール・勝ち踏み方・採用理由）を表示する */
function SearchDebug({
  res,
  num,
}: {
  res: AutoOptimizeResult;
  num: (v: number, d?: number) => string;
}) {
  const d = res.debug;
  return (
    <div className="flex flex-col gap-3">
      {/* 概要 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
        <span>
          理論評価値{" "}
          <b className="text-blue-600">{num(res.rating)}</b>
        </span>
        <span>合計ステ {num(res.cappedSum)}</span>
        <span>起点 {d?.starts ?? "—"}個</span>
        <span>評価した踏み方 {num(res.evaluated)}通り</span>
        <span>{res.elapsedMs.toFixed(0)}ms</span>
        {res.spShortfall > 0 && (
          <span className="font-semibold text-amber-600">
            SP条件 不足{res.spShortfall}枚
          </span>
        )}
      </div>

      {d && (
        <>
          {/* 起点別スコア（初期値非依存・ばらつきの確認） */}
          <div className="text-xs text-slate-500">
            <span className="font-semibold text-slate-700">起点別の到達スコア</span>
            （9通りの起点から焼きなまし。値が近いほど初期値に依存していない）:{" "}
            <span className="tabular-nums">
              {d.startScores.map((s) => num(s)).join(" / ")}
            </span>
          </div>

          {/* フェーズ別の到達スコア（どの段階でどれだけ改善したか） */}
          <div className="text-xs text-slate-500">
            <span className="font-semibold text-slate-700">フェーズ別スコア</span>
            （広域探索 → 踏み方の詰め直し → 仕上げの相互詰め・結合手）:{" "}
            <span className="tabular-nums">
              {num(d.phaseScores.starts)} → {num(d.phaseScores.polish)} →{" "}
              <b className="text-blue-600">{num(d.phaseScores.refine)}</b>
            </span>
          </div>

          {/* 勝ち踏み方 */}
          {d.stepping && (
            <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
              <span className="font-semibold text-slate-700">勝った踏み方: </span>
              レッスンのメイン{" "}
              {TYPE_KEYS.filter((t) => d.stepping!.lessonMains[t] > 0)
                .map((t) => `${TYPE_LABELS[t]}${d.stepping!.lessonMains[t]}回`)
                .join("・")}
              {" ／ "}
              授業{" "}
              {TYPE_KEYS.filter((t) => d.stepping!.classTypes[t] > 0)
                .map((t) => `${TYPE_LABELS[t]}${d.stepping!.classTypes[t]}回`)
                .join("・")}
              {" ／ "}
              選抜の寄せ先{" "}
              {d.stepping.examBias
                .map((b) => (b === "均等" ? "均等" : TYPE_LABELS[b]))
                .join("・")}
            </div>
          )}

          {/* 勝ち踏み方の詳細（レッスンごとのメイン/サブ/SPと選抜の実配分） */}
          {d.lessonDetail && (
            <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
              <p className="mb-1 font-semibold text-slate-700">
                レッスン詳細（メイン／サブ・SPは■）
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
                {d.lessonDetail.map((l) => (
                  <span key={l.label} className="whitespace-nowrap">
                    <span className="text-slate-400">{l.label}</span>{" "}
                    {l.main === null ? (
                      <span className="text-slate-400">踏まない</span>
                    ) : (
                      <>
                        <b>{TYPE_LABELS[l.main]}</b>
                        <span className="text-slate-400">
                          /{TYPE_LABELS[l.sub]}
                        </span>
                        {l.sp && <b className="text-slate-800">■</b>}
                      </>
                    )}
                  </span>
                ))}
              </div>
              {d.examDetail && (
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
                  {d.examDetail.map((e) => (
                    <span key={e.name} className="whitespace-nowrap">
                      <span className="text-slate-400">{e.name}</span>{" "}
                      Vo {num(e.vocal)} / Da {num(e.dance)} / Vi {num(e.visual)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 採用6枚 */}
          {d.formation && (
            <div className="overflow-x-auto">
              <p className="mb-1 text-xs font-semibold text-slate-700">
                採用された6枚（点数＋イベント相互作用のシナジー）
              </p>
              <table className="w-auto whitespace-nowrap text-right tabular-nums">
                <thead>
                  <tr className="border-b-2 border-slate-300 text-xs text-slate-500">
                    <th className="px-2 py-1 text-left">カード</th>
                    <th className="px-2 py-1">タイプ</th>
                    <th className="px-2 py-1">凸</th>
                    <th className="px-2 py-1">基本点</th>
                    <th className="px-2 py-1">シナジー</th>
                    <th className="px-2 py-1">計</th>
                    <th className="px-2 py-1 text-left">イベント上乗せ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {d.formation.picks.map((p) => (
                    <tr key={p.id}>
                      <td className="max-w-52 truncate px-2 py-1 text-left font-medium">
                        {p.name}
                        {p.rental && (
                          <span className="ml-1 text-xs text-amber-600">
                            レンタル
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1">
                        {p.assist ? (
                          <span className="rounded bg-slate-200 px-1 text-xs font-bold text-slate-600">
                            アシスト
                          </span>
                        ) : (
                          <span
                            className={`rounded px-1 text-xs font-bold ${TYPE_CHIP[p.type]}`}
                          >
                            {TYPE_LABELS[p.type]}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1">{p.level}</td>
                      <td className="px-2 py-1">{num(p.points)}</td>
                      <td className="px-2 py-1">{num(p.synergy)}</td>
                      <td className="px-2 py-1 font-bold">
                        {num(p.points + p.synergy)}
                      </td>
                      <td className="max-w-72 truncate px-2 py-1 text-left text-xs text-slate-500">
                        {Object.entries(p.eventContrib)
                          .map(([k, v]) => `${k}+${v}`)
                          .join(" / ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* タイプ別の候補プール上位（採用は色付き） */}
          {d.formation && (
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-700">
                タイプ別の候補プール上位（所持{d.formation.ownedCount}枚・レンタル
                {d.formation.rentalCount}枚から。色付き＝採用）
              </p>
              <div className="grid gap-3 lg:grid-cols-3">
                {TYPE_KEYS.map((type) => (
                  <div key={type}>
                    <p
                      className={`mb-1 inline-block rounded px-1.5 text-xs font-bold ${TYPE_CHIP[type]}`}
                    >
                      {TYPE_LABELS[type]}
                    </p>
                    <ol className="flex flex-col gap-0.5 text-xs tabular-nums text-slate-600">
                      {d.formation!.topOwned[type].map((c, i) => (
                        <li
                          key={i}
                          className={`flex gap-1 rounded px-1 ${c.picked ? "bg-blue-50 font-semibold text-blue-700" : ""}`}
                        >
                          <span className="w-4 text-right text-slate-400">
                            {i + 1}.
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {c.name}
                          </span>
                          {c.hasSpUp && <span className="text-blue-500">SP</span>}
                          <span>{num(c.points)}</span>
                        </li>
                      ))}
                      {d.formation!.topOwned[type].length === 0 && (
                        <li className="text-slate-300">なし</li>
                      )}
                    </ol>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[11px] text-slate-400">
            ※ 探索は「踏み方（レッスン・授業・選抜）⇄ 理想編成」を9起点から焼きなましで交互に詰め、
            一番評価値が高かった組み合わせを表示しています。選抜スコアはサポカ編成を軸に、
            メイン2タイプのうち余裕がある方へ寄せています。上の値を反映するには計算ページの「理論評価値を求める」を押してください。
          </p>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <tr className={strong ? "font-bold text-slate-900" : "text-slate-600"}>
      <td className="py-1 pr-6">{label}</td>
      <td className="py-1 text-right tabular-nums">{value}</td>
    </tr>
  );
}

function TRow({
  label,
  get,
  strong,
}: {
  label: string;
  get: (t: TypeKey) => string;
  strong?: boolean;
}) {
  return (
    <tr className={strong ? "font-bold text-slate-900" : "text-slate-600"}>
      <td className="px-2 py-1 text-left">{label}</td>
      {TYPE_KEYS.map((t) => (
        <td key={t} className="px-2 py-1">
          {get(t)}
        </td>
      ))}
    </tr>
  );
}
