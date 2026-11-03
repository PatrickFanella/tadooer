import type { SyntheticEvent } from "react";
import type { Task } from "@suite/contracts";

/** Fields the in-place editors change without a form (issue #194). */
export interface TaskPatch {
  readonly title?: string;
  readonly notes?: string;
  readonly estimateMinutes?: number | null;
  readonly deadline?: Task["deadline"];
}

/**
 * The task callbacks `App` owns, grouped so a row, a list and the detail
 * panel take one object instead of a dozen handlers. Every member is an
 * existing `App` handler; nothing here writes on its own.
 */
export interface TaskActions {
  readonly changeStatus: (
    task: Task,
    action: "complete" | "reopen",
  ) => Promise<boolean>;
  readonly editTask: (task: Task, patch: TaskPatch) => Promise<void>;
  readonly startFocus: (task: Task) => void;
  readonly submitTimeBlock: (
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
    task: Task,
  ) => Promise<void>;
  readonly removeTimeBlock: (task: Task) => Promise<void>;
  readonly saveAsTemplate: (task: Task) => Promise<void>;
  /** Moves a top-level task and its children to History; online only. */
  readonly archive?: ((task: Task) => Promise<void>) | undefined;
  readonly remove: (task: Task) => Promise<void>;
  readonly createChildTask: (parent: Task, title: string) => Promise<void>;
  readonly moveTask: (
    task: Task,
    parentId: string | null,
    index: number | null,
  ) => Promise<void>;
}
