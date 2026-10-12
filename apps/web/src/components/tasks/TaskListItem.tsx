import type { SyntheticEvent } from "react";
import type {
  ActiveSession,
  BaikalStatusResponse,
  Task,
} from "@suite/contracts";
import { Field } from "../../field.tsx";
import { TimeBlockForm } from "../../time-block-form.tsx";
import { Badge } from "../ui/badge.tsx";
import { Button } from "../ui/button.tsx";
import { Input } from "../ui/input.tsx";
import { DeadlineFields } from "./DeadlineFields.tsx";
import {
  TaskChildrenSection,
  type TaskHierarchyActions,
} from "./TaskHierarchy.tsx";

export type TaskListItemState =
  "overdue" | "scheduled" | "planned-day" | "planning" | "completed";

interface TaskListItemProps {
  readonly task: Task;
  readonly state: TaskListItemState;
  readonly at: string;
  readonly timeZone: string;
  readonly activeSession: ActiveSession | null;
  readonly calendars: BaikalStatusResponse["calendars"];
  readonly busy: boolean;
  readonly calendarActionsAvailable: boolean;
  readonly focusActionsAvailable: boolean;
  readonly onStartFocus: (task: Task) => void;
  readonly onChangeTaskStatus: (
    task: Task,
    action: "complete" | "reopen",
  ) => Promise<void>;
  readonly onSubmitTimeBlock: (
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
    task: Task,
  ) => Promise<void>;
  readonly onRemoveTimeBlock: (task: Task) => Promise<void>;
  /** ADR 0027: move controls for a saved day order. */
  readonly moveControls?:
    | {
        readonly canMoveUp: boolean;
        readonly canMoveDown: boolean;
        readonly onMove: (direction: -1 | 1) => void;
      }
    | undefined;
  /**
   * Issue #170: inline edit of title, notes, estimate and deadline. The
   * write queues through the outbox like the Tasks page editor.
   */
  readonly onSubmitTaskEdit?:
    | ((
        event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
        task: Task,
      ) => Promise<void>)
    | undefined;
  /** Active child tasks (ADR 0018), shown under the row in a disclosure. */
  readonly childTasks?: readonly Task[] | undefined;
  readonly onCreateChildTask?:
    TaskHierarchyActions["onCreateChildTask"] | undefined;
}

const taskTime = (value: string, timeZone: string): string =>
  new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));

export const TaskListItem = ({
  task,
  state,
  at,
  timeZone,
  activeSession,
  calendars,
  busy,
  calendarActionsAvailable,
  focusActionsAvailable,
  onStartFocus,
  onChangeTaskStatus,
  onSubmitTimeBlock,
  onRemoveTimeBlock,
  moveControls,
  onSubmitTaskEdit,
  childTasks,
  onCreateChildTask,
}: TaskListItemProps) => {
  const hasNonterminalFocus =
    activeSession !== null &&
    activeSession.state !== "completed" &&
    activeSession.state !== "expired";
  const focusRunning = hasNonterminalFocus && activeSession.taskId === task.id;
  const focusBlocked = hasNonterminalFocus && activeSession.taskId !== task.id;
  const scheduleLabel =
    task.plannedStart === null
      ? `Schedule “${task.title}”`
      : `Change schedule for “${task.title}”`;

  const children =
    state !== "completed" &&
    task.parentId == null &&
    childTasks !== undefined &&
    (childTasks.length > 0 || onCreateChildTask !== undefined)
      ? childTasks
      : undefined;
  const openChildren =
    children?.filter((child) => child.status === "open").length ?? 0;

  return (
    <li className="today-task-row" data-task-id={task.id}>
      <div className="today-task-main">
        <div>
          <strong>{task.title}</strong>
          <p className="today-task-meta">
            {state === "overdue"
              ? task.plannedStart == null && task.plannedDay != null
                ? `Overdue · planned for ${task.plannedDay}`
                : "Overdue"
              : state === "planned-day"
                ? "Today · no time set"
                : state === "planning" || state === "completed"
                  ? "No time set"
                  : taskTime(task.plannedStart ?? at, timeZone)}
            {task.estimateMinutes === null
              ? ""
              : ` · ${String(task.estimateMinutes)} min`}
          </p>
        </div>
        <div className="today-task-actions">
          {moveControls === undefined ? null : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy || !moveControls.canMoveUp}
                aria-label={`Move “${task.title}” up`}
                onClick={() => moveControls.onMove(-1)}
              >
                Up
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy || !moveControls.canMoveDown}
                aria-label={`Move “${task.title}” down`}
                onClick={() => moveControls.onMove(1)}
              >
                Down
              </Button>
            </>
          )}
          <Button
            type="button"
            disabled={busy}
            aria-label={`${task.status === "completed" ? "Reopen" : "Complete"} “${task.title}”`}
            onClick={() =>
              void onChangeTaskStatus(
                task,
                task.status === "completed" ? "reopen" : "complete",
              )
            }
          >
            {task.status === "completed" ? "Reopen" : "Complete"}
          </Button>
          {state === "completed" ? null : focusRunning ? (
            <Badge variant="now">Focus running</Badge>
          ) : (
            <Button
              type="button"
              disabled={busy || !focusActionsAvailable || focusBlocked}
              aria-label={`Start focus on “${task.title}”`}
              onClick={() => onStartFocus(task)}
            >
              Start focus
            </Button>
          )}
          {state === "completed" ? null : !focusActionsAvailable ? (
            <span className="hint">Reconnect to start focus.</span>
          ) : null}
          {state === "completed" ? null : (
            <details>
              <summary aria-label={scheduleLabel}>
                {task.plannedStart === null ? "Schedule" : "Change schedule"}
              </summary>
              <TimeBlockForm
                task={task}
                calendars={calendars}
                busy={busy}
                available={calendarActionsAvailable}
                onSubmit={onSubmitTimeBlock}
                onRemove={onRemoveTimeBlock}
              />
            </details>
          )}
          {state === "completed" || onSubmitTaskEdit === undefined ? null : (
            <details className="today-task-edit">
              <summary aria-label={`Edit “${task.title}”`}>Edit</summary>
              <form
                className="task-edit"
                aria-label={`Edit “${task.title}”`}
                onSubmit={(event) => void onSubmitTaskEdit(event, task)}
              >
                <Field
                  label="Title"
                  name="title"
                  autoComplete="off"
                  defaultValue={task.title}
                />
                <Field
                  label="Notes"
                  name="notes"
                  autoComplete="off"
                  defaultValue={task.notes}
                  required={false}
                />
                <label className="field">
                  <span>Estimate minutes</span>
                  <Input
                    name="estimateMinutes"
                    type="number"
                    min="1"
                    max="720"
                    defaultValue={task.estimateMinutes ?? ""}
                  />
                </label>
                <DeadlineFields
                  key={JSON.stringify(task.deadline)}
                  deadline={task.deadline}
                />
                <Button disabled={busy}>Save task</Button>
              </form>
            </details>
          )}
        </div>
      </div>
      {children !== undefined && (
        <details className="today-task-children">
          <summary aria-label={`Child tasks of “${task.title}”`}>
            {children.length === 0
              ? "Add child tasks"
              : `${String(openChildren)} of ${String(children.length)} child ${children.length === 1 ? "task" : "tasks"} open`}
          </summary>
          <TaskChildrenSection
            parent={task}
            items={children}
            busy={busy}
            renderChild={(child) => (
              <li
                key={child.id}
                className={
                  child.status === "completed"
                    ? "today-child today-child--done"
                    : "today-child"
                }
              >
                <span>{child.title}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  aria-label={`${child.status === "completed" ? "Reopen" : "Complete"} “${child.title}”`}
                  onClick={() =>
                    void onChangeTaskStatus(
                      child,
                      child.status === "completed" ? "reopen" : "complete",
                    )
                  }
                >
                  {child.status === "completed" ? "Reopen" : "Done"}
                </Button>
              </li>
            )}
            onCreateChildTask={
              onCreateChildTask ??
              (() =>
                Promise.reject(new Error("Child tasks are read-only here")))
            }
          />
        </details>
      )}
    </li>
  );
};
