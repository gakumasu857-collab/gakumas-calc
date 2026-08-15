/**
 * イベントカウンターの保存（編成・育成記録）。localStorage に持つ。
 *
 * 編成（チーム）はサポカ6枚の「指紋」（32x16グレースケール。Python版 cards_db と
 * 同じ考え方）で同定する。開始確認画面から読み取った6枚が保存済みの編成と
 * 一致すればそれを使い、違えば新しい編成として記録する。
 */
import { resizeArea, type GrayImage } from "./detect";
import type { ProduceRun } from "./tracker";

const TEAMS_KEY = "gakumas:eventCounterTeams:v1";
const RUNS_KEY = "gakumas:eventCounterRuns:v1";
const CURRENT_TEAM_KEY = "gakumas:eventCounterTeam:v1";
/** 記録の保持上限（古いものから消す。localStorage の容量保護） */
const MAX_RUNS = 1000;

/** 同じカードとみなす指紋の内積のしきい値（cards_db と同じ） */
const FP_THRESHOLD = 0.82;
const FP_W = 32;
const FP_H = 16;

export type Team = {
  id: string;
  /** サポカ6枚のサムネイル（dataURL） */
  thumbs: (string | null)[];
  /** サポカ6枚の名前（ユーザーが付ける。未設定は null） */
  names: (string | null)[];
  /** サポカ6枚の指紋（32x16グレーのbase64） */
  fps: (string | null)[];
  /** 読み取りの写りの良さ（これより良い読み取りが来たら差し替える） */
  quality: number;
  createdAt: number;
};

export type StoredRun = ProduceRun & { teamId: string };

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // 破損データは無視
  }
  return fallback;
}

function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 容量超過などは無視
  }
}

// ---- 指紋 ----

/** サポカ画像（グレー）→ 指紋（32x16 の輝度を 0..255 で並べた base64） */
export function fingerprint(gray: GrayImage): string {
  const small = resizeArea(gray, FP_W, FP_H);
  const bytes = new Uint8Array(FP_W * FP_H);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.max(0, Math.min(255, Math.round(small.data[i])));
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** 指紋どうしの類似度（平均を引いて正規化したベクトルの内積。1で完全一致） */
export function fpSimilarity(a: string, b: string): number {
  const va = fpVector(a);
  const vb = fpVector(b);
  if (!va || !vb) return 0;
  let dot = 0;
  for (let i = 0; i < va.length; i++) dot += va[i] * vb[i];
  return dot;
}

const fpCache = new Map<string, Float32Array | null>();

function fpVector(fp: string): Float32Array | null {
  const cached = fpCache.get(fp);
  if (cached !== undefined) return cached;
  let out: Float32Array | null = null;
  try {
    const bin = atob(fp);
    const v = new Float32Array(bin.length);
    let mean = 0;
    for (let i = 0; i < bin.length; i++) {
      v[i] = bin.charCodeAt(i);
      mean += v[i];
    }
    mean /= v.length;
    let norm = 0;
    for (let i = 0; i < v.length; i++) {
      v[i] -= mean;
      norm += v[i] * v[i];
    }
    norm = Math.sqrt(norm);
    if (norm > 1e-6) {
      for (let i = 0; i < v.length; i++) v[i] /= norm;
      out = v;
    }
  } catch {
    out = null;
  }
  fpCache.set(fp, out);
  return out;
}

// ---- 編成（チーム） ----

export function loadTeams(): Team[] {
  return loadJson<Team[]>(TEAMS_KEY, []);
}

export function saveTeams(teams: Team[]): void {
  saveJson(TEAMS_KEY, teams);
}

export function currentTeamId(): string | null {
  try {
    return localStorage.getItem(CURRENT_TEAM_KEY);
  } catch {
    return null;
  }
}

export function setCurrentTeamId(id: string | null): void {
  try {
    if (id) localStorage.setItem(CURRENT_TEAM_KEY, id);
    else localStorage.removeItem(CURRENT_TEAM_KEY);
  } catch {
    // 無視
  }
}

/** 読み取った6枚の指紋に一致する編成を探す（6枚平均の類似度がしきい値以上） */
export function matchTeam(teams: Team[], fps: (string | null)[]): Team | null {
  let best: Team | null = null;
  let bestSim = 0;
  for (const team of teams) {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < 6; i++) {
      const a = fps[i];
      const b = team.fps[i];
      if (!a || !b) continue;
      sum += fpSimilarity(a, b);
      n++;
    }
    if (n < 6) continue;
    const sim = sum / n;
    if (sim > bestSim) {
      bestSim = sim;
      best = team;
    }
  }
  return bestSim >= FP_THRESHOLD ? best : null;
}

// ---- 育成の記録 ----

export function loadRuns(): StoredRun[] {
  return loadJson<StoredRun[]>(RUNS_KEY, []);
}

export function saveRuns(runs: StoredRun[]): void {
  saveJson(RUNS_KEY, runs.slice(-MAX_RUNS));
}

/** 記録を追記または更新する（同じidがあれば置き換え） */
export function upsertRun(run: StoredRun): StoredRun[] {
  const runs = loadRuns();
  const index = runs.findIndex((r) => r.id === run.id);
  if (index >= 0) runs[index] = run;
  else runs.push(run);
  saveRuns(runs);
  return runs;
}

export function deleteRun(id: string): StoredRun[] {
  const runs = loadRuns().filter((r) => r.id !== id);
  saveRuns(runs);
  return runs;
}
