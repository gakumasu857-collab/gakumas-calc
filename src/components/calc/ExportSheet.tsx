/**

* 計算シートの画像出力。*
 * 出力専用ビューを画面外に描画し、DOMスクリーンショット（modern-screenshot）でPNG保存する。
 * Tailwind のクラスはスクリーンショット時に正しくシリアライズされないことがある
 * （v4 の CSS 変数・レイヤーが原因でレイアウト崩れ・文字重なりが起きる）ため、
 * このビューは**インラインスタイルのみ**で組む。
 *
 * 内容（育成の再現に必要な最小限）:
 * シナリオ / Pアイドル / 育成セット / 評価値 / 最終ステ / スター性 / 本戦点数 /
 * メモリー / サポカ6枚（画像＋名前＋ステイベ・前イベ・後イベの有無と回数） /
 * レッスン・授業の踏み方 / 選抜の点数配分 / アビリティ発動回数（表形式）
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
import { SUPPORT_CARD_DB } from "@/data/supportCardsDb";
import { imageUrl } from "@/lib/config";
import { sumEventContrib } from "@/lib/formation";
import { clampExtraCount } from "@/lib/sheetScore";
import type { useCalcResult } from "@/lib/useCalcResult";
import { TYPE_KEYS, type TypeKey } from "@/lib/useCalcSettings";

type CalcResult = ReturnType<typeof useCalcResult>;

const TYPE_JA: Record<TypeKey, string> = {
  vocal: "Vo",
  dance: "Da",
  visual: "Vi",
};
/** タイプ色（文字色/背景色） */
const TYPE_COLOR: Record<TypeKey, { fg: string; bg: string }> = {
  vocal: { fg: "#b91c1c", bg: "#fee2e2" },
  dance: { fg: "#1d4ed8", bg: "#dbeafe" },
  visual: { fg: "#a16207", bg: "#fef9c3" },
};

const INK = "#0f172a";
const SUB = "#64748b";
const FAINT = "#cbd5e1";
const LINE = "#e2e8f0";
const BLUE = "#2563eb";

const fmt = (n: number) => Math.round(n).toLocaleString();

const DB_BY_ID = new Map(SUPPORT_CARD_DB.map((c) => [c.id, c]));

/**
 * 画像URLを fetch して dataURL に変換する（失敗したら null）。
 * cache:"reload" でHTTPキャッシュを完全に迂回する。通常閲覧で「CORSヘッダなしの
 * レスポンス」がキャッシュされていると、スクリーンショット側の取り込みが
 * キャッシュの状態次第で失敗する（画像が出たり出なかったりする）ため、
 * 出力前に必ずネットワークから取り直して dataURL に焼き込んでしまう。
 */
async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors", cache: "reload" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** 出力専用ビューを画面外に描画してPNGでダウンロードする */
export async function exportSheetImage(
  r: CalcResult,
  pinned: ReadonlySet<string>,
): Promise<void> {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-99999px";
  host.style.top = "0";
  host.style.width = "1040px";
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(<ExportSheet r={r} pinned={pinned} />);
  // レイアウト確定を待つ（createRoot のコミットは非同期。imgが現れるまで少し粘る）
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 80));
    if (host.querySelector("img")) break;
  }
  // 全画像を dataURL に差し替える（キャッシュ・CORS状態に依存しない確実な取り込み）
  const images = [...host.querySelectorAll("img")];
  await Promise.all(
    images.map(async (img) => {
      const data = await toDataUrl(img.src);
      if (data) {
        img.src = data;
        await img.decode().catch(() => undefined);
      }
    }),
  );
  try {
    const el = host.firstElementChild as HTMLElement;
    // dataURL化に失敗した画像が残った場合の保険として bypassingCache も維持
    const dataUrl = await domToPng(el, {
      scale: 2,
      fetch: { bypassingCache: true },
    });
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

// ===== スタイル部品（インラインのみ） =====

const S = {
  sheet: {
    width: 1040,
    background: "#f1f5f9",
    color: INK,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    fontFamily:
      '"Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif',
    fontSize: 13,
    lineHeight: 1.5,
  } as const,
  card: {
    background: "#fff",
    border: `1px solid ${LINE}`,
    borderRadius: 10,
    padding: "10px 12px",
  } as const,
  h2: {
    fontSize: 12,
    fontWeight: 700,
    color: SUB,
    margin: "0 0 6px",
  } as const,
  th: {
    border: `1px solid ${LINE}`,
    background: "#f8fafc",
    color: SUB,
    fontSize: 11,
    fontWeight: 700,
    padding: "3px 8px",
    whiteSpace: "nowrap",
  } as const,
  td: {
    border: `1px solid ${LINE}`,
    padding: "3px 8px",
    textAlign: "center",
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
  } as const,
} as const;

function TypeChip({ type }: { type: TypeKey }) {
  const c = TYPE_COLOR[type];
  return (
    <span
      style={{
        display: "inline-block",
        minWidth: 24,
        borderRadius: 4,
        padding: "0 4px",
        background: c.bg,
        color: c.fg,
        fontSize: 11,
        fontWeight: 700,
        textAlign: "center",
      }}
    >
      {TYPE_JA[type]}
    </span>
  );
}

// ===== 本体 =====

function ExportSheet({
  r,
  pinned,
}: {
  r: CalcResult;
  pinned: ReadonlySet<string>;
}) {
  const settings = r.calc.settings;
  const members = r.members.filter(
    (m): m is NonNullable<(typeof r.members)[number]> => m !== null,
  );
  return (
    <div style={S.sheet}>
      {/* ===== ヘッダー: シナリオ・Pアイドル・育成 ＋ 評価値 ===== */}
      <div
        style={{
          ...S.card,
          border: `2px solid ${BLUE}`,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        {/* Pアイドル（固有スキル画像） */}
        {r.pMaster?.url && (
          <img
            src={imageUrl(r.pMaster.url)}
            alt={r.pMaster.cardName}
            // crossOrigin は付けない（通常閲覧のキャッシュと衝突して読み込みに失敗する。
            // スクリーンショット側の fetch が bypassingCache + CORS で取り込む）
            style={{
              width: 64,
              height: 64,
              borderRadius: 8,
              objectFit: "cover",
              flexShrink: 0,
              border: `1px solid ${LINE}`,
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>
            {SCENARIO_LABELS[r.scenario]}
            <span style={{ color: SUB, fontWeight: 400, fontSize: 12 }}>
              {" "}
              ・ {new Date().toLocaleDateString("ja-JP")} ・ ほぺマス
              (gkapps.hoppepan.com)
            </span>
          </div>
          <div style={{ marginTop: 2 }}>
            <b>{settings.idol}</b>
            {r.pMaster && (
              <>
                {" / "}
                {r.pMaster.cardName}（{r.pMaster.rarity}・
                {r.ownership
                  ? `特訓${r.ownership.kunren}・開花${r.ownership.kaika}`
                  : "未所持"}
                ・{r.pMaster.plan}）
              </>
            )}
          </div>
          {settings.userName && (
            <div style={{ color: SUB, fontSize: 12 }}>
              Produced by {settings.userName}
            </div>
          )}
          {/* 探索の条件を設定しているときだけ1行で出す（結果カードの「条件」と同じ内容） */}
          {(() => {
            const short: Record<TypeKey, string> = { vocal: "Vo", dance: "Da", visual: "Vi" };
            const parts: string[] = [];
            if (settings.typeRatio.enabled) {
              parts.push(
                `タイプ割合 Vo${settings.typeRatio.vocal} Da${settings.typeRatio.dance} Vi${settings.typeRatio.visual}`,
              );
            }
            const mins = TYPE_KEYS.filter((t) => settings.minStats[t] > 0).map(
              (t) => `${short[t]}${settings.minStats[t]}`,
            );
            if (mins.length) parts.push(`最低ステ ${mins.join(" ")}`);
            const maxs = TYPE_KEYS.filter(
              (t) => settings.maxStats[t] > 0 && settings.maxStats[t] < r.statCap,
            ).map((t) => `${short[t]}${settings.maxStats[t]}`);
            if (maxs.length) parts.push(`最高ステ ${maxs.join(" ")}`);
            if (settings.spTop.first > 0 || settings.spTop.second > 0) {
              parts.push(`SP率持ち 上位${settings.spTop.first}枚・2位${settings.spTop.second}枚`);
            }
            return parts.length ? (
              <div style={{ color: SUB, fontSize: 11 }}>探索の条件: {parts.join(" ／ ")}</div>
            ) : null;
          })()}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: SUB }}>
            評価値
          </div>
          <div
            style={{
              fontSize: 30,
              fontWeight: 700,
              color: BLUE,
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1.2,
            }}
          >
            {fmt(r.rating)}
          </div>
        </div>
      </div>

      {/* ===== 最終ステ・スター性・本戦・メモリー ===== */}
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ ...S.card, flex: 1 }}>
          <h2 style={S.h2}>最終ステータス（上限{r.statCap}）</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {TYPE_KEYS.map((type) => (
              <span key={type} style={{ whiteSpace: "nowrap" }}>
                <TypeChip type={type} />{" "}
                <b
                  style={{ fontSize: 17, fontVariantNumeric: "tabular-nums" }}
                >
                  {fmt(r.perType[type].current)}
                </b>
              </span>
            ))}
            <span style={{ whiteSpace: "nowrap", color: SUB }}>
              合計{" "}
              <b style={{ color: BLUE, fontSize: 17 }}>{fmt(r.cappedSum)}</b>
            </span>
          </div>
        </div>
        {r.scenario === "hif" && (
          <div style={{ ...S.card, flexShrink: 0 }}>
            <h2 style={S.h2}>スター性・本戦</h2>
            <div style={{ display: "flex", gap: 12, whiteSpace: "nowrap" }}>
              <span>
                スター性 <b>{fmt(r.totalStar)}</b>
              </span>
              <span>
                R1 <b>{fmt(settings.round1)}</b>
              </span>
              <span>
                R2 <b>{fmt(settings.round2)}</b>
              </span>
            </div>
          </div>
        )}
        {r.scenario === "hatsuLegend" && (
          <div style={{ ...S.card, flexShrink: 0 }}>
            <h2 style={S.h2}>試験スコア</h2>
            <div style={{ display: "flex", gap: 12, whiteSpace: "nowrap" }}>
              <span>
                中間 <b>{fmt(r.hatsuSchedule.midScore)}</b>
              </span>
              <span>
                最終 <b>{fmt(r.hatsuSchedule.finalScore)}</b>
              </span>
            </div>
          </div>
        )}
        {r.scenario === "niaMaster" && (
          <div style={{ ...S.card, flexShrink: 0 }}>
            <h2 style={S.h2}>ファン投票</h2>
            <div style={{ whiteSpace: "nowrap" }}>
              合計 <b>{fmt(r.scenarioValues.totalVotes ?? 0)}票</b>
            </div>
          </div>
        )}
        <div style={{ ...S.card, flexShrink: 0, maxWidth: 340 }}>
          <h2 style={S.h2}>メモリー</h2>
          <MemoryList r={r} />
        </div>
      </div>

      {/* ===== サポカ6枚 ===== */}
      <div style={S.card}>
        <h2 style={S.h2}>サポートカード</h2>
        {members.length === 0 ? (
          <div style={{ color: FAINT }}>未選択</div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, 1fr)",
              gap: 8,
            }}
          >
            {members.map((m) => (
              <SupportCardCell key={m.id} r={r} m={m} pinned={pinned} />
            ))}
          </div>
        )}
      </div>

      {/* ===== 踏み方（シナリオ別） ===== */}
      {r.scenario === "hif" && <HifPlan r={r} />}
      {r.scenario === "niaMaster" && <NiaPlan r={r} />}
      {r.scenario === "hatsuLegend" && <HatsuPlan r={r} />}

      {/* ===== アビリティ発動回数 ===== */}
      <div style={S.card}>
        <h2 style={S.h2}>
          アビリティ発動回数
          {r.selectedSet ? `（${r.selectedSet.name}）` : ""}
        </h2>
        <AbilityCountTable r={r} />
      </div>
    </div>
  );
}

/** メモリー（タイプ別の合計値。固定値/％） */
function MemoryList({ r }: { r: CalcResult }) {
  const count = r.memoryStore.count;
  if (count === 0) {
    return <div style={{ color: "#dc2626", fontSize: 12 }}>未設定</div>;
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        whiteSpace: "nowrap",
        fontSize: 12,
      }}
    >
      <span style={{ color: SUB }}>{count}枚:</span>
      {TYPE_KEYS.map((type) => (
        <span key={type}>
          <TypeChip type={type} />{" "}
          <b style={{ fontVariantNumeric: "tabular-nums" }}>
            {r.perType[type].memFixed} / {r.perType[type].memPct}%
          </b>
        </span>
      ))}
    </div>
  );
}

/** サポカ1枚（画像＋名前＋凸/レンタル/固定＋ステイベ・前イベ・後イベ） */
function SupportCardCell({
  r,
  m,
  pinned,
}: {
  r: CalcResult;
  m: NonNullable<CalcResult["members"][number]>;
  pinned: ReadonlySet<string>;
}) {
  const db = DB_BY_ID.get(m.id);
  const url = imageUrl(m.image);
  const ov = r.events.get(m.id);
  const hasStatEvent = !!db && db.statEventType !== "何もなし";
  const statEventCount = ov?.statEvent ?? 1;
  const preKind = db && db.preEventType !== "何もなし" ? db.preEventType : null;
  const postKind =
    db && db.postEventType !== "何もなし" ? db.postEventType : null;
  const postCount = Math.max(0, ov?.post ?? 1);
  const eventRow = (label: string, value: string | null) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 10,
        color: value ? INK : FAINT,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ color: SUB }}>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>
        {value ?? "—"}
      </span>
    </div>
  );
  return (
    <div
      style={{
        border: `1px solid ${LINE}`,
        borderRadius: 8,
        overflow: "hidden",
        background: "#fff",
      }}
    >
      <div style={{ position: "relative", height: 88, background: "#f8fafc" }}>
        {url && (
          <img
            src={url}
            alt={m.name}
            // crossOrigin は付けない（通常閲覧のキャッシュと衝突して読み込みに失敗する。
            // スクリーンショット側の fetch が bypassingCache + CORS で取り込む）
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        )}
        {/* 凸・レンタル・固定バッジ（折り返すと2行になるので1行固定） */}
        <span
          style={{
            position: "absolute",
            left: 3,
            top: 3,
            borderRadius: 4,
            background: "rgba(0,0,0,0.65)",
            color: "#fff",
            fontSize: 9,
            fontWeight: 700,
            padding: "1px 4px",
            whiteSpace: "nowrap",
          }}
        >
          {m.level}凸
          {m.rental && <span style={{ color: "#fcd34d" }}> レンタル</span>}
          {pinned.has(m.id) && <span style={{ color: "#7dd3fc" }}> 固定</span>}
        </span>
      </div>
      <div style={{ padding: "4px 6px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 3,
            marginBottom: 2,
          }}
        >
          {m.assist ? (
            <span
              style={{
                display: "inline-block",
                minWidth: 24,
                borderRadius: 4,
                padding: "0 4px",
                background: "#e2e8f0",
                color: "#475569",
                fontSize: 11,
                fontWeight: 700,
                textAlign: "center",
              }}
            >
              ア
            </span>
          ) : (
            <TypeChip type={m.type} />
          )}
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={m.name}
          >
            {m.name}
          </span>
        </div>
        {eventRow(
          "ステイベ",
          hasStatEvent ? (statEventCount > 0 ? "〇" : "✕") : null,
        )}
        {eventRow("前イベ", preKind ? `${preKind}×${m.preActs}` : null)}
        {eventRow(
          "後イベ",
          postKind
            ? postCount > 0
              ? `${postKind}×${postCount}`
              : `${postKind}（発動なし）`
            : null,
        )}
      </div>
    </div>
  );
}

/** 表を組み立てる小道具 */
function PlanTable({
  head,
  rows,
}: {
  head: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} style={S.th}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells, i) => (
          <tr key={i}>
            {cells.map((c, j) => (
              <td key={j} style={{ ...S.td, textAlign: j === 0 ? "left" : "center" }}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TypeValue({ type, value }: { type: TypeKey; value?: number }) {
  return (
    <span
      style={{
        color: TYPE_COLOR[type].fg,
        fontWeight: 700,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {TYPE_JA[type]}
      {value !== undefined ? ` ${value}` : ""}
    </span>
  );
}

const spMark = (on: boolean) =>
  on ? (
    <span
      style={{
        borderRadius: 3,
        background: "#334155",
        color: "#fff",
        fontSize: 9,
        fontWeight: 700,
        padding: "1px 3px",
      }}
    >
      SP
    </span>
  ) : (
    <span style={{ color: FAINT }}>—</span>
  );

/** H.I.F.: レッスン・授業・選抜 */
function HifPlan({ r }: { r: CalcResult }) {
  return (
    <div style={S.card}>
      <h2 style={S.h2}>レッスン・授業・選抜</h2>
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        <PlanTable
          head={["日程", "踏むタイプ", "2nd", "SP"]}
          rows={LESSONS.map((lesson, i) => {
            const pick = r.schedule.lessons[i];
            if (!pick.main) {
              return [lesson.label, <span key="n" style={{ color: FAINT }}>踏まない</span>, "", ""];
            }
            return [
              lesson.label,
              <TypeValue key="m" type={pick.main} />,
              <TypeValue key="s" type={pick.sub} />,
              spMark(pick.sp),
            ];
          })}
        />
        <PlanTable
          head={["授業", "タイプ"]}
          rows={CLASSES.map((cls, i) => [
            cls.label,
            <TypeValue key="t" type={r.schedule.classTypes[i]} />,
          ])}
        />
        <PlanTable
          head={["選抜", "Vo", "Da", "Vi", "合計"]}
          rows={EXAMS.map((exam, i) => {
            const manual = r.schedule.examStats[i];
            const scores = manual ?? r.schedule.examScores[i];
            const total = TYPE_KEYS.reduce((s, t) => s + scores[t], 0);
            return [
              manual ? `${exam.name}（ステ）` : exam.name,
              ...TYPE_KEYS.map((t) => fmt(scores[t])),
              <b key="total">{fmt(total)}</b>,
            ];
          })}
        />
      </div>
    </div>
  );
}

/** NIA: レッスン・営業・オーディション */
function NiaPlan({ r }: { r: CalcResult }) {
  const nia = r.niaSchedule;
  return (
    <div style={S.card}>
      <h2 style={S.h2}>レッスン・営業・オーディション</h2>
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        <PlanTable
          head={["レッスン", "タイプ", "SP"]}
          rows={NIA_LESSONS.map((lesson, i) => {
            const pick = nia.lessons[i];
            return [
              lesson.label,
              pick.main ? <TypeValue key="t" type={pick.main} /> : "―",
              spMark(pick.sp),
            ];
          })}
        />
        <PlanTable
          head={["営業", "タイプ"]}
          rows={NIA_SALES.map((sale, i) => [
            sale.label,
            <TypeValue key="t" type={nia.sales[i].type} />,
          ])}
        />
        <PlanTable
          head={["オーディション", "獲得票"]}
          rows={NIA_AUDITIONS.map((a, i) => [
            a.name,
            fmt(nia.auditionVotes[i] ?? 0),
          ])}
        />
      </div>
    </div>
  );
}

/** 初: レッスン・授業・試験 */
function HatsuPlan({ r }: { r: CalcResult }) {
  const hatsu = r.hatsuSchedule;
  return (
    <div style={S.card}>
      <h2 style={S.h2}>レッスン・授業・試験</h2>
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        <PlanTable
          head={["レッスン", "タイプ", "SP", "クリア"]}
          rows={HATSU_LESSONS.map((lesson, i) => {
            const pick = hatsu.lessons[i];
            return [
              lesson.label,
              pick.main ? <TypeValue key="t" type={pick.main} /> : "―",
              spMark(pick.sp),
              pick.perfect ? "パフェ" : "クリア",
            ];
          })}
        />
        <PlanTable
          head={["授業", "タイプ"]}
          rows={HATSU_CLASSES.map((cls, i) => [
            cls.label,
            <TypeValue key="t" type={hatsu.classTypes[i]} />,
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
              fmt(score),
            ];
          })}
        />
      </div>
    </div>
  );
}

/** 全角括弧→半角・空白除去（イベント上乗せキーとの突き合わせ用） */
const normLabel = (s: string) =>
  s.replace(/（/g, "(").replace(/）/g, ")").replace(/\s+/g, "");

/**
 * 発動回数の一覧（サポカの前イベ・後イベによる上乗せ込みの最終回数）。
 * 列数は auto-fill でアビリティが増えても自動で折り返す。
 */
function AbilityCountTable({ r }: { r: CalcResult }) {
  if (!r.selectedSet) {
    return <div style={{ color: FAINT }}>セット未選択</div>;
  }
  const set = r.selectedSet;
  const members = r.members.filter(
    (m): m is NonNullable<(typeof r.members)[number]> => m !== null,
  );
  // 編成の前イベ・後イベによる回数上乗せ（キーは正規化して突き合わせる）
  const extraRaw = sumEventContrib(members);
  const extraByNorm: Record<string, number> = {};
  for (const key in extraRaw) {
    extraByNorm[normLabel(key)] =
      (extraByNorm[normLabel(key)] ?? 0) + extraRaw[key];
  }
  const entries = (Object.keys(ABILITY_NAMES) as AbilityName[])
    .map((key) => {
      const label = ABILITY_NAMES[key];
      const base = r.ability.getCount(set, key);
      // 「〜回まで」の上限を超える上乗せは切り捨て（計算と同じ扱い）
      const extra = clampExtraCount(
        label,
        base,
        extraByNorm[normLabel(label)] ?? 0,
      );
      return { key, label, total: base + extra };
    })
    .filter((e) => e.total > 0);
  if (entries.length === 0) {
    return <div style={{ color: FAINT }}>回数の設定なし</div>;
  }
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
        gap: 0,
        border: `1px solid ${LINE}`,
      }}
    >
      {entries.map((e) => (
        <div
          key={e.key}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
            padding: "3px 8px",
            border: `0.5px solid ${LINE}`,
            fontSize: 12,
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {e.label}
          </span>
          <b style={{ fontVariantNumeric: "tabular-nums" }}>×{e.total}</b>
        </div>
      ))}
    </div>
  );
}
