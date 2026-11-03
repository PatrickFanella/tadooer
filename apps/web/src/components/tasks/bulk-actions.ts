import type { Task } from "@suite/contracts";

export interface BulkResult {
  readonly done: number;
  readonly failed: Task | null;
  /** Null when every task changed; otherwise one sentence for the owner. */
  readonly message: string | null;
}

const messageFor = (error: unknown): string =>
  error instanceof Error ? error.message : "the change was refused";

/**
 * Runs one change over the selected tasks in order and stops at the first
 * failure (issue #194). The caller syncs once afterwards; a stop leaves the
 * remaining tasks untouched and selected.
 */
export const runBulk = async (
  tasks: readonly Task[],
  run: (task: Task) => Promise<boolean | undefined>,
): Promise<BulkResult> => {
  let done = 0;
  for (const task of tasks) {
    try {
      const outcome = await run(task);
      if (outcome === false) return failure(tasks, done, task, null);
      done += 1;
    } catch (error: unknown) {
      return failure(tasks, done, task, messageFor(error));
    }
  }
  return { done, failed: null, message: null };
};

const failure = (
  tasks: readonly Task[],
  done: number,
  failed: Task,
  reason: string | null,
): BulkResult => ({
  done,
  failed,
  message: `Changed ${String(done)} of ${String(tasks.length)}. “${failed.title}” did not change${reason === null ? "." : `: ${reason}`}`,
});
