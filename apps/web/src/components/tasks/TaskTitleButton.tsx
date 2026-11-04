import type { ReactNode } from "react";
import type { Task } from "@suite/contracts";

/**
 * Issue #196: a task title outside the task lists (Planner day order, the
 * unplanned drawer, board panels) that opens the task in the detail panel.
 * Without `onSelect` the title stays plain text.
 */
export const TaskTitleButton = ({
  task,
  onSelect,
  children,
}: {
  readonly task: Task;
  readonly onSelect: ((task: Task) => void) | undefined;
  readonly children: ReactNode;
}) =>
  onSelect === undefined ? (
    children
  ) : (
    <button
      type="button"
      className="task-title-button"
      aria-label={`Open details for “${task.title}”`}
      onClick={() => onSelect(task)}
    >
      {children}
    </button>
  );
