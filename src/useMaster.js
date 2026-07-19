/**
 * R2 由来のマスタ JSON を読む React フック。
 * フロントはスプレッドシートを直接読まず、必ず /api/master 経由で取得する。
 *
 * 注意: `npm run dev`（vite）では Pages Functions が動かないため /api/master は 404 になる。
 * ローカルで API まで確認するときは `npm run build && npx wrangler pages dev dist` を使う。
 */
import { useEffect, useState } from "react";

const INITIAL = { data: null, loading: true, error: null };

/** 指定URLのJSONを取得する共通フック（アンマウント後の setState はしない） */
function useFetchJson(url) {
  const [state, setState] = useState(INITIAL);
  useEffect(() => {
    let alive = true;
    setState(INITIAL);
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (alive) setState({ data, loading: false, error: null });
      })
      .catch((error) => {
        if (alive) setState({ data: null, loading: false, error });
      });
    return () => {
      alive = false;
    };
  }, [url]);
  return state;
}

/**
 * 単一マスタを取得する。
 * @param {string} name タブ名（例: "supMaster"）
 * @returns {{data: Array<Record<string, unknown>>|null, loading: boolean, error: Error|null}}
 */
export function useMaster(name) {
  return useFetchJson(`/api/master?name=${encodeURIComponent(name)}`);
}

/**
 * 利用可能なマスタの一覧を取得する。
 * @returns {{data: {tabs: string[], updatedAt: string}|null, loading: boolean, error: Error|null}}
 */
export function useMasterIndex() {
  return useFetchJson("/api/master");
}
