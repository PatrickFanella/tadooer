import type {
  ActiveSession,
  BaikalStatusResponse,
  Project,
  Tag,
  Task,
} from "@suite/contracts";
import { useState, type SyntheticEvent } from "react";
import { AddTaskBar } from "../components/tasks/AddTaskBar.tsx";
import type { TaskActions } from "../components/tasks/task-actions.ts";
import {
  TaskRows,
  useVisibleOrder,
  visibleOrder,
  type TaskListContext,
} from "../components/tasks/TaskList.tsx";
import type { ListSelectionProps } from "../components/tasks/TaskRow.tsx";
import { EmptyState } from "../components/ui/empty-state.tsx";
import { Button } from "../components/ui/button.tsx";

interface InboxPageProps {
  readonly tasks: readonly Task[];
  readonly projects: readonly Project[];
  readonly tags: readonly Tag[];
  readonly activeSession: ActiveSession | null;
  readonly calendars: BaikalStatusResponse["calendars"];
  readonly timeZone: string;
  readonly today: string;
  readonly busy: boolean;
  readonly online: boolean;
  readonly csrfToken: string | undefined;
  readonly calendarActionsAvailable: boolean;
  readonly focusActionsAvailable: boolean;
  readonly actions: TaskActions;
  readonly list: ListSelectionProps;
  readonly onSubmitTask: (
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) => Promise<void>;
  readonly onTasksCreated?: (() => void) | undefined;
}

const pageSize = 12;

/** Open tasks with no planned time (issue #194): the add bar and one list. */
export const InboxPage = ({
  tasks,
  projects,
  tags,
  activeSession,
  calendars,
  timeZone,
  today,
  busy,
  online,
  csrfToken,
  calendarActionsAvailable,
  focusActionsAvailable,
  actions,
  list,
  onSubmitTask,
  onTasksCreated,
}: InboxPageProps) => {
  // The first dozen unplanned tasks; the owner opens the rest.
  const [showAll, setShowAll] = useState(false);
  const inboxTasks = tasks.filter(
    (task) =>
      task.status === "open" &&
      task.deletedAt === null &&
      task.plannedStart === null,
  );
  const shown = showAll ? inboxTasks : inboxTasks.slice(0, pageSize);
  useVisibleOrder(visibleOrder([shown], new Map()), list.onVisibleOrderChange);
  const context: TaskListContext = {
    at: new Date().toISOString(),
    timeZone,
    today,
    projects,
    tags,
    activeSession,
    calendars,
    busy,
    calendarActionsAvailable,
    focusActionsAvailable,
    actions,
    list,
  };

  return (
    <div className="inbox-page list-page">
      <AddTaskBar
        busy={busy}
        online={online}
        csrfToken={csrfToken}
        onSubmit={onSubmitTask}
        onTasksCreated={onTasksCreated}
      />
      {inboxTasks.length === 0 ? (
        <EmptyState
          title="The inbox is empty."
          description="New tasks wait here until you give them a time."
        />
      ) : (
        <section className="list-section" aria-labelledby="inbox-list-title">
          <h2 id="inbox-list-title" className="list-heading">
            To plan
            <span className="list-heading__count">{inboxTasks.length}</span>
          </h2>
          <TaskRows
            tasks={shown}
            childrenByParent={new Map()}
            stateOf={() => "planning"}
            context={context}
            label="To plan"
          />
          {inboxTasks.length > pageSize ? (
            <p className="today-section__more">
              <Button
                variant="link"
                type="button"
                onClick={() => setShowAll((current) => !current)}
              >
                {showAll
                  ? "Show fewer"
                  : `Show ${String(inboxTasks.length - pageSize)} more`}
              </Button>
            </p>
          ) : null}
        </section>
      )}
    </div>
  );
};
