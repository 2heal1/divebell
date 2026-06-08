import type { RuntimeSnapshot, RuntimeSnapshotTarget } from "../snapshot/types.js";
import type {
  RuntimeCondition,
  RuntimeWaitOptions,
  RuntimeWaitResult
} from "./types.js";

export class WaitManager {
  readonly #waits = new Map<number, PendingWait>();
  #nextWaitId = 1;

  waitFor(
    condition: RuntimeCondition,
    options: RuntimeWaitOptions | undefined,
    getSnapshot: () => RuntimeSnapshot
  ): Promise<RuntimeWaitResult> {
    return new Promise((resolve) => {
      const waitId = this.#nextWaitId;
      this.#nextWaitId += 1;

      const timeout = normalizeTimeout(options?.timeout);
      const timer = setTimeout(() => {
        this.#failWait(waitId, getSnapshot, "Timed out waiting for target status.");
      }, timeout);

      this.#waits.set(waitId, {
        id: waitId,
        condition: { ...condition },
        resolve,
        timer
      });
    });
  }

  resolveForTarget(targetId: string, getSnapshot: () => RuntimeSnapshot): void {
    for (const wait of this.#waits.values()) {
      if (wait.condition.id === targetId) {
        const snapshot = getSnapshot();
        const target = snapshot.targets[wait.condition.id];
        if (target?.status === wait.condition.status) {
          this.#clear(wait);
          wait.resolve(createSuccessResult(wait.condition, snapshot, target));
        }
      }
    }
  }

  rejectForTarget(targetId: string, getSnapshot: () => RuntimeSnapshot): void {
    for (const wait of this.#waits.values()) {
      if (wait.condition.id === targetId) {
        this.#failWait(wait.id, getSnapshot, "Target was unregistered.");
      }
    }
  }

  #failWait(
    waitId: number,
    getSnapshot: () => RuntimeSnapshot,
    reason: string
  ): void {
    const wait = this.#waits.get(waitId);
    if (wait === undefined) {
      return;
    }

    this.#clear(wait);
    wait.resolve({
      success: false,
      condition: wait.condition,
      snapshot: getSnapshot(),
      reason
    });
  }

  #clear(wait: PendingWait): void {
    clearTimeout(wait.timer);
    this.#waits.delete(wait.id);
  }
}

interface PendingWait {
  id: number;
  condition: RuntimeCondition;
  resolve: (result: RuntimeWaitResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

const defaultWaitTimeout = 5000;

function normalizeTimeout(timeout: number | undefined): number {
  if (timeout === undefined || !Number.isFinite(timeout) || timeout < 0) {
    return defaultWaitTimeout;
  }

  return Math.floor(timeout);
}

function createSuccessResult(
  condition: RuntimeCondition,
  snapshot: RuntimeSnapshot,
  target: RuntimeSnapshotTarget
): RuntimeWaitResult {
  return {
    success: true,
    condition,
    snapshot,
    target
  };
}
