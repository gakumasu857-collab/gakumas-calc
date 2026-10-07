import { useEffect, useState } from "react";
import { BookMarked, Save, Trash2 } from "lucide-react";
import { BTN_PRIMARY, BTN_SECONDARY, NOTE } from "@/components/ui";
import { resolveParaboMemory, type ParaboAssign } from "@/lib/memoryTotals";
import {
  MAIN_PARABO_OPTIONS,
  slotToMemory,
  type Memory,
  type SlotMemory,
} from "@/lib/memoryTypes";
import type { SlotStatus } from "@/lib/useMemoryStore";
import MemoryFields from "./MemoryFields";

/** 保存状態のバッジ（保存したメモリー（1枚ずつ）とのつながり。空・未保存は出さない） */
const STATUS_BADGE: Record<SlotStatus, { label: string; cls: string } | null> = {
  empty: null,
  template: { label: "メインパラボ", cls: "bg-indigo-100 text-indigo-700" },
  unsaved: null,
  saved: { label: "保存済み ✓", cls: "bg-emerald-100 text-emerald-700" },
  modified: { label: "保存元から変更あり", cls: "bg-amber-100 text-amber-800" },
};

/** 枠の中身の種類 */
type Kind = "abilities" | "parabo";

/**
 * 選んだ枠のメモリーをその場で作る・変える編集枠（2026-10-07 に組み替え）。
 * - 「アビリティを選ぶ」: 値のボタンを押すとそのまま枠の中身が変わる（保存は任意。保存しなくても計算に使える）
 * - 「メインパラボ」: 45点・60点・70点のテンプレをこの枠に入れる（%は踏み方でパラボの影響が大きい上位2タイプ、
 *   残り1タイプに固定値。踏み方を変えると付け先も自動で変わる）。一覧には出さず、ここで選ぶ
 * - 保存したメモリー（1枚ずつ）は使う機会が少ないので、右の小さなボタンにまとめる
 *   （「一覧から選ぶ」＝モーダルで今まで通り選ぶ・編集・削除／「この中身を保存」。同じ中身が保存済みなら保存の前に確認）
 */
export default function SlotEditor({
  index,
  value,
  status,
  sourceName,
  duplicate,
  paraboAssign,
  libraryCount,
  onChange,
  onClear,
  onPickParabo,
  onSaveNew,
  onOverwrite,
  onUseDuplicate,
  onOpenLibrary,
}: {
  index: number;
  value: SlotMemory | null;
  status: SlotStatus;
  /** 保存元のメモリー名（上書き保存ボタンに出す） */
  sourceName?: string;
  /** 同じアビリティ・プランで保存済みのメモリー（あれば保存の前に注意を出す） */
  duplicate?: Memory;
  /** テンプレ（パラボ追従）の中身を今の踏み方で展開するための割当 */
  paraboAssign: ParaboAssign;
  /** 保存したメモリー（1枚ずつ）の枚数（「一覧から選ぶ」のバッジ） */
  libraryCount: number;
  onChange: (next: SlotMemory) => void;
  onClear: () => void;
  /** メインパラボ（テンプレのID）をこの枠に入れる */
  onPickParabo: (templateId: string) => void;
  onSaveNew: () => void;
  onOverwrite: () => void;
  /** 保存済みの同じメモリーをこの枠に使う（保存せずにつなぐ） */
  onUseDuplicate: () => void;
  /** 保存したメモリーの一覧（モーダル）を開く */
  onOpenLibrary: () => void;
}) {
  const base: SlotMemory = value ?? { plan: "共通", abilities: [] };
  const isTemplate = status === "template";
  // 中身の種類の切り替え。切り替えただけでは枠は変わらない（値や点数を押したときに変わる）。枠を移ったら中身に合わせる
  const [kindOverride, setKindOverride] = useState<Kind | null>(null);
  useEffect(() => setKindOverride(null), [index]);
  const kind: Kind = kindOverride ?? (isTemplate ? "parabo" : "abilities");
  // テンプレは今の踏み方で展開した中身を出発点にする（値を変えた時点で普通のメモリーになる）
  const shown = isTemplate
    ? resolveParaboMemory(slotToMemory(base, index), paraboAssign).abilities
    : base.abilities;
  const shownText = shown.map((a) => `${a.attr}${a.value}`).join(" / ");
  const canSave = !isTemplate && base.abilities.length > 0;
  const badge = STATUS_BADGE[status];
  const currentParabo = base.roleSpec
    ? MAIN_PARABO_OPTIONS.find(
        (o) => o.mainPct === base.roleSpec!.mainPct && o.subFlat === base.roleSpec!.subFlat,
      )
    : undefined;

  // 「この中身を保存」で、同じ中身が保存済みなら先に確認する
  const [dupPrompt, setDupPrompt] = useState(false);
  useEffect(() => setDupPrompt(false), [index, status]);
  const dupName = duplicate ? (duplicate.skillName ?? duplicate.plan) : "";
  const saveNew = () => {
    if (duplicate) setDupPrompt(true);
    else onSaveNew();
  };

  return (
    <section id="memory-slot-editor" className="rounded-xl border-2 border-blue-300 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold text-slate-900">枠{index + 1} の中身</h2>
        {badge && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${badge.cls}`}>
            {badge.label}
          </span>
        )}
        {status === "empty" && <span className="text-xs text-slate-400">空</span>}
        {/* 中身の種類 */}
        <div className="ml-auto flex gap-0.5 rounded-lg bg-slate-100 p-0.5">
          <KindTab on={kind === "abilities"} onClick={() => setKindOverride("abilities")}>
            アビリティを選ぶ
          </KindTab>
          <KindTab on={kind === "parabo"} onClick={() => setKindOverride("parabo")}>
            メインパラボ
          </KindTab>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
        <div>
          {kind === "parabo" ? (
            <>
              <p className={`mb-2 ${NOTE}`}>
                パラボのメモリーの代わりになるテンプレです。%を、踏み方でパラボの影響が大きい上位2タイプに付け、残り1タイプに固定値を付けます。踏み方を変えると付け先も自動で変わります。
              </p>
              <div className="flex flex-wrap gap-2">
                {MAIN_PARABO_OPTIONS.map((o) => {
                  const on = isTemplate && currentParabo?.id === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => onPickParabo(o.id)}
                      className={`flex flex-col items-center rounded-lg border px-4 py-2 text-sm font-bold transition ${
                        on
                          ? "border-indigo-600 bg-indigo-600 text-white"
                          : "border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
                      }`}
                    >
                      <span>メインパラボ{o.points}点</span>
                      <span className={`text-[10px] font-normal ${on ? "text-indigo-100" : "text-indigo-500"}`}>
                        +{o.mainPct}%×2タイプ・固定+{o.subFlat}
                      </span>
                    </button>
                  );
                })}
              </div>
              {isTemplate ? (
                <p className={`mt-3 ${NOTE}`}>
                  この枠は「{base.skillName ?? "メインパラボ"}」。今の踏み方では{" "}
                  <b className="text-slate-700">{shownText}</b> として計算します。
                </p>
              ) : (
                <p className={`mt-3 ${NOTE}`}>
                  点数を押すと、この枠がメインパラボになります
                  {value ? "（今の中身は置き換わります）" : ""}。
                </p>
              )}
            </>
          ) : (
            <>
              {isTemplate && (
                <p className="mb-3 rounded-lg bg-indigo-50 p-2.5 text-xs leading-relaxed text-indigo-900">
                  メインパラボ「{base.skillName ?? ""}」の中身（今の踏み方では {shownText}）から始めます。値を押すと、そこから変えた普通のメモリーになります。
                </p>
              )}
              <MemoryFields
                value={{
                  plan: base.plan,
                  skillName: isTemplate ? undefined : base.skillName,
                  abilities: shown,
                }}
                onChange={(next) =>
                  isTemplate
                    ? // テンプレから外れて普通のメモリーに（追従の印と保存元は外す）
                      onChange({ plan: next.plan, skillName: next.skillName, abilities: next.abilities })
                    : onChange({ ...base, ...next })
                }
              />
            </>
          )}
        </div>

        {/* 右: この枠の操作。保存したメモリー（1枚ずつ）は使う機会が少ないので、ここに小さくまとめる */}
        <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <button
            type="button"
            onClick={onClear}
            disabled={status === "empty"}
            className={BTN_SECONDARY}
          >
            <Trash2 size={13} />
            この枠を空にする
          </button>
          <div className="mt-1 border-t border-slate-200 pt-2">
            <p className="mb-1 text-[11px] font-bold text-slate-500">保存したメモリー（1枚ずつ）</p>
            <p className={`mb-2 ${NOTE}`}>
              よく使う1枚を保存しておくと、一覧から枠に入れられます。保存しなくても計算には使えます。
            </p>
            <div className="flex flex-col items-start gap-1.5">
              <button type="button" onClick={onOpenLibrary} className={BTN_SECONDARY}>
                <BookMarked size={13} />
                一覧から選ぶ{libraryCount > 0 ? `（${libraryCount}）` : ""}
              </button>
              {status === "unsaved" && (
                <button
                  type="button"
                  onClick={saveNew}
                  disabled={!canSave}
                  title={canSave ? undefined : "アビリティを1つ以上選ぶと保存できます"}
                  className={BTN_SECONDARY}
                >
                  <Save size={13} />
                  この中身を保存
                </button>
              )}
              {status === "modified" && (
                <>
                  <button
                    type="button"
                    onClick={onOverwrite}
                    disabled={!canSave}
                    className={BTN_SECONDARY}
                  >
                    <Save size={13} />
                    上書き保存{sourceName ? `（${sourceName}）` : ""}
                  </button>
                  <button type="button" onClick={saveNew} disabled={!canSave} className={BTN_SECONDARY}>
                    別のメモリーとして保存
                  </button>
                </>
              )}
              {status === "saved" && (
                <p className={NOTE}>
                  「{sourceName ?? "保存したメモリー"}」として保存済み。値を変えると上書き保存できます。
                </p>
              )}
              {status === "template" && (
                <p className={NOTE}>メインパラボはテンプレなので、保存はいりません。</p>
              )}
            </div>

            {/* 同じ中身がもう保存されているときの確認（保存を押したときだけ） */}
            {dupPrompt && duplicate && (
              <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-900">
                <b>同じアビリティ・プランのメモリー「{dupName}」がもう保存されています。</b>
                <br />
                同じものなら「保存済みを使う」でつなげます。別物として残したいときは、名前を付けるかプランを変えてから保存してください。
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setDupPrompt(false);
                      onUseDuplicate();
                    }}
                    className={BTN_PRIMARY}
                  >
                    保存済みの「{dupName}」を使う
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDupPrompt(false);
                      onSaveNew();
                    }}
                    className={BTN_SECONDARY}
                  >
                    それでも別に保存
                  </button>
                  <button type="button" onClick={() => setDupPrompt(false)} className={BTN_SECONDARY}>
                    やめる
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <p className={`mt-3 ${NOTE}`}>
        {status === "empty"
          ? "値のボタンか「メインパラボ」の点数を押すと、この枠にメモリーが入ります。保存しなくても計算に使えます。"
          : "枠の中身はその場で計算に反映されます。4枚まとめて取っておくときは、上の「メモリーセット」で保存します。"}
      </p>
    </section>
  );
}

/** 中身の種類の切り替えボタン */
function KindTab({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-bold transition ${
        on ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-200"
      }`}
    >
      {children}
    </button>
  );
}
