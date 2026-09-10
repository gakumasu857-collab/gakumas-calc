/**
 * localStorage ストアの保存通知。
 * 各ストアは保存時に useSaveNotifier() を呼ぶ。現在は購読側が無い（以前は画面下の
 * ステータスバーが再読込に使っていた）が、保存イベントを window に流す仕組みは残してある。
 */
import { useCallback, useRef } from "react";

const EVENT_NAME = "gakumas:store";

export function notifyStoreChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENT_NAME));
  }
}

/**
 * 保存effect用の通知関数。初回（localStorage読み込み直後に同じ値を保存し直すだけの回）は
 * 通知をスキップする。
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
