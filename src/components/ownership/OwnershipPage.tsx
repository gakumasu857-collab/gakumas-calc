import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Camera, Check, Settings2 } from "lucide-react";
import Modal from "@/components/Modal";
import SupportCardOwnership from "@/components/ownership/SupportCardOwnership";
import PIdolOwnership from "@/components/ownership/PIdolOwnership";
import OwnedSaveBar from "@/components/ownership/OwnedSaveBar";
import { BTN_SECONDARY } from "@/components/ui";
import { markOwnershipVisited } from "@/lib/ownershipAck";
import { useOwnedLevels } from "@/lib/useOwnedLevels";
import { useOwnedPIdols } from "@/lib/useOwnedPIdols";
import {
  adoptCustomizedAsOwn,
  BUILTIN_ALL4,
  BUILTIN_ID,
  DEFAULT_OWN_NAME,
  useOwnedSaves,
} from "@/lib/useOwnedSaves";

const NEW_OPTION = "__new__";
const SELECT =
  "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700";

/**
 * 所持状況入力ページ。
 * 「使う所持状況」が常に1つある: 既定の全サポカ完凸か、自分で作ったもの（またはセーブデータ用）。
 * 既定のまま凸を変えると「自分の所持状況」が自動で作られて使用中になり、変更はそこへ自動保存される。
 * 切り替えは上のプルダウン、名前・複製・削除・CSVは「管理」のモーダル。
 */
export default function OwnershipPage() {
  const [tab, setTab] = useState<"support" | "pidol">("support");
  // 所持ストアはこのページで1つだけ持って子へ配る
  // （フックごとに独立したstateなので、複数箇所で呼ぶと保存の読み込みが同期しない）
  const levels = useOwnedLevels();
  const pIdols = useOwnedPIdols();
  const saves = useOwnedSaves();
  const [manageOpen, setManageOpen] = useState<false | "manage" | "new">(false);
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = (text: string) => {
    setMessage(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 6000);
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    // 計算ページの「所持状況が未入力」判定は「このページを開いたことがあるか」で行う
    markOwnershipVisited();
    // 旧データ: 使用中が無いのに入力済みなら「自分の所持状況」として引き継ぐ
    adoptCustomizedAsOwn();
  }, []);

  const active =
    saves.activeId === BUILTIN_ID
      ? BUILTIN_ALL4
      : (saves.saves.find((s) => s.id === saves.activeId) ?? BUILTIN_ALL4);
  const isBuiltinActive = active.id === BUILTIN_ID;
  const own = saves.saves.filter((s) => !s.saveId);
  const linked = saves.saves.filter((s) => s.saveId);

  // 既定のまま凸を変えると「自分の所持状況」が自動で作られる。そのときだけ一言出す
  // （プルダウンで自分が切り替えたときは switchTo 側で出す）
  const prevActive = useRef(saves.activeId);
  const manualSwitch = useRef(false);
  useEffect(() => {
    const prev = prevActive.current;
    prevActive.current = saves.activeId;
    if (prev === saves.activeId) return;
    if (manualSwitch.current) {
      manualSwitch.current = false;
      return;
    }
    if (prev === BUILTIN_ID) {
      const created = saves.saves.find((s) => s.id === saves.activeId);
      if (created && !created.saveId) {
        notify(`「${created.name}」を作りました。これからの変更はここに自動で保存されます`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saves.activeId]);

  /** 使う所持状況を切り替える（その内容を読み込み、以後の変更の保存先にする） */
  const switchTo = (id: string) => {
    if (id === NEW_OPTION) {
      setManageOpen("new");
      return;
    }
    if (id === saves.activeId) return;
    const target =
      id === BUILTIN_ID ? BUILTIN_ALL4 : saves.saves.find((s) => s.id === id);
    if (!target) return;
    manualSwitch.current = true;
    // 先に使用中を切り替えてから読み込む（読み込み直後の自動保存が新しい先へ向くように）
    saves.setActiveSlot(id);
    levels.replaceAll(target.levels, target.cardCount);
    if (target.pIdols) pIdols.replaceAll(target.pIdols, target.pIdolCount);
    notify(
      id === BUILTIN_ID
        ? `「全サポカ完凸」に切り替えました（凸を変えると「${DEFAULT_OWN_NAME}」が自動で作られます）`
        : `「${target.name}」に切り替えました。変更はここに自動で保存されます`,
    );
  };

  const option = (s: { id: string; name: string; savedAt: string }) => (
    <option key={s.id} value={s.id}>
      {s.name}（{s.savedAt}）
    </option>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* 計算ページから来た人の帰り道（入力が終わったらここから戻る。使用中の所持状況で計算される） */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5">
        <p className="min-w-0 flex-1 text-sm text-slate-700">
          持っているサポカの凸を入れると、その所持状況で探索します。変更は自動で保存されるので、入力が終わったらそのまま戻ってください。
        </p>
        <Link
          to="/calc"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-500"
        >
          計算ページへ戻る
          <ArrowRight size={15} />
        </Link>
      </div>
      {/* 見出し行: 使う所持状況・管理、サポカ／Pアイドルの切替、キャプチャ入力 */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
          使う所持状況
          <select
            value={saves.activeId}
            onChange={(e) => switchTo(e.target.value)}
            className={`${SELECT} max-w-72`}
          >
            <option value={BUILTIN_ID}>全サポカ完凸（既定）</option>
            {own.length > 0 && <optgroup label="自分で作ったもの">{own.map(option)}</optgroup>}
            {linked.length > 0 && (
              <optgroup label="セーブデータ用（計算ページのセーブと一緒に保存）">
                {linked.map(option)}
              </optgroup>
            )}
            <option value={NEW_OPTION}>＋ 新しく作る…</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => setManageOpen("manage")}
          className={BTN_SECONDARY}
          title="名前の変更・複製・削除、CSVの書き出し・読み込み"
        >
          <Settings2 size={14} />
          管理・CSV
        </button>
        <select
          value={tab}
          onChange={(e) => setTab(e.target.value as "support" | "pidol")}
          className={SELECT}
        >
          <option value="support">サポートカード</option>
          <option value="pidol">Pアイドル</option>
        </select>
        <Link
          to="/card-import"
          className={`${BTN_SECONDARY} ml-auto`}
          title="ゲーム画面を映して所持を自動読み取り（β版・PCのみ）"
        >
          <Camera size={14} />
          画面キャプチャで入力
        </Link>
      </div>
      <p className="-mt-2 text-[11px] leading-relaxed text-slate-500">
        {isBuiltinActive ? (
          <>
            今は<b className="text-slate-700">全サポカ完凸</b>です。カードの凸や特訓を変えると
            <b className="text-slate-700">「{DEFAULT_OWN_NAME}」</b>
            が自動で作られ、以後の変更はそこに保存されます。
          </>
        ) : active.saveId ? (
          <>
            セーブデータ用の<b className="text-slate-700">「{active.name}」</b>
            を使っています。変更はここに自動で保存されます（最終 {active.savedAt}）。
          </>
        ) : (
          <>
            <b className="text-slate-700">「{active.name}」</b>
            を使っています。変更はここに自動で保存されます（最終 {active.savedAt}）。
          </>
        )}{" "}
        新しく実装されたサポカは完凸（4凸）として扱います。保存先はこのブラウザの中です（別端末・データ削除では引き継がれません）。
      </p>
      {message && (
        <p className="-mt-2 flex items-center gap-1 text-xs font-bold text-emerald-700">
          <Check size={13} />
          {message}
        </p>
      )}

      {tab === "support" ? (
        <SupportCardOwnership store={levels} />
      ) : (
        <PIdolOwnership store={pIdols} />
      )}

      {/* 所持状況の管理（新しく作る／名前・複製・削除／CSV） */}
      {manageOpen && (
        <Modal
          title={manageOpen === "new" ? "所持状況を新しく作る" : "所持状況の管理・CSV"}
          onClose={() => setManageOpen(false)}
        >
          <OwnedSaveBar
            levels={levels}
            pIdols={pIdols}
            store={saves}
            onDone={(msg) => {
              setManageOpen(false);
              if (msg) {
                manualSwitch.current = true;
                notify(msg);
              }
            }}
          />
        </Modal>
      )}
    </div>
  );
}
