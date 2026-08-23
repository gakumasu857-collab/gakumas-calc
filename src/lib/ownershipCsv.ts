import { SUPPORT_CATALOG } from "@/data/supportCardCatalog";
import { P_IDOL_MASTERS } from "@/lib/pIdol";

/**
 * 所持状況のCSV入出力（サポカ／Pアイドル）。
 * 画面から切り離しておくと、所持ページのヘッダー（モーダル）からも
 * 一覧コンポーネントからも同じ処理を使える。
 */

export type CsvImportResult = { applied: number; unmatched: string[] };

const unquote = (s: string) => s.trim().replace(/^"|"$/g, "").trim();

/* ============================ サポートカード ============================ */

export const SUPPORT_CSV_NOTE =
  "カード名,凸数（-1または未=未所持、0〜4=凸数。まず書き出して編集するのが確実）";
export const SUPPORT_CSV_FILENAME = "サポカ所持状況.csv";

/** 現在の所持状況をCSVにする（このまま編集して読み込める） */
export function buildSupportCsv(getLevel: (id: string) => number): string {
  return ["カード名,凸数"]
    .concat(SUPPORT_CATALOG.map((card) => `"${card.name}",${getLevel(card.id)}`))
    .join("\r\n");
}

/** CSVを読み込んで所持状況に反映（名前一致・-1または「未」=未所持） */
export function importSupportCsv(
  text: string,
  applyLevels: (entries: Record<string, number>) => void,
): CsvImportResult {
  const nameToId = new Map(SUPPORT_CATALOG.map((c) => [c.name, c.id]));
  const entries: Record<string, number> = {};
  const unmatched: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    // 名前にカンマが入っても大丈夫なように、最後のカンマで分ける
    const idx = line.lastIndexOf(",");
    if (idx < 0) continue;
    const name = unquote(line.slice(0, idx));
    const levelStr = unquote(line.slice(idx + 1));
    if (!name || name === "カード名") continue; // ヘッダー行
    const level =
      levelStr === "未" || levelStr === "未所持"
        ? -1
        : Number.parseInt(levelStr, 10);
    if (Number.isNaN(level)) {
      unmatched.push(name);
      continue;
    }
    const id = nameToId.get(name);
    if (!id) {
      unmatched.push(name);
      continue;
    }
    entries[id] = Math.max(-1, Math.min(4, level));
  }
  applyLevels(entries);
  return { applied: Object.keys(entries).length, unmatched };
}

/* ============================== Pアイドル ============================== */

export const PIDOL_CSV_NOTE =
  "アイドル,Pアイドル名,特訓,開花（特訓-1または未=未所持。まず書き出して編集するのが確実）";
export const PIDOL_CSV_FILENAME = "Pアイドル所持状況.csv";

export function buildPIdolCsv(
  getOwnership: (key: string) => { kunren: number; kaika: number } | null,
): string {
  return ["アイドル,Pアイドル名,特訓,開花"]
    .concat(
      P_IDOL_MASTERS.map((m) => {
        const o = getOwnership(m.key);
        return `"${m.idol}","${m.cardName}",${o ? o.kunren : -1},${o ? o.kaika : 0}`;
      }),
    )
    .join("\r\n");
}

/** CSVを読み込んで所持状況に反映（特訓-1または「未」=未所持） */
export function importPIdolCsv(
  text: string,
  applyOwnership: (
    entries: { key: string; kunren: number; kaika: number }[],
  ) => void,
): CsvImportResult {
  const entries: { key: string; kunren: number; kaika: number }[] = [];
  const unmatched: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const cols = line.split(",");
    if (cols.length < 4) continue;
    // 名前にカンマが入っても大丈夫なように、後ろ2列と先頭列を先に取る
    const kaikaStr = unquote(cols.pop()!);
    const kunrenStr = unquote(cols.pop()!);
    const idol = unquote(cols.shift()!);
    const name = unquote(cols.join(","));
    if (kunrenStr === "特訓" || !name) continue; // ヘッダー行
    const kunren =
      kunrenStr === "未" || kunrenStr === "未所持"
        ? -1
        : Number.parseInt(kunrenStr, 10);
    const kaika = Number.parseInt(kaikaStr, 10) || 0;
    if (Number.isNaN(kunren)) {
      unmatched.push(name);
      continue;
    }
    const master =
      P_IDOL_MASTERS.find((m) => m.idol === idol && m.cardName === name) ??
      P_IDOL_MASTERS.find((m) => m.cardName === name);
    if (!master) {
      unmatched.push(name);
      continue;
    }
    entries.push({ key: master.key, kunren, kaika });
  }
  applyOwnership(entries);
  return { applied: entries.length, unmatched };
}
