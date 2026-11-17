import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Camera, Check, Settings2 } from "lucide-react";
import Modal from "@/components/Modal";
import SupportCardOwnership from "@/components/ownership/SupportCardOwnership";
import PIdolOwnership from "@/components/ownership/PIdolOwnership";
import OwnedSaveBar from "@/components/ownership/OwnedSaveBar";
import { BTN_SECONDARY } from "@/components/ui";
import { SUPPORT_CATALOG } from "@/data/supportCardCatalog";
import { P_IDOL_MASTERS } from "@/lib/pIdol";
import { markOwnershipVisited } from "@/lib/ownershipAck";
import { importPIdolCsv, importSupportCsv } from "@/lib/ownershipCsv";
import { clearPortalHash, hasPortalHash, readPortalHash, type PortalPayload } from "@/lib/portalImport";
import {
  isPortalSlotActive,
  PORTAL_SLOT_NAME,
  readLink,
  refreshFromPortal,
  startLink,
  subscribePortal,
  takeNotice,
} from "@/lib/portalLink";
import { SUPPORT_CARD_DB } from "@/data/supportCardsDb";
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

  // ---------- ハイ元クロスポータル ----------
  // ポータルの「ほぺマスで開く」から来たとき（/support#halogen=…）だけ、連携の案内を出す（ふつうの利用者には何も出ない）
  const [portalOffer, setPortalOffer] = useState<PortalPayload | null>(null);
  const [linking, setLinking] = useState(false);
  /** ポータルの最新に合わせて、所持ストアに読み込む（連携中のときだけ） */
  const loadFromPortal = async (message: string) => {
    const r = await refreshFromPortal();
    if (!r) return;
    levels.replaceAll(r.levels, SUPPORT_CARD_DB.length);
    pIdols.replaceAll(r.pIdols, P_IDOL_MASTERS.length);
    notify(message);
  };
  const portalHandled = useRef(false);
  useEffect(() => {
    // ログインから戻ったときなどの一言
    const n = takeNotice();
    if (n) notify(n.message);
    // ポータルへの保存に失敗したときだけ一言出す（成功は静かに）
    const off = subscribePortal((d) => !d.ok && notify(d.message));
    if (!portalHandled.current && hasPortalHash()) {
      portalHandled.current = true;
      readPortalHash()
        .then((p) => {
          clearPortalHash();
          if (!p) return;
          if (readLink()) {
            // もう連携している：ポータルの最新を読むだけ（「ハイ元クロスポータル」に切り替わる）
            manualSwitch.current = true;
            loadFromPortal("ハイ元クロスポータルと連携中です。ポータルの最新を読み込みました").catch(() =>
              notify("ポータルの最新を読み込めませんでした。通信を確かめて、もう一度お試しください"),
            );
          } else setPortalOffer(p);
        })
        .catch(() => {
          clearPortalHash();
          notify("ポータルからのデータを読み込めませんでした。ポータルでもう一度「ほぺマスで開く」を押してください");
        });
    }
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 今回だけ読み込む（連携しない。今使っている所持状況へ） */
  const importOnce = (p: PortalPayload) => {
    setPortalOffer(null);
    const sup = p.sup ? importSupportCsv(p.sup, levels.applyLevels) : { applied: 0, unmatched: [] };
    const idol = p.idol ? importPIdolCsv(p.idol, pIdols.applyOwnership) : { applied: 0, unmatched: [] };
    const miss = [...sup.unmatched, ...idol.unmatched];
    notify(
      `ポータルから読み込みました（サポカ ${sup.applied}枚・Pアイドル ${idol.applied}枚）` +
        (miss.length ? `。こちらに無いカード ${miss.length}枚は飛ばしました: ${miss.slice(0, 3).join(" / ")}${miss.length > 3 ? " …" : ""}` : ""),
    );
  };
  const doLink = () => {
    setLinking(true);
    startLink().catch(() => {
      setLinking(false);
      notify("ログインの画面を開けませんでした。もう一度お試しください");
    });
  };

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
    if (readLink()?.slotId === id) {
      loadFromPortal(`「${target.name}」に切り替えて、ポータルの最新を読み込みました`).catch(() =>
        notify(`「${target.name}」に切り替えました（ポータルの最新は読み込めませんでした）`),
      );
      return;
    }
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

  // タブに出す所持数
  const supportOwned = levels.loaded ? SUPPORT_CATALOG.filter((c) => levels.getLevel(c.id) >= 0).length : null;
  const pIdolOwned = pIdols.loaded ? P_IDOL_MASTERS.filter((m) => pIdols.getOwnership(m.key)).length : null;
  const tabBtn = (key: "support" | "pidol", label: string, owned: number | null, total: number) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === key}
      onClick={() => setTab(key)}
      className={`-mb-px flex flex-1 flex-col items-center whitespace-nowrap border-b-2 px-4 py-2 text-sm font-bold transition sm:flex-none sm:flex-row sm:items-baseline sm:gap-2 ${
        tab === key
          ? "border-blue-600 text-blue-700"
          : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
      }`}
    >
      {label}
      <span className="text-xs font-normal text-slate-400">
        {owned !== null ? `所持 ${owned} / ${total}` : `${total}枚`}
      </span>
    </button>
  );

  // 2026-11-09 に整理（オーナー「ごちゃごちゃしてる。機能は減らさないで」）:
  // 上の枠に「使う所持状況」と操作ボタン（管理・CSV／画面キャプチャ／計算ページへ戻る）と今の状態の1行、
  // その下にサポカ／Pアイドルのタブ（所持数つき）、一覧の上に検索・絞り込み・一括入力の帯、説明はページの下へ
  return (
    <div className="flex flex-col gap-4">
      {/* 使う所持状況と操作 */}
      <section className="rounded-xl border border-slate-200 bg-white px-3 py-3 sm:px-4">
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
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <Link
              to="/card-import"
              className={BTN_SECONDARY}
              title="ゲーム画面を映して所持を自動読み取り（β版・PCのみ）"
            >
              <Camera size={14} />
              画面キャプチャで入力
            </Link>
            {/* 計算ページから来た人の帰り道 */}
            <Link
              to="/calc"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-500"
            >
              計算ページへ戻る
              <ArrowRight size={15} />
            </Link>
          </span>
        </div>
        <p
          className="mt-2 text-[11px] leading-relaxed text-slate-500"
          title={active?.savedAt ? `最終保存 ${active.savedAt}` : undefined}
        >
          {isPortalSlotActive() && active.id === readLink()?.slotId ? (
          <>
            <b className="text-slate-700">「{active.name}」</b>
            を使っています（{readLink()?.playerName} さん）。ポータルと自動で同じ内容になります。
          </>
        ) : isBuiltinActive ? (
            <>
              今は<b className="text-slate-700">全サポカ完凸</b>です。凸や特訓を変えると
              <b className="text-slate-700">「{DEFAULT_OWN_NAME}」</b>
              ができて、そこに保存されます。
            </>
          ) : active.saveId ? (
            <>
              セーブデータ用の<b className="text-slate-700">「{active.name}」</b>
              を使っています。変えたら自動で保存されます。
            </>
          ) : (
            <>
              <b className="text-slate-700">「{active.name}」</b>
              を使っています。変えたら自動で保存されます。
            </>
          )}
        </p>
      </section>
      {portalOffer && (
        <div className="flex flex-col gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-slate-700">
          <p className="font-bold">
            ハイ元クロスポータルから開きました{portalOffer.from ? `（${portalOffer.from} さんの所持状況）` : ""}
          </p>
          <p className="leading-relaxed">
            連携すると、ここで変えた所持状況がポータルにも保存され、開くたびにポータルの最新が入ります（Discord でログインします）。
            所持状況に「{PORTAL_SLOT_NAME}」ができて、ほかの所持状況はそのまま残ります。
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={linking} onClick={doLink} className="rounded-lg bg-blue-600 px-3 py-1.5 font-bold text-white transition hover:bg-blue-500 disabled:opacity-50">
              {linking ? "ログインへ移動しています…" : "ポータルと連携する（おすすめ）"}
            </button>
            <button type="button" onClick={() => importOnce(portalOffer)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-600 transition hover:bg-slate-100">
              今回だけ読み込む
            </button>
            <button type="button" onClick={() => setPortalOffer(null)} className="rounded-lg px-3 py-1.5 font-medium text-slate-500 transition hover:bg-slate-100">
              閉じる
            </button>
          </div>
        </div>
      )}
      {message && (
        <p className="-mt-2 flex items-center gap-1 text-xs font-bold text-emerald-700">
          <Check size={13} />
          {message}
        </p>
      )}

      {/* サポカ／Pアイドルの切り替え */}
      <div role="tablist" className="-mb-1 flex border-b border-slate-200">
        {tabBtn("support", "サポートカード", supportOwned, SUPPORT_CATALOG.length)}
        {tabBtn("pidol", "Pアイドル", pIdolOwned, P_IDOL_MASTERS.length)}
      </div>

      {tab === "support" ? (
        <SupportCardOwnership store={levels} />
      ) : (
        <PIdolOwnership store={pIdols} />
      )}

      {/* 説明（ページの下にまとめる） */}
      <p className="text-[11px] leading-relaxed text-slate-400">
        {tab === "pidol" && (
          <>
            特訓の「未」で未所持に。レアリティ・プラン・計算後のステータスは
            データベースページで確認できます。
          </>
        )}
        新しく実装されたサポカは完凸（4凸）として扱います。保存先はこのブラウザの中です（別端末・データ削除では引き継がれません）。
      </p>

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
