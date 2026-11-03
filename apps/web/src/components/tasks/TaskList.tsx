import { useEffect, type ReactNode } from "react";
import type {
  ActiveSession,
  BaikalStatusResponse,
  Project,
  Tag,
  Task,
} from "@suite/contracts";
import type { TaskActions } from "./task-actions.ts";
import {
  TaskRow,
  type ListSelectionProps,
  type TaskListItemState,
} from "./TaskRow.tsx";

/** Everything a list needs to render rows (issue #194), built once per page. */
export interface TaskListContext {
  readonly at: string;
  readonly timeZone: string;
  readonly today: string;
  readonly projects: readonly Project[];
  readonly tags: readonly Tag[];
  readonly activeSession: ActiveSession | null;
  readonly calendars: BaikalStatusResponse["calendars"];
  readonly busy: boolean;
  readonly calendarActionsAvailable: boolean;
  readonly focusActionsAvailable: boolean;
  readonly actions: TaskActions;
  readonly list: ListSelectionProps;
}

export const focusStateFor = (
  session: ActiveSession | null,
  taskId: string,
): "idle" | "running" | "blocked" => {
  if (
    session === null ||
    session.state === "completed" ||
    session.state === "expired"
  )
    return "idle";
  return session.taskId === taskId ? "running" : "blocked";
};

/** Row ids in display order: each top-level task, then its listed children. */
export const visibleOrder = (
  groups: readonly (readonly Task[])[],
  childrenByParent: ReadonlyMap<string, readonly Task[]>,
): readonly string[] =>
  groups.flatMap((group) =>
    group.flatMap((task) => [
      task.id,
      ...(task.parentId == null
        ? (childrenByParent.get(task.id) ?? []).map(({ id }) => id)
        : []),
    ]),
  );

/** Reports the visible order to `App` whenever it changes. */
export const useVisibleOrder = (
  ids: readonly string[],
  onChange: (ids: readonly string[]) => void,
): void => {
  const key = ids.join("\u0000");
  useEffect(() => {
    onChange(key === "" ? [] : key.split("\u0000"));
    // The joined key is the identity of the order; the callback is stable
    // for the page's lifetime.
  }, [key]);
};

export interface MoveControls {
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly onMove: (direction: -1 | 1) => void;
}

interface TaskRowsProps {
  readonly tasks: readonly Task[];
  readonly childrenByParent: ReadonlyMap<string, readonly Task[]>;
  readonly stateOf: (task: Task) => TaskListItemState;
  readonly context: TaskListContext;
  readonly moveControlsFor?:
    ((task: Task) => MoveControls | undefined) | undefined;
  readonly label: string;
  readonly children?: ReactNode;
}

/** An accessible list of rows with children nested under their parents. */
export const TaskRows = ({
  tasks,
  childrenByParent,
  stateOf,
  context,
  moveControlsFor,
  label,
  children,
}: TaskRowsProps) => {
  const projectById = new Map(
    context.projects.map((project) => [project.id, project]),
  );
  const tagById = new Map(context.tags.map((tag) => [tag.id, tag]));
  const selected = new Set(context.list.selectedIds);
  const row = (task: Task, nested: readonly Task[], isNested = false) => (
    <TaskRow
      key={task.id}
      task={task}
      nested={isNested}
      state={stateOf(task)}
      at={context.at}
      timeZone={context.timeZone}
      today={context.today}
      project={
        task.projectId == null ? undefined : projectById.get(task.projectId)
      }
      tags={(task.tagIds ?? []).flatMap((id) => {
        const tag = tagById.get(id);
        return tag === undefined ? [] : [tag];
      })}
      selected={selected.has(task.id)}
      editing={context.list.editingId === task.id}
      focusState={focusStateFor(context.activeSession, task.id)}
      busy={context.busy}
      calendarActionsAvailable={context.calendarActionsAvailable}
      focusActionsAvailable={context.focusActionsAvailable}
      calendars={context.calendars}
      actions={context.actions}
      moveControls={moveControlsFor?.(task)}
      childCount={nested.length}
      onSelect={context.list.onSelect}
      onBeginEdit={context.list.onBeginEdit}
      onEndEdit={context.list.onEndEdit}
    >
      {nested.length > 0 && (
        <ul
          className="task-list task-list--children"
          role="group"
          aria-label={`Child tasks of “${task.title}”`}
        >
          {nested.map((child) => row(child, [], true))}
        </ul>
      )}
    </TaskRow>
  );
  return (
    <ul className="task-list" role="listbox" aria-label={label}>
      {tasks.map((task) =>
        row(
          task,
          task.parentId == null ? (childrenByParent.get(task.id) ?? []) : [],
        ),
      )}
      {children}
    </ul>
  );
};
