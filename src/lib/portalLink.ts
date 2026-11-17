/**
 * ハイ元クロスポータルとの連携（連携した人だけに働く）。
 *
 * 連携すると、所持状況に「ハイ元クロスポータル」が1つでき、それを使っている間は
 * - ページを開くたびに、ポータルの最新を読み込む（main.tsx の preparePortal。描画の前に済ませる）
 * - 凸や特訓を変えるたびに、その分だけポータルへ保存する（所持ストアの保存effect → portalChanged）
 * ほかの所持状況は今までどおり、このブラウザの中だけ。
 *
 * 「最後にポータルと一致していた内容」（基準）を覚えておき、手元との差だけを送る。
 * 送れなかった分は差として残るので、次の変更や次に開いたときに送り直される。
 * 通信の処理（portalApi.ts と Supabase のライブラリ）は、連携した人のときだけ import() で読み込む。
 * 連携の入口はポータルの「ほぺマスで開く」から来たときだけ出す（OwnershipPage）。
 */
import { P_IDOL_MASTERS } from "./pIdol";
import { readActiveSlotId, writePortalSlot } from "./useOwnedSaves";
import type { PIdolOwnership } from "./useOwnedPIdols";

export const PORTAL_SLOT_NAME = "ハイ元クロスポータル";
const LINK_KEY = "gakumas:portal:v1";
const BASE_KEY = "gakumas:portal:base:v1";
const LINKING_KEY = "gakumas:portal:linking";
const NOTICE_KEY = "gakumas:portal:notice";
const LEVELS_KEY = "gakumas:ownedLevels:v1";
const PIDOLS_KEY = "gakumas:pIdols:v1";
const PIDOLS_COUNT_KEY = "gakumas:pIdols:count:v1";
const EVENT = "gakumas:portal";

type Link = { slotId: string; playerId: number; playerName: string };
type PIdolMap = Record<string, PIdolOwnership>;
type Base = { levels: Record<string, number>; pIdols: Record<string, PIdolOwnership | null> };

const api = () => import("./portalApi");

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // 容量超過などは無視
  }
}

export const readLink = (): Link | null => readJson<Link>(LINK_KEY);
/** 連携していて、いま「ハイ元クロスポータル」を使っているか */
export const isPortalSlotActive = (): boolean => {
  const link = readLink();
  return !!link && readActiveSlotId() === link.slotId;
};

/** 画面に一言出す（OwnershipPage が受け取る） */
function emit(ok: boolean, message: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { ok, message } }));
}
export function subscribePortal(fn: (d: { ok: boolean; message: string }) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
/** ページを読み直したあとに出す一言（ログインから戻ったときなど） */
export function takeNotice(): { ok: boolean; message: string } | null {
  const n = readJson<{ ok: boolean; message: string }>(NOTICE_KEY);
  if (n) localStorage.removeItem(NOTICE_KEY);
  return n;
}

/** 手元と基準の差（＝まだポータルに送っていない変更）。ポータルにあるカードだけを見る */
function diff(levels: Record<string, number>, pIdols: PIdolMap, base: Base) {
  const out: Base = { levels: {}, pIdols: {} };
  let n = 0;
  for (const [k, b] of Object.entries(base.levels)) {
    const cur = k in levels ? levels[k] : 4; // サポカは「無い＝完凸」
    if (cur !== b) { out.levels[k] = cur; n++; }
  }
  for (const [k, b] of Object.entries(base.pIdols)) {
    const cur = pIdols[k] ?? null;
    if (JSON.stringify(cur) !== JSON.stringify(b)) { out.pIdols[k] = cur; n++; }
  }
  return { changes: out, count: n };
}
/** ポータルの内容を手元に重ねる（ポータルに無いカード＝Rのサポカなどは手元のまま） */
function merge(levels: Record<string, number>, pIdols: PIdolMap, portal: Base) {
  const lv = { ...levels, ...portal.levels };
  const pi: PIdolMap = { ...pIdols };
  for (const [k, v] of Object.entries(portal.pIdols)) {
    if (v) pi[k] = v;
    else delete pi[k];
  }
  return { levels: lv, pIdols: pi };
}
const applyTo = (base: Base, changes: Base): Base => ({
  levels: { ...base.levels, ...changes.levels },
  pIdols: { ...base.pIdols, ...changes.pIdols },
});

/** 所持ストアの中身（このブラウザ） */
const localLevels = () => readJson<Record<string, number>>(LEVELS_KEY) ?? {};
const localPIdols = () => readJson<PIdolMap>(PIDOLS_KEY) ?? {};

/** ポータルと合わせた内容を、所持ストアと「ハイ元クロスポータル」の所持状況に書く */
function writeLocal(link: Link | null, levels: Record<string, number>, pIdols: PIdolMap): string {
  writeJson(LEVELS_KEY, levels);
  writeJson(PIDOLS_KEY, pIdols);
  writeJson(PIDOLS_COUNT_KEY, P_IDOL_MASTERS.length); // 無いPアイドル＝未所持（新カード扱いにしない）
  return writePortalSlot(link?.slotId ?? null, PORTAL_SLOT_NAME, levels, pIdols);
}

/**
 * 手元の未送信分を送ってから、ポータルの最新を読み、合わせた内容を返す（書き込みは apply が true のときだけ）。
 * 返り値は所持ストアの replaceAll に渡せる形。
 */
async function syncNow(link: Link, apply: () => boolean) {
  const a = await api();
  const base = readJson<Base>(BASE_KEY) ?? { levels: {}, pIdols: {} };
  const levels = localLevels(), pIdols = localPIdols();
  const { changes, count } = diff(levels, pIdols, base);
  const portal = await a.pull(link.playerId); // 番号の対応表もここで作られる
  let latest: Base = portal;
  if (count) {
    await a.push(link.playerId, changes);
    latest = applyTo(portal, changes);
  }
  const merged = merge(levels, pIdols, latest);
  if (!apply()) return null;
  writeJson(BASE_KEY, latest);
  writeLocal(link, merged.levels, merged.pIdols);
  return { ...merged, sent: count };
}

/**
 * main.tsx から、描画の前に1回呼ぶ。連携していない人は何もしない（通信もしない）。
 * - Discord ログインから戻ってきたとき（?code=…）: 連携を仕上げる
 * - 「ハイ元クロスポータル」を使っているとき: 未送信分を送って、ポータルの最新を読み込む
 * 遅いときは最大4秒で諦めて、そのまま手元の内容で表示する（次に開いたときにまた合わせる）。
 */
export async function preparePortal(): Promise<void> {
  const url = new URL(window.location.href);
  if (url.searchParams.has("code") && localStorage.getItem(LINKING_KEY)) {
    await finishLink(url);
    return;
  }
  const link = readLink();
  if (!link || readActiveSlotId() !== link.slotId) return;
  let open = true;
  const job = syncNow(link, () => open).catch(() => {
    if (open) writeJson(NOTICE_KEY, { ok: false, message: "ポータルの最新を読み込めませんでした（通信を確かめてください）。このブラウザに残っている内容で表示しています" });
    return null;
  });
  await Promise.race([job, new Promise((r) => setTimeout(r, 4000))]);
  open = false;
}

/** 連携を始める（Discord のログインへ移る） */
export async function startLink(): Promise<void> {
  localStorage.setItem(LINKING_KEY, "1");
  await (await api()).signIn();
}

/** ログインから戻ったとき：プレイヤーを確かめ、ポータルの内容で「ハイ元クロスポータル」を作って使用中にする */
async function finishLink(url: URL) {
  localStorage.removeItem(LINKING_KEY);
  try {
    const a = await api();
    const player = await a.myPlayer();
    if (!player) {
      await a.signOut();
      writeJson(NOTICE_KEY, { ok: false, message: "この Discord アカウントは、ハイ元クロスポータルでまだプレイヤーと連携していません。ポータルで連携してから、もう一度お試しください" });
      return;
    }
    const portal = await a.pull(player.id);
    const merged = merge(localLevels(), localPIdols(), portal);
    const old = readLink();
    const slotId = writeLocal(old, merged.levels, merged.pIdols);
    writeJson(LINK_KEY, { slotId, playerId: player.id, playerName: player.name } satisfies Link);
    writeJson(BASE_KEY, portal);
    writeJson(NOTICE_KEY, { ok: true, message: `ハイ元クロスポータルと連携しました（${player.name} さん）。これからは、ここで変えた所持状況がポータルにも保存され、開くたびにポータルの最新を読み込みます` });
  } catch (e) {
    writeJson(NOTICE_KEY, { ok: false, message: `連携できませんでした（${(e as Error)?.message ?? e}）。もう一度お試しください` });
  } finally {
    // ログインの戻りの印（?code=…）をアドレスから消す
    url.searchParams.delete("code");
    window.history.replaceState(window.history.state, "", url.pathname + (url.search || "") + url.hash);
  }
}

/** 所持状況ページで「ハイ元クロスポータル」に切り替えたとき・ポータルから来たとき：最新に合わせて返す */
export async function refreshFromPortal() {
  const link = readLink();
  if (!link) return null;
  return syncNow(link, () => true);
}

/** 連携をやめる（所持状況「ハイ元クロスポータル」はふつうの所持状況として残る） */
export async function unlink(): Promise<void> {
  if (!readLink()) return;
  await (await api()).signOut();
  localStorage.removeItem(LINK_KEY);
  localStorage.removeItem(BASE_KEY);
}

// ---------- 変更のたびにポータルへ送る ----------
let timer: ReturnType<typeof setTimeout> | null = null;
let sending = false;
let again = false;

/** 所持ストアの保存effectから呼ぶ（連携していない・別の所持状況を使っているときは何もしない） */
export function portalChanged(): void {
  if (!isPortalSlotActive()) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, 700); // 続けて押したときは、まとめて1回で送る
}

async function flush() {
  timer = null;
  if (sending) { again = true; return; }
  const link = readLink();
  if (!link || readActiveSlotId() !== link.slotId) return;
  const base = readJson<Base>(BASE_KEY);
  if (!base) return;
  const { changes, count } = diff(localLevels(), localPIdols(), base);
  if (!count) return;
  sending = true;
  try {
    const a = await api();
    if (a.needsCatalog()) await a.pull(link.playerId); // 番号の対応表を作る（開いたときの読み込みに失敗していた場合）
    await a.push(link.playerId, changes);
    writeJson(BASE_KEY, applyTo(readJson<Base>(BASE_KEY) ?? base, changes));
    emit(true, "ポータルにも保存しました");
  } catch {
    emit(false, "ポータルに保存できませんでした。このブラウザには残っているので、次に変えたときか、次に開いたときに送り直します");
  } finally {
    sending = false;
    if (again) { again = false; portalChanged(); }
  }
}
