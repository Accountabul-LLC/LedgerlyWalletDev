import type { ApprovalRequest } from '../rpc/protocol';

export interface ApprovalOutcome {
  readonly approved: boolean;
  readonly accountIds?: readonly string[];
}

interface PendingEntry {
  readonly request: ApprovalRequest;
  readonly settle: (outcome: ApprovalOutcome) => void;
  readonly fail: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

/** A prompt left unanswered this long is treated as declined. */
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * A site that can queue unlimited prompts can bury a malicious one in noise, or
 * make the wallet unusable until it is reinstalled. Three outstanding requests
 * is more than any honest flow needs.
 */
const MAX_PENDING_PER_ORIGIN = 3;

export class ApprovalRejected extends Error {
  constructor(message = 'The request was declined.') {
    super(message);
    this.name = 'ApprovalRejected';
  }
}

/**
 * Holds requests that are waiting on a human.
 *
 * Every path out of this queue is explicit: approve, decline, time out, or the
 * wallet locking. There is no default-allow, and no request resolves without
 * passing through `resolve`.
 */
export class ApprovalQueue {
  private pending = new Map<string, PendingEntry>();
  private listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  get size(): number {
    return this.pending.size;
  }

  list(): ApprovalRequest[] {
    return [...this.pending.values()]
      .map((entry) => entry.request)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  get(id: string): ApprovalRequest | undefined {
    return this.pending.get(id)?.request;
  }

  enqueue(request: ApprovalRequest): Promise<ApprovalOutcome> {
    const forOrigin = [...this.pending.values()].filter(
      (entry) => entry.request.origin === request.origin,
    ).length;
    if (forOrigin >= MAX_PENDING_PER_ORIGIN) {
      return Promise.reject(
        new ApprovalRejected('This site already has too many pending requests.'),
      );
    }

    return new Promise<ApprovalOutcome>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        this.emit();
        reject(new ApprovalRejected('The request timed out without a response.'));
      }, APPROVAL_TIMEOUT_MS);

      this.pending.set(request.id, { request, settle: resolve, fail: reject, timer });
      this.emit();
    });
  }

  resolve(id: string, outcome: ApprovalOutcome): boolean {
    const entry = this.pending.get(id);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.pending.delete(id);
    this.emit();
    if (outcome.approved) {
      entry.settle(outcome);
    } else {
      entry.fail(new ApprovalRejected());
    }
    return true;
  }

  /** Locking the wallet declines everything outstanding rather than leaving prompts live. */
  rejectAll(reason: string): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.fail(new ApprovalRejected(reason));
    }
    this.pending.clear();
    this.emit();
  }

  rejectForOrigin(origin: string, reason: string): void {
    for (const [id, entry] of this.pending) {
      if (entry.request.origin !== origin) continue;
      clearTimeout(entry.timer);
      this.pending.delete(id);
      entry.fail(new ApprovalRejected(reason));
    }
    this.emit();
  }
}
