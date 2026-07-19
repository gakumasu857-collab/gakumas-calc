import { useCallback, useEffect, useMemo, useState } from "react";
import { useSaveNotifier } from "./storeSync";

/**
 * サポカのBAN（編成除外）・固定（必ず編成に入れる）・レンタルNG（レンタル枠の候補から除外）フラグ。
 * BANと固定は同時に立たない（片方を立てるともう片方は解除）。レンタルNGは独立。
 */
const STORAGE_KEY = "gakumas:cardFlags:v1";

type Flags = { ban?: boolean; pin?: boolean; rentalNg?: boolean };
export type FlagKind = "ban" | "pin" | "rentalNg";
type FlagMap = Record<string, Flags>;

export function useCardFlags() {
  // SPAなのでlocalStorageを初期値で同期読み込みする（読み込みちらつき防止）
  const [map, setMap] = useState<FlagMap>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as FlagMap;
    } catch {
      // 破損データは無視
    }
    return {};
  });

  const notifySave = useSaveNotifier();
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
      notifySave();
    } catch {
      // 容量超過などは無視
    }
  }, [map, notifySave]);

  const toggle = useCallback((id: string, key: FlagKind) => {
    setMap((prev) => {
      const current = prev[id] ?? {};
      const next: Flags = { ...current, [key]: !current[key] };
      // BANと固定は排他
      if (next.ban && next.pin) {
        if (key === "ban") next.pin = false;
        else next.ban = false;
      }
      const result = { ...prev, [id]: next };
      if (!next.ban && !next.pin && !next.rentalNg) delete result[id];
      return result;
    });
  }, []);

  const collect = (map: FlagMap, key: FlagKind) =>
    new Set(
      Object.entries(map)
        .filter(([, f]) => f[key])
        .map(([id]) => id),
    );

  const banned = useMemo(() => collect(map, "ban"), [map]);
  const pinned = useMemo(() => collect(map, "pin"), [map]);
  const rentalNg = useMemo(() => collect(map, "rentalNg"), [map]);

  return { banned, pinned, rentalNg, toggle, loaded: true };
}
