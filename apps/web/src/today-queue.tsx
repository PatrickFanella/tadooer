import { useMemo, useState } from "react";
import type { PlanningPreferences, Task } from "@suite/contracts";
import { buildTodayQueue, groupTaskHierarchy } from "@suite/domain";
import type { TaskListItemState } from "./components/tasks/TaskRow.tsx";
import {
  TaskRows,
  useVisibleOrder,
  visibleOrder,
  type MoveControls,
  type TaskListContext,
} from "./components/tasks/TaskList.tsx";
import { Button } from "./components/ui/button.tsx";
import { EmptyState } from "./components/ui/empty-state.tsx";

export interface TodayQueueProps {
  readonly at: string;
  readonly preferences: PlanningPreferences | undefined;
  readonly tasks: readonly Task[];
  readonly context: TaskListContext;
  readonly onViewTasks: () => void;
  /** ADR 0027, 0050: saved ranks of today's date-only tasks, from the cache. */
  readonly plannedTodayOrder?: readonly string[] | undefined;
  /** Moves within today's order; absent until the device has synced once. */
  readonly onMovePlanned?:
    ((taskId: string, direction: -1 | 1) => void) | undefined;
}

type SectionState = Exclude<TaskListItemState, "completed">;

/**
 * Today's work as sections of rows (issue #194): overdue, scheduled,
 * planned for today, planning, and the tasks completed in this sitting.
 */
export const TodayQueue = ({
  at,
  preferences,
  tasks,
  context,
  onViewTasks,
  plannedTodayOrder,
  onMovePlanned,
}: TodayQueueProps) => {
  const [recentlyCompletedIds, setRecentlyCompletedIds] = useState<
    ReadonlySet<string>
  >(new Set());
  const byId = useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks],
  );
  // ADR 0018: children render under their parent's row; a child whose
  // parent is in today's queue is nested instead of listed twice.
  const { childrenByParent } = useMemo(
    () => groupTaskHierarchy(tasks.filter((task) => task.deletedAt == null)),
    [tasks],
  );
  const queue =
    preferences === undefined
      ? undefined
      : buildTodayQueue({
          at,
          timeZone: preferences.timeZone,
          dayStartsAt: preferences.dayStartsAt,
          tasks,
          plannedTodayOrder,
        });
  const lookup = (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const task = byId.get(id);
      return task === undefined ? [] : [task];
    });
  const unnestedPlanning =
    queue === undefined
      ? tasks
          .filter(
            (task) =>
              task.status === "open" &&
              task.deletedAt == null &&
              task.plannedStart == null &&
              task.plannedDay == null,
          )
          .toSorted((left, right) => left.id.localeCompare(right.id))
      : lookup(queue.unscheduledTaskIds);
  const [expandedSections, setExpandedSections] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const unnestedOverdue =
    queue === undefined ? [] : lookup(queue.overdueTaskIds);
  const unnestedScheduled =
    queue === undefined ? [] : lookup(queue.scheduledTodayTaskIds);
  const unnestedPlannedToday =
    queue === undefined ? [] : lookup(queue.plannedTodayTaskIds);
  const listedIds = new Set(
    [
      ...unnestedOverdue,
      ...unnestedScheduled,
      ...unnestedPlannedToday,
      ...unnestedPlanning,
    ].map(({ id }) => id),
  );
  const unnested = (listed: readonly Task[]) =>
    listed.filter(
      (task) => task.parentId == null || !listedIds.has(task.parentId),
    );
  const overdue = unnested(unnestedOverdue);
  const scheduled = unnested(unnestedScheduled);
  const plannedToday = unnested(unnestedPlannedToday);
  const planning = unnested(unnestedPlanning);
  const completed = tasks.filter(
    (task) =>
      recentlyCompletedIds.has(task.id) &&
      task.status === "completed" &&
      task.deletedAt === null,
  );
  const unavailableScheduledCount =
    preferences === undefined
      ? tasks.filter(
          (task) =>
            task.status === "open" &&
            task.deletedAt == null &&
            (task.plannedStart != null || task.plannedDay != null),
        ).length
      : 0;

  // Completed rows stay in view for this sitting so a slip can be reopened.
  const actions = {
    ...context.actions,
    changeStatus: async (task: Task, action: "complete" | "reopen") => {
      const changed = await context.actions.changeStatus(task, action);
      if (changed)
        setRecentlyCompletedIds((current) => {
          const next = new Set(current);
          if (action === "complete") next.add(task.id);
          else next.delete(task.id);
          return next;
        });
      return changed;
    },
  };
  const rowContext: TaskListContext = { ...context, at, actions };

  // ADR 0050: every planned task can move; a reorder queues offline and the
  // server reconciles membership when it applies it.
  const moveControlsFor = (task: Task): MoveControls | undefined => {
    if (onMovePlanned === undefined) return undefined;
    const index = plannedToday.findIndex(({ id }) => id === task.id);
    if (index === -1) return undefined;
    return {
      canMoveUp: index > 0,
      canMoveDown: index < plannedToday.length - 1,
      onMove: (direction) => onMovePlanned(task.id, direction),
    };
  };

  // A section shows its first rows; the owner opens the rest. A planner with
  // hundreds of overdue or unplanned tasks otherwise renders them all.
  const sectionLimit = 12;
  const shownOf = (className: string, listed: readonly Task[]) =>
    expandedSections.has(className) ? listed : listed.slice(0, sectionLimit);
  const sections: readonly {
    readonly title: string;
    readonly className: string;
    readonly listed: readonly Task[];
    readonly state: SectionState;
  }[] = [
    {
      title: "Overdue",
      className: "today-overdue",
      listed: overdue,
      state: "overdue",
    },
    {
      title: "Scheduled today",
      className: "today-scheduled",
      listed: scheduled,
      state: "scheduled",
    },
    {
      title: "Planned for today",
      className: "today-planned-day",
      listed: plannedToday,
      state: "planned-day",
    },
    {
      title: "Planning",
      className: "today-planning",
      listed: planning,
      state: "planning",
    },
  ];
  useVisibleOrder(
    visibleOrder(
      [
        ...sections.map(({ className, listed }) => shownOf(className, listed)),
        completed,
      ],
      childrenByParent,
    ),
    context.list.onVisibleOrderChange,
  );

  const section = ({
    title,
    className,
    listed,
    state,
  }: (typeof sections)[number]) => {
    // Issue #175: an empty section is not shown; the whole queue falls back
    // to the "Today is clear" state when nothing is listed at all.
    if (listed.length === 0) return null;
    const expanded = expandedSections.has(className);
    const shown = shownOf(className, listed);
    const hidden = listed.length - shown.length;
    return (
      <section
        key={className}
        className={`list-section ${className}`}
        aria-labelledby={`${className}-title`}
      >
        <h2 id={`${className}-title`} className="list-heading">
          {title}
          {listed.length > sectionLimit && (
            <span className="list-heading__count">{listed.length}</span>
          )}
        </h2>
        <TaskRows
          tasks={shown}
          childrenByParent={childrenByParent}
          stateOf={() => state}
          context={rowContext}
          moveControlsFor={
            state === "planned-day" ? moveControlsFor : undefined
          }
          label={title}
        />
        {hidden > 0 || expanded ? (
          <p className="today-section__more">
            <Button
              variant="link"
              type="button"
              onClick={() =>
                setExpandedSections((current) => {
                  const next = new Set(current);
                  if (next.has(className)) next.delete(className);
                  else next.add(className);
                  return next;
                })
              }
            >
              {expanded ? "Show fewer" : `Show ${String(hidden)} more`}
            </Button>
          </p>
        ) : null}
      </section>
    );
  };

  return (
    <div className="today-layout">
      {preferences === undefined && unavailableScheduledCount > 0 ? (
        <p className="hint">
          {unavailableScheduledCount} scheduled{" "}
          {unavailableScheduledCount === 1 ? "task" : "tasks"} hidden until the
          planning time zone is available.
        </p>
      ) : null}
      {queue !== undefined && queue.futureScheduledCount > 0 ? (
        <p className="hint">
          {queue.futureScheduledCount} future{" "}
          {queue.futureScheduledCount === 1 ? "task" : "tasks"} hidden.{" "}
          <Button variant="link" type="button" onClick={onViewTasks}>
            View tasks
          </Button>
        </p>
      ) : null}
      {sections.every(({ listed }) => listed.length === 0) ? (
        <EmptyState title="Today is clear." />
      ) : (
        sections.map(section)
      )}
      {completed.length > 0 ? (
        <section
          className="list-section today-completed"
          aria-live="polite"
          aria-labelledby="today-completed-title"
        >
          <h2 id="today-completed-title" className="list-heading">
            Completed just now
          </h2>
          <TaskRows
            tasks={completed}
            childrenByParent={new Map()}
            stateOf={() => "completed"}
            context={rowContext}
            label="Completed just now"
          />
        </section>
      ) : null}
    </div>
  );
};
