/**
 * ハイ元クロスポータル（https://halogen.hoppepan.com）との通信。
 * 連携した人のときだけ読み込む（portalLink.ts から import() で呼ぶ）ので、ふつうの利用者のページは重くならない。
 *
 * ポータルのデータベース（Supabase）に、ポータルと同じ Discord ログインでつなぐ。
 * 読み書きできる範囲はポータルと同じ決まり（本人の所持状況だけ書ける）で、データベース側が判定する。
 * 対応付けはスプシの id：サポカ card:<id> ⇔ supports.src_id、Pアイドル pidol:<id> ⇔ idols.src_id。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ポータルと同じ公開用の鍵（公開してよいもの。これだけでは何も読めず、ログインして連携した人だけが読める）
const SUPABASE_URL = "https://zqfvjrmkzqhcmovbaghy.supabase.co";
const SUPABASE_KEY = "sb_publishable_dhAmXIPr9jmf3drD45TtMQ_5Rror7gT";

let client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  // ログインの戻りは ?code=…（PKCE）。# はポータルからのデータの受け渡しに使っているので使わない
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true },
  });
  return client;
}

/** Discord でログインする（ページが Discord へ移り、戻り先は ?code=… 付きの所持状況ページ） */
export async function signIn(): Promise<void> {
  const { error } = await sb().auth.signInWithOAuth({
    provider: "discord",
    options: { redirectTo: `${window.location.origin}/support` },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  try {
    await sb().auth.signOut();
  } catch {
    // 通信できなくても、こちらの連携情報は消す（呼び出し側）
  }
}

/** ログイン中なら、ポータルで連携しているプレイヤー（無ければ null）。ログインしていなければ例外 */
export async function myPlayer(): Promise<{ id: number; name: string } | null> {
  const { data: s } = await sb().auth.getSession(); // ?code=… があれば、ここでログインが完了する
  const user = s.session?.user;
  if (!user) throw new Error("ログインできませんでした");
  const { data, error } = await sb()
    .from("players")
    .select("id,name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: Number(data.id), name: String(data.name) } : null;
}

/** ポータルの所持状況（スプシの id で引ける形） */
export type PortalState = {
  /** card:<id> → 凸（-1=未所持） */
  levels: Record<string, number>;
  /** pidol:<id> → 特訓・才能開花（未所持は null） */
  pIdols: Record<string, { kunren: number; kaika: number } | null>;
};

// ポータルの内部の番号 ⇔ スプシの id（push で使う）
let supportIdBySheet = new Map<number, number>();
let idolIdBySheet = new Map<number, number>();

/** ポータルから、そのプレイヤーの所持状況を読む */
export async function pull(playerId: number): Promise<PortalState> {
  const c = sb();
  const [sups, idols, sh, ih] = await Promise.all([
    c.from("supports").select("id,src_id"),
    c.from("idols").select("id,src_id"),
    c.from("support_holdings").select("support_id,totsu").eq("player_id", playerId),
    c.from("idol_holdings").select("idol_id,tokkun,kaika").eq("player_id", playerId),
  ]);
  for (const r of [sups, idols, sh, ih]) if (r.error) throw r.error;
  const supSheet = new Map<number, number>(), idolSheet = new Map<number, number>();
  supportIdBySheet = new Map();
  idolIdBySheet = new Map();
  for (const s of sups.data ?? []) if (s.src_id) { supSheet.set(Number(s.id), Number(s.src_id)); supportIdBySheet.set(Number(s.src_id), Number(s.id)); }
  for (const i of idols.data ?? []) if (i.src_id) { idolSheet.set(Number(i.id), Number(i.src_id)); idolIdBySheet.set(Number(i.src_id), Number(i.id)); }
  const state: PortalState = { levels: {}, pIdols: {} };
  for (const sheet of supportIdBySheet.keys()) state.levels[`card:${sheet}`] = -1;
  for (const sheet of idolIdBySheet.keys()) state.pIdols[`pidol:${sheet}`] = null;
  for (const h of sh.data ?? []) {
    const sheet = supSheet.get(Number(h.support_id));
    if (sheet) state.levels[`card:${sheet}`] = Number(h.totsu);
  }
  for (const h of ih.data ?? []) {
    const sheet = idolSheet.get(Number(h.idol_id));
    if (sheet) state.pIdols[`pidol:${sheet}`] = { kunren: Number(h.tokkun), kaika: Number(h.kaika) };
  }
  return state;
}

/** 変わったカードだけポータルへ書く（未所持は行を消す）。対応するカードが無いものは飛ばす */
export async function push(
  playerId: number,
  changes: { levels: Record<string, number>; pIdols: Record<string, { kunren: number; kaika: number } | null> },
): Promise<void> {
  const c = sb();
  const sheetOf = (key: string) => Number(key.split(":")[1]);
  const supUp: { player_id: number; support_id: number; totsu: number }[] = [];
  const supDel: number[] = [];
  for (const [key, lv] of Object.entries(changes.levels)) {
    const id = supportIdBySheet.get(sheetOf(key));
    if (!id) continue;
    if (lv < 0) supDel.push(id);
    else supUp.push({ player_id: playerId, support_id: id, totsu: Math.min(4, lv) });
  }
  const idolUp: { player_id: number; idol_id: number; tokkun: number; kaika: number }[] = [];
  const idolDel: number[] = [];
  for (const [key, o] of Object.entries(changes.pIdols)) {
    const id = idolIdBySheet.get(sheetOf(key));
    if (!id) continue;
    if (!o) idolDel.push(id);
    else idolUp.push({ player_id: playerId, idol_id: id, tokkun: Math.max(0, Math.min(7, o.kunren)), kaika: Math.max(0, Math.min(4, o.kaika)) });
  }
  const jobs = [];
  if (supUp.length) jobs.push(c.from("support_holdings").upsert(supUp, { onConflict: "player_id,support_id" }));
  if (supDel.length) jobs.push(c.from("support_holdings").delete().eq("player_id", playerId).in("support_id", supDel));
  if (idolUp.length) jobs.push(c.from("idol_holdings").upsert(idolUp, { onConflict: "player_id,idol_id" }));
  if (idolDel.length) jobs.push(c.from("idol_holdings").delete().eq("player_id", playerId).in("idol_id", idolDel));
  for (const r of await Promise.all(jobs)) if (r.error) throw r.error;
}

/** push の前に、ポータルの番号の対応表があるか（無ければ読み直す） */
export function needsCatalog(): boolean {
  return supportIdBySheet.size === 0 && idolIdBySheet.size === 0;
}
