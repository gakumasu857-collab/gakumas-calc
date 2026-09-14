import { useState } from "react";
import Modal from "@/components/Modal";
import MemoryWorkbench from "@/components/memory-manager/MemoryWorkbench";
import Hint from "@/components/Hint";
import { BTN_PRIMARY, NOTE } from "@/components/ui";
import { GLOSSARY } from "@/lib/glossary";
import type { useCalcResult } from "@/lib/useCalcResult";

type CalcResult = ReturnType<typeof useCalcResult>;

/** 目安のテンプレ（メインパラボ60点）。Bを押すと4枠すべてこれになる */
const TEMPLATE_ID = "tpl-role60";

const TILE =
  "block cursor-pointer rounded-xl border border-blue-200 bg-blue-50 p-3 text-left transition hover:border-blue-400 hover:bg-blue-100";
const BADGE = "mb-1 inline-block rounded bg-blue-600 px-1.5 py-0.5 text-[11px] font-bold text-white";

/** A／Bのどちらかを押した印（"1"）。付いたら枠は二度と出さない */
const PATHS_DONE_KEY = "gakumas:calc:memoryPathsDone:v1";
const readPathsDone = () => {
  try {
    return localStorage.getItem(PATHS_DONE_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * 計算ページ内でメモリー4枚を選ぶモーダル。
 * 自分のメモリーがまだ無いときは、道を2つ（A: 枠をクリックして自分のメモリーを作る／B: 目安のテンプレを4枚入れる）
 * 押せる枠で見せる。どちらかを押したら枠は消え、以後は出さない（PATHS_DONE_KEY。
 * メモリーを全部外しても戻らない。ユーザー指示）。
 * 中身は MemoryWorkbench（作業台: 枠をクリックして作る・保存は任意・セットの保存／呼び出し）。メモリーページは廃止。
 */
export default function MemoryPickerModal({
  r,
  onClose,
}: {
  r: CalcResult;
  onClose: () => void;
}) {
  const store = r.memoryStore;
  // 自分で保存したメモリーがまだ無い（テンプレだけ）
  const noOwn = store.library.length === 0;
  const [pathsDone, setPathsDone] = useState(readPathsDone);
  const markPathsDone = () => {
    setPathsDone(true);
    try {
      localStorage.setItem(PATHS_DONE_KEY, "1");
    } catch {
      /* 保存できなくても表示は消す */
    }
  };
  const showPaths = noOwn && !pathsDone;
  /** A を押した回数（作業台に「最初の空枠を編集」を頼む） */
  const [focusKey, setFocusKey] = useState(0);
  const startOwn = () => {
    markPathsDone();
    setFocusKey((k) => k + 1);
  };
  const fillTemplate = () => {
    store.fillSlots(TEMPLATE_ID);
    markPathsDone();
  };

  return (
    <Modal title="メモリーを4枚選ぶ" onClose={onClose} widthClass="max-w-5xl">
      <p className="text-sm text-slate-700">
        育成の開始時に持ち込むメモリー4枚の設定です。
      </p>

      {showPaths && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div
            role="button"
            tabIndex={0}
            onClick={startOwn}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                startOwn();
              }
            }}
            className={TILE}
          >
            <span className={BADGE}>A</span>
            <span className="block text-sm font-bold text-slate-800">
              持っているメモリーを登録して使う
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              自分のメモリーを入力できます（枠をクリックして、下で中身を作る）
            </span>
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={fillTemplate}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fillTemplate();
              }
            }}
            className={TILE}
          >
            <span className={BADGE}>B</span>
            <span className="block text-sm font-bold text-slate-800">
              汎用のメモリーを入れる
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-slate-500">
              メインのタイプがパラボの60点のテンプレメモリー
              <Hint text={GLOSSARY.mainParabo} />
            </span>
          </div>
        </div>
      )}

      <div className="mt-3">
        <MemoryWorkbench store={store} paraboAssign={r.paraboAssign} focusKey={focusKey} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onClose} className={BTN_PRIMARY}>
          この{store.count}枚で決定
        </button>
        <span className={NOTE}>
          枠をクリックして中身を作れます（保存は任意）。保存したメモリーは一覧から、4枚そろえばセットとしても保存できます。
        </span>
      </div>
    </Modal>
  );
}
