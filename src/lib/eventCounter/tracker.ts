/**
 * 育成1回分の進み具合を追いかける（Python版 gakumas_event_counter/tracker.py の移植）。
 *
 * 画面の判定結果（detect.ts analyzeFrame）を1クロックずつ受け取って、
 * 「今が何ターン目か」「イベントが起きたか」「どの種類か」を決める。
 * しきい値・時間窓・状態遷移は Python 版と同一。
 *
 * ■ イベントの種類
 *   イベントシーン（中央にサポカの絵）が出たら、
 *     直前にスケジュール選択画面があった → 前イベ
 *     イベントの後にスキルカードが出た   → 後イベ
 *     どちらでもない                     → ステイベ
 */
import { sameDayNumber, type AnalyzeResult } from "./detect";

export const PRE = "pre";
export const POST = "post";
export const STATUS = "status";
export const PENDING = "pending";
export type EventKind = typeof PRE | typeof POST | typeof STATUS;
export type EventKindOrPending = EventKind | typeof PENDING;

export const EVENT_LABELS: Record<string, string> = {
  [PRE]: "前イベ",
  [POST]: "後イベ",
  [STATUS]: "ステイベ",
  [PENDING]: "判定中",
};
export const KINDS_ORDER: EventKind[] = [PRE, POST, STATUS];

/** 育成の種別（選抜と本戦は別々の育成として記録する） */
export const QUALIFIER = "qualifier";
export const FINALS = "finals";
export type Stage = typeof QUALIFIER | typeof FINALS | null;
export const STAGE_LABELS: Record<string, string> = {
  [QUALIFIER]: "選抜",
  [FINALS]: "本戦",
};

export type EventRecord = {
  card: number | null;
  kind: EventKindOrPending;
  turn: number;
  time: number;
  score: number;
  /** 手動で記録したものか */
  manual?: boolean;
};

export type ProduceRun = {
  id: string;
  started: number;
  ended: number | null;
  completed: boolean;
  turns: number;
  events: EventRecord[];
  stage: Stage;
  prevRunId: string | null;
};

export function newRun(started: number, stage: Stage): ProduceRun {
  return {
    id: crypto.randomUUID().replace(/-/g, "").slice(0, 12),
    started,
    ended: null,
    completed: false,
    turns: 0,
    events: [],
    stage,
    prevRunId: null,
  };
}

export const TRACKER_SETTINGS = {
  /** スケジュール画面を見てから何秒以内のイベントを「前イベ」とみなすか */
  preWindow: 8.0,
  /** イベントシーンが終わってから何秒スキルカードを待つか */
  postWindow: 15.0,
  /** 同じイベントを二重に数えないための間隔（秒） */
  eventMergeWindow: 4.0,
  /** 画面が変わったと認めるまでに必要な連続一致回数（ちらつき対策） */
  stableFrames: 2,
  /** 日数の数字が変わったと認めるまでに必要な連続一致回数 */
  dayStableFrames: 3,
  /** 「突破ライン」が見えなくなってから、試験が終わったとみなすまでの秒数 */
  examExit: 15.0,
  /** スケジュール画面に戻ってから、ステイベと確定するまでの秒数 */
  scheduleSettle: 3.5,
};

/** tracker が読む判定結果（AnalyzeResult のうち使う部分） */
export type TrackerInput = Pick<
  AnalyzeResult,
  "screen" | "exam" | "examStrong" | "dayMask" | "eventCard" | "eventScore" | "skillCard"
>;

type Pending = {
  record: EventRecord;
  deadline: number | null;
  pre: boolean;
};

export type TrackerCallbacks = {
  /** イベント確定時 */
  onEvent?: (record: EventRecord) => void;
  /** 育成終了時（完了・中断どちらも） */
  onRunFinished?: (run: ProduceRun) => void;
  /** 育成開始時（開始確認画面を検出） */
  onRunStarted?: () => void;
  /**
   * 開始確認画面を通らずに育成が始まった時（中断の続き・本戦）。
   * 続きにする記録を返すとそれに追記する。{ prevRunId } だけ返すと
   * 引き継ぎ元と結びつけた新しい本戦の記録を作る。null なら新しく作る。
   */
  onRunResume?: () => ProduceRun | { prevRunId: string | null } | null;
  /** 記録が変化した時（保存用） */
  onChanged?: () => void;
};

export class RunTracker {
  run: ProduceRun | null = null;
  paused = false;
  inExam = false;

  private cb: TrackerCallbacks;
  private screen = "other";
  private screenSince = 0;
  private candidate: string | null = null;
  private candidateCount = 0;
  private lastScheduleSeen = 0;
  private lastEventTime = 0;
  private lastEventCard: number | null = null;
  private pending: Pending | null = null;
  private eventBest: [number | null, number] | null = null;
  private dayNumber: Uint8Array | null = null;
  private dayCandidate: Uint8Array | null = null;
  private dayCandidateCount = 0;
  private skipNextDayCount = false;
  private lastTurnCountTime = 0;
  private examCount = 0;
  private examTurnCounted = false;
  private lastExamSeen = 0;

  constructor(cb: TrackerCallbacks = {}) {
    this.cb = cb;
  }

  /** 1クロックごとに呼ぶ。戻り値は画面に出すお知らせ */
  update(result: TrackerInput, now: number): string[] {
    let messages: string[] = [];

    // --- 試験中かどうかの出入り ---
    messages = messages.concat(this.updateExam(result, now));

    if (this.paused || this.inExam) {
      // 何も数えない。再開した時に「画面が急に変わった」と誤解しないよう、
      // 画面の記憶だけは今の状態に合わせておく
      this.screen = result.screen ?? "other";
      this.candidate = null;
      this.candidateCount = 0;
      return messages;
    }

    // --- ターン数（左上の数字が変わったか）。育成の再開もここで判定する ---
    messages = messages.concat(this.updateTurn(result, now));

    const screen = result.screen ?? "other";

    // --- ちらつき対策: 同じ画面が続けて見えたら「変わった」と認める ---
    if (screen !== this.screen) {
      if (screen === this.candidate) {
        this.candidateCount++;
      } else {
        this.candidate = screen;
        this.candidateCount = 1;
      }
      if (this.candidateCount >= TRACKER_SETTINGS.stableFrames) {
        const previous = this.screen;
        this.screen = screen;
        this.screenSince = now;
        this.candidateCount = 0;
        messages = messages.concat(
          this.onScreenChanged(previous, screen, result, now),
        );
      }
    } else {
      this.candidate = null;
      this.candidateCount = 0;
    }

    // --- 画面が続いている間の処理 ---
    if (this.screen === "schedule") {
      this.lastScheduleSeen = now;
    } else if (this.screen === "event") {
      // イベントシーンの間で一番よく一致したサポカを覚えておく
      const score = result.eventScore ?? 0;
      if (!this.eventBest || score > this.eventBest[1]) {
        this.eventBest = [result.eventCard ?? null, score];
      }
    }

    // --- 後イベ待ち（スキルカードが出るか） ---
    if (this.pending) {
      const deadline = this.pending.deadline;
      if (this.screen !== "event" && result.skillCard) {
        messages = messages.concat(this.settlePending(POST, now));
      } else if (deadline !== null && now >= deadline) {
        messages = messages.concat(this.settlePending(STATUS, now));
      } else if (
        deadline !== null &&
        this.screen === "schedule" &&
        now - this.screenSince >= TRACKER_SETTINGS.scheduleSettle
      ) {
        // スケジュール画面に戻ってしばらくたった = スキルカードはもう来ない
        messages = messages.concat(this.settlePending(STATUS, now));
      }
    }

    return messages;
  }

  // ------------------------------------------------------------------
  // 試験中の出入り
  // ------------------------------------------------------------------

  private updateExam(result: TrackerInput, now: number): string[] {
    if (result.exam) this.lastExamSeen = now;
    if (!this.inExam) {
      // 「入る」のは、突破ラインがはっきり2フレーム続けて見えた時だけ
      if (result.examStrong) {
        this.examCount++;
      } else {
        this.examCount = 0;
        return [];
      }
      if (this.examCount < TRACKER_SETTINGS.stableFrames) return [];
      this.inExam = true;
      this.examCount = 0;
      const messages = this.pending ? this.settlePending(STATUS, now) : [];
      // 試験も1ターンとして数える（試験の日には日数表示が出ないため）。
      // 出たり入ったりしても、次の日数が変わるまでは二重に数えない
      if (this.run !== null && !this.examTurnCounted) {
        this.examTurnCounted = true;
        this.run.turns++;
        this.lastTurnCountTime = now;
        this.cb.onChanged?.();
      }
      return messages;
    }
    if (result.dayMask !== null) {
      this.inExam = false;
      return [];
    }
    if (now - this.lastExamSeen > TRACKER_SETTINGS.examExit) {
      this.inExam = false; // 様子見の再開
    }
    return [];
  }

  // ------------------------------------------------------------------
  // ターン数（左上の日数表示）と、育成の途中からの再開
  // ------------------------------------------------------------------

  private updateTurn(result: TrackerInput, now: number): string[] {
    const number = result.dayMask;
    if (number === null) {
      this.dayCandidate = null;
      this.dayCandidateCount = 0;
      return [];
    }

    if (sameDayNumber(number, this.dayNumber)) {
      this.dayCandidate = null;
      this.dayCandidateCount = 0;
      return [];
    }

    // ターンを数えた直後の5秒間は、数字の変化を受け付けない
    // （表示アニメーションの揺れで二重に数えないため）
    if (now - this.lastTurnCountTime < 5.0) {
      this.dayCandidate = null;
      this.dayCandidateCount = 0;
      return [];
    }

    // 数字が変わって見える。読み取りのブレではないか、何回か確かめる
    if (sameDayNumber(number, this.dayCandidate)) {
      this.dayCandidateCount++;
    } else {
      this.dayCandidate = number;
      this.dayCandidateCount = 1;
    }
    if (this.dayCandidateCount < TRACKER_SETTINGS.dayStableFrames) return [];

    this.dayNumber = this.dayCandidate;
    this.dayCandidate = null;
    this.dayCandidateCount = 0;
    this.lastTurnCountTime = now;

    let messages: string[] = [];
    if (this.run === null) {
      // 日数表示が見えているのに育成の記録が無い
      // = 中断からの再開、または本戦の始まり（開始確認画面を通らない）
      messages = messages.concat(this.autoResume(now));
    }
    if (this.run !== null) {
      this.examTurnCounted = false; // 次の試験はまた1ターンとして数える
      if (this.skipNextDayCount) {
        // 中断した時と同じターンから再開したので、この1回は数えない
        this.skipNextDayCount = false;
      } else {
        this.run.turns++;
        this.cb.onChanged?.();
        // 次のターンに入った = 前のイベントの判定はもう確定してよい
        if (this.pending && this.pending.deadline !== null) {
          messages = messages.concat(this.settlePending(STATUS, now));
        }
      }
    }
    return messages;
  }

  private autoResume(now: number): string[] {
    const data = this.cb.onRunResume?.() ?? null;
    const asRun = data && "id" in data ? (data as ProduceRun) : null;
    if (asRun && asRun.id) {
      // 中断していた記録の続き
      this.run = { ...asRun, ended: null, completed: false };
      this.skipNextDayCount = true;
      const stage = this.run.stage ? (STAGE_LABELS[this.run.stage] ?? "?") : "?";
      this.cb.onChanged?.();
      return [
        `中断していた${stage}の続きとして記録します（${this.run.turns}日目から。違う場合は「今の育成を捨てる」で消せます）`,
      ];
    }
    // 新しい本戦（開始確認画面を通らない）
    this.run = newRun(now, FINALS);
    if (data && "prevRunId" in data) this.run.prevRunId = data.prevRunId;
    this.skipNextDayCount = false;
    this.lastScheduleSeen = 0;
    this.lastEventTime = 0;
    this.pending = null;
    this.cb.onChanged?.();
    return ["本戦の記録を始めます"];
  }

  // ------------------------------------------------------------------
  // 画面が変わったとき
  // ------------------------------------------------------------------

  private onScreenChanged(
    previous: string,
    screen: string,
    result: TrackerInput,
    now: number,
  ): string[] {
    let messages: string[] = [];

    // イベントシーンが終わった → 種類の判定を始める
    if (previous === "event") {
      messages = messages.concat(this.finishEventScene(now));
    }

    if (screen === "start") {
      messages = messages.concat(this.startRun(now));
    } else if (screen === "event") {
      messages = messages.concat(this.beginEventScene(result, now));
    } else if (screen === "done") {
      // 「プロデュース完了」の画面。選抜も本戦も、終わるとこれが出る
      messages = messages.concat(this.finishRun(now, true));
    } else if (screen === "end") {
      // 完了を見ないままホーム画面に戻った = 中断
      messages = messages.concat(this.finishRun(now, false));
    }
    return messages;
  }

  // ------------------------------------------------------------------
  // 育成の開始・終了
  // ------------------------------------------------------------------

  private startRun(now: number): string[] {
    if (this.run !== null && !this.run.completed) {
      // 前の育成を見届けないまま次が始まった → 未確認として閉じる
      this.finishRun(now, false);
    }
    this.cb.onRunStarted?.();
    // 開始確認画面から始まる育成は選抜（本戦はこの画面を通らない）
    this.run = newRun(now, QUALIFIER);
    this.lastScheduleSeen = 0;
    this.lastEventTime = 0;
    this.pending = null;
    this.dayNumber = null;
    this.dayCandidate = null;
    this.dayCandidateCount = 0;
    this.skipNextDayCount = false;
    this.examTurnCounted = false;
    this.cb.onChanged?.();
    return ["育成の開始を検出しました（サポカを読み取りました）"];
  }

  private finishRun(now: number, completed: boolean): string[] {
    if (this.run === null) return [];
    // 判定待ちのイベントがあれば、ステイベとして閉じる
    if (this.pending) this.settlePending(STATUS, now);
    this.run.ended = now;
    this.run.completed = completed;
    const finished = this.run;
    this.run = null;
    this.inExam = false;
    this.dayNumber = null;
    this.dayCandidate = null;
    this.dayCandidateCount = 0;
    this.skipNextDayCount = false;
    this.examTurnCounted = false;
    this.cb.onRunFinished?.(finished);
    if (completed) {
      return [
        `育成が終了しました（全${finished.turns}日 / イベント${finished.events.length}件）`,
      ];
    }
    return [
      `中断を検出したので、ここまでを保存しました（${finished.turns}日目まで見ていたデータとして統計に入ります。再開したら続きから記録します）`,
    ];
  }

  /** 手動で今の育成を閉じる */
  forceFinish(now: number, completed = false): string[] {
    return this.finishRun(now, completed);
  }

  /** 今の育成を捨てる（記録に残さない） */
  dropRun(): void {
    this.run = null;
    this.pending = null;
    this.inExam = false;
    this.dayNumber = null;
    this.dayCandidate = null;
    this.dayCandidateCount = 0;
  }

  /** 手動記録用: 育成が無ければ種別不明の育成を立ち上げる */
  ensureManualRun(now: number): boolean {
    if (this.run !== null) return false;
    this.run = newRun(now, null);
    this.cb.onChanged?.();
    return true;
  }

  setPaused(paused: boolean, now: number): string[] {
    this.paused = paused;
    if (this.paused && this.pending) this.settlePending(STATUS, now);
    return [this.paused ? "記録を手動で止めました" : "記録を再開しました"];
  }

  stateLabel(): string {
    if (this.paused) return "手動で停止中";
    if (this.inExam) return "試験中（自動で停止）";
    return "記録中";
  }

  // ------------------------------------------------------------------
  // イベント
  // ------------------------------------------------------------------

  private beginEventScene(result: TrackerInput, now: number): string[] {
    if (this.run === null) return [];
    const card = result.eventCard ?? null;
    // 同じイベントを二重に数えない
    if (
      card === this.lastEventCard &&
      now - this.lastEventTime < TRACKER_SETTINGS.eventMergeWindow
    ) {
      return [];
    }
    this.lastEventCard = card;
    this.lastEventTime = now;
    this.eventBest = [card, result.eventScore ?? 0];

    const record: EventRecord = {
      card,
      kind: PENDING,
      turn: this.run.turns,
      time: now,
      score: Math.round((result.eventScore ?? 0) * 10000) / 10000,
    };
    this.run.events.push(record);
    this.pending = { record, deadline: null, pre: false };
    // 直前にスケジュール画面があったか
    if (now - this.lastScheduleSeen <= TRACKER_SETTINGS.preWindow) {
      this.pending.pre = true;
    }
    this.cb.onChanged?.();
    return [];
  }

  private finishEventScene(now: number): string[] {
    if (!this.pending) return [];
    const record = this.pending.record;
    // イベント中に一番よく一致したサポカで上書きする
    if (this.eventBest && this.eventBest[0] !== null) {
      record.card = this.eventBest[0];
      record.score = Math.round(this.eventBest[1] * 10000) / 10000;
    }
    this.eventBest = null;
    if (this.pending.pre) {
      return this.settlePending(PRE, now);
    }
    this.pending.deadline = now + TRACKER_SETTINGS.postWindow;
    return [];
  }

  private settlePending(kind: EventKind, now: number): string[] {
    void now;
    if (!this.pending) return [];
    const record = this.pending.record;
    record.kind = kind;
    this.pending = null;
    const cardNo = record.card !== null ? record.card + 1 : "?";
    this.cb.onEvent?.(record);
    this.cb.onChanged?.();
    return [
      `${EVENT_LABELS[kind]}を記録しました（サポカ${cardNo} / ${record.turn}日目）`,
    ];
  }
}
