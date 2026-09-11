/**
 * 「所持状況を入力せず、全サポカ完凸のまま探索する」を了承した印（ブラウザに保存）。
 * 初回の探索前の確認モーダルを一度だけ出すために使う。
 */
const ACK_KEY = "gakumas:setup:ownershipAck:v1";

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
