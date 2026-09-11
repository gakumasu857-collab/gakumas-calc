/**
 * 所持状況まわりの「印」（ブラウザに保存）。
 * - visited: 所持状況ページを一度でも開いたか（未入力かどうかの判定に使う）
 * - ack: 「所持状況を入力せず、全サポカ完凸のまま探索する」を了承したか（初回の確認を一度だけ出す）
 */
const VISITED_KEY = "gakumas:ownership:visited:v1";
const ACK_KEY = "gakumas:setup:ownershipAck:v1";

export function readOwnershipVisited(): boolean {
  try {
    return localStorage.getItem(VISITED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markOwnershipVisited(): void {
  try {
    localStorage.setItem(VISITED_KEY, "1");
  } catch {
    /* 保存できない環境では毎回「未入力」扱い */
  }
}

export function readOwnershipAck(): boolean {
  try {
    return localStorage.getItem(ACK_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeOwnershipAck(): void {
  try {
    localStorage.setItem(ACK_KEY, "1");
  } catch {
    /* 保存できない環境では毎回聞くだけ */
  }
}

/** 所持状況を一度でも触ったか（初期値は全サポカ4凸なので、4以外があれば入力済み） */
export function ownershipCustomized(levels: Record<string, number>): boolean {
  return Object.values(levels).some((v) => v !== 4);
}
