/**
 * localStorageストアの更新をページ内の他コンポーネント（ステータスバー等）へ通知する仕組み。
 * 各ストアは保存時に useSaveNotifier() 経由で通知し、購読側は useStoreVersion() の
 * 返り値を key に使って再マウント（＝localStorageの再読込）する。
 */
import { useCallback, useEffect, useRef, useState } from "react";

const EVENT_NAME = "gakumas:store";

export function notifyStoreChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENT_NAME));
  }
}

/**
 * 保存effect用の通知関数。初回（localStorage読み込み直後に同じ値を保存し直すだけの回）は
 * 通知をスキップする。これが無いと「マウント→読込→保存→通知→再マウント→…」の
 * 無限再マウントループになる（version をキーにしたコンポーネントが500msごとにリロードされる）。
 */
export function useSaveNotifier(): () => void {
  const first = useRef(true);
  return useCallback(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    notifyStoreChange();
  }, []);
}

/** ストアが更新されるたびに増えるバージョン番号（少し間引いて通知） */
export function useStoreVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handler = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        setVersion((v) => v + 1);
      }, 500);
    };
    window.addEventListener(EVENT_NAME, handler);
    return () => {
      window.removeEventListener(EVENT_NAME, handler);
      if (timer) clearTimeout(timer);
    };
  }, []);
  return version;
}
