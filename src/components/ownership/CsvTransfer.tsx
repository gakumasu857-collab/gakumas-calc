import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";

/**
 * 所持状況のCSV入出力（サポカ・Pアイドル共用の小さなUI）。
 * エクスポートで現在の所持状況をCSV保存でき、そのまま編集して読み込める。
 */
export default function CsvTransfer({
  formatNote,
  exportName,
  buildCsv,
  onImport,
  bare = false,
}: {
  /** 形式の説明（例: カード名,凸数（-1=未所持〜4）） */
  formatNote: string;
  /** ダウンロードするファイル名 */
  exportName: string;
  /** エクスポートするCSV文字列を作る */
  buildCsv: () => string;
  /** CSV本文を取り込み、反映件数と不一致名を返す */
  onImport: (text: string) => { applied: number; unmatched: string[] };
  /** モーダルの中に置くとき用（枠と背景を外す） */
  bare?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  const download = () => {
    // BOM付きUTF-8（Excelで文字化けしないように）
    const blob = new Blob(["﻿" + buildCsv()], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const { applied, unmatched } = onImport(text.replace(/^﻿/, ""));
      setMessage(
        `${applied}件反映しました。` +
          (unmatched.length > 0
            ? ` 一致しなかった名前 ${unmatched.length}件: ${unmatched
                .slice(0, 5)
                .join(" / ")}${unmatched.length > 5 ? " …" : ""}`
            : ""),
      );
    } catch {
      setMessage("読み込みに失敗しました（テキストのCSVか確認してください）");
    }
    // 同じファイルをもう一度選べるようにリセット
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${
        bare ? "" : "rounded-xl border border-slate-200 bg-white px-3 py-2"
      }`}
    >
      {!bare && <span className="font-bold text-slate-700">CSV</span>}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="flex items-center gap-1 rounded-lg border border-blue-600 px-2.5 py-1 font-medium text-blue-600 transition hover:bg-blue-50"
      >
        <Upload size={13} />
        読み込み
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        onChange={(e) => handleFile(e.target.files?.[0])}
        className="hidden"
      />
      <button
        type="button"
        onClick={download}
        className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 font-medium text-slate-600 transition hover:bg-slate-100"
      >
        <Download size={13} />
        書き出し
      </button>
      <span className="text-slate-400">形式: {formatNote}</span>
      {message && (
        <span className="w-full font-medium text-emerald-700">{message}</span>
      )}
    </div>
  );
}
