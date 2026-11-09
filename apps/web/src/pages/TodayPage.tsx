import { useEffect, useState, type SyntheticEvent } from "react";
import { Hourglass, ListChecks } from "lucide-react";
import type {
  ActiveSession,
  BaikalStatusResponse,
  DayPlanResponse,
  Note,
  PlanningPreferences,
  PlannerResponse,
  Project,
  SavedDayOrder,
  Tag,
  Task,
} from "@suite/contracts";
import { TodayQueue } from "../today-queue.tsx";
import { AddTaskBar } from "../components/tasks/AddTaskBar.tsx";
import type { TaskActions } from "../components/tasks/task-actions.ts";
import type { TaskListContext } from "../components/tasks/TaskList.tsx";
import type { ListSelectionProps } from "../components/tasks/TaskRow.tsx";
import { Badge } from "../components/ui/badge.tsx";
import {
  ViewSection,
  ViewSectionBody,
  ViewSectionHeader,
} from "../components/shell/ViewSection.tsx";
import { Checkbox } from "../components/ui/checkbox.tsx";
import { EmptyState } from "../components/ui/empty-state.tsx";
import { LoadingList } from "../components/ui/loading-list.tsx";
import { SectionHeading } from "../components/ui/section-heading.tsx";
import {
  addCalendarDays,
  buildTodayQueue,
  groupTaskHierarchy,
  planningDate,
  summarizeChildren,
} from "@suite/domain";
import { formatEstimate } from "../components/tasks/task-row-state.ts";
import { useDayOrders, type DayOrderActions } from "../day-order.tsx";
import { PlanTomorrowPanel } from "../plan-tomorrow.tsx";
import { NoteMarkdown } from "../components/notes/NoteMarkdown.tsx";
import { useApplicationPreferences } from "../application-preferences.tsx";

export interface TodayPageProps {
  readonly dayPlan: DayPlanResponse | undefined;
  readonly planningPreferences: PlanningPreferences | undefined;
  readonly tasks: readonly Task[];
  readonly projects: readonly Project[];
  readonly tags: readonly Tag[];
  readonly activeSession: ActiveSession | null;
  readonly syncStatus: "online" | "offline" | "syncing" | undefined;
  readonly planner: PlannerResponse | null;
  readonly baikalCalendars: BaikalStatusResponse["calendars"];
  readonly calendarActionsAvailable: boolean;
  readonly focusActionsAvailable: boolean;
  readonly busy: boolean;
  /** Issue #194: the grouped task callbacks and the list selection. */
  readonly actions: TaskActions;
  readonly list: ListSelectionProps;
  readonly onSubmitTask: (
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) => Promise<void>;
  readonly onViewTasks: () => void;
  /** Enables online quick capture. */
  readonly csrfToken?: string | undefined;
  /** Called after tasks were captured so the task list can refresh. */
  readonly onTasksPlanned?: (() => void) | undefined;
  /**
   * ADR 0050: saved day orders from the offline cache, and the writes that
   * queue a reorder or a plan-for-tomorrow. Both work without a connection.
   */
  readonly dayOrders?: readonly SavedDayOrder[] | undefined;
  readonly dayOrderActions?: DayOrderActions | undefined;
  /**
   * ADR 0046: notes pinned to Today, read from the offline cache in the
   * owner's order. They render without a connection.
   */
  readonly pinnedNotes?: readonly Note[] | undefined;
}
const calmStateLabel: Readonly<Record<DayPlanResponse["state"], string>> = {
  working: "Working",
  scheduled_break: "Scheduled break",
  unavailable: "Unavailable right now",
  finished_for_today: "Finished for today",
};

export const updateHiddenCalendarIds = (
  current: readonly string[],
  calendarId: string,
  checked: boolean,
): readonly string[] =>
  checked
    ? current.filter((id) => id !== calendarId)
    : current.includes(calendarId)
      ? current
      : [...current, calendarId];

export const TodayPage = (props: TodayPageProps) => {
  // ADR 0030: the owner's daily summary note text.
  const { dailySummaryNote } = useApplicationPreferences().snapshot.preferences;
  const {
    dayPlan,
    planningPreferences,
    tasks,
    projects,
    tags,
    activeSession,
    syncStatus,
    planner,
    baikalCalendars,
    calendarActionsAvailable,
    focusActionsAvailable,
    busy,
    actions,
    list,
    onSubmitTask,
    onViewTasks,
    csrfToken,
    onTasksPlanned,
    dayOrders: savedDayOrders,
    dayOrderActions,
    pinnedNotes = [],
  } = props;
  const [logicalAt, setLogicalAt] = useState(
    dayPlan?.at ?? new Date().toISOString(),
  );
  const [hiddenCalendarIds, setHiddenCalendarIds] = useState<readonly string[]>(
    [],
  );
  useEffect(() => {
    if (dayPlan?.at !== undefined) setLogicalAt(dayPlan.at);
  }, [dayPlan?.at]);
  useEffect(() => {
    const timer = window.setInterval(
      () => setLogicalAt(new Date().toISOString()),
      60_000,
    );
    return () => window.clearInterval(timer);
  }, []);
  const preferences = planningPreferences ?? dayPlan?.preferences;
  // ADR 0027: today is the owner's planning date, which may start after
  // local midnight.
  const today = planningDate(
    logicalAt,
    preferences?.timeZone ?? "UTC",
    preferences?.dayStartsAt,
  );
  const tomorrow = addCalendarDays(today, 1);
  const queue =
    preferences === undefined
      ? null
      : buildTodayQueue({
          at: logicalAt,
          timeZone: preferences.timeZone,
          dayStartsAt: preferences.dayStartsAt,
          tasks,
        });
  const todayIds = new Set([
    ...(queue?.overdueTaskIds ?? []),
    ...(queue?.scheduledTodayTaskIds ?? []),
    ...(queue?.plannedTodayTaskIds ?? []),
  ]);
  const plannedTasks = tasks.filter((task) => todayIds.has(task.id));
  const { childrenByParent } = groupTaskHierarchy(
    tasks.filter((task) => task.deletedAt == null),
  );
  // Match the domain's parent rollup and count each child estimate once.
  const estimatedMinutes = plannedTasks
    .filter((task) => task.parentId == null || !todayIds.has(task.parentId))
    .reduce((total, task) => {
      const children = childrenByParent.get(task.id);
      return (
        total +
        (children === undefined
          ? (task.estimateMinutes ?? 0)
          : summarizeChildren(children).openEstimateMinutes)
      );
    }, 0);
  const dayOrders = useDayOrders({
    tasks,
    saved: savedDayOrders,
    actions: preferences === undefined ? undefined : dayOrderActions,
  });
  const context: TaskListContext = {
    at: logicalAt,
    timeZone: preferences?.timeZone ?? "UTC",
    today,
    projects,
    tags,
    activeSession,
    calendars: baikalCalendars,
    busy,
    calendarActionsAvailable,
    focusActionsAvailable,
    actions,
    list,
  };
  return (
    <div className="today-page list-page">
      <div
        className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-3 text-sm text-muted-foreground"
        aria-label="Today's plan"
      >
        <time dateTime={today}>
          {new Intl.DateTimeFormat("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          }).format(new Date(`${today}T12:00:00Z`))}
        </time>
        {queue !== null && (
          <>
            <span className="inline-flex items-center gap-2">
              Estimated{" "}
              <strong className="font-mono font-medium text-foreground">
                {formatEstimate(estimatedMinutes)}
              </strong>
              <Hourglass className="size-4" aria-hidden="true" />
            </span>
            <span className="inline-flex items-center gap-2">
              Planned{" "}
              <strong className="font-mono font-medium text-foreground">
                {todayIds.size}
              </strong>
              <ListChecks className="size-4" aria-hidden="true" />
            </span>
          </>
        )}
      </div>
      <AddTaskBar
        busy={busy}
        online={syncStatus !== "offline"}
        csrfToken={syncStatus === "offline" ? undefined : csrfToken}
        onSubmit={onSubmitTask}
        onTasksCreated={onTasksPlanned}
      />
      {dayPlan !== undefined && (
        <p className="list-status" aria-live="polite">
          <Badge
            variant={
              dayPlan.state === "working"
                ? "success"
                : dayPlan.state === "scheduled_break"
                  ? "info"
                  : dayPlan.state === "finished_for_today"
                    ? "default"
                    : "secondary"
            }
          >
            {calmStateLabel[dayPlan.state]}
          </Badge>
          {dayPlan.nextTask === null
            ? "Nothing is scheduled next."
            : `Next: ${dayPlan.nextTask.title}`}
        </p>
      )}
      {dailySummaryNote.trim() !== "" && (
        <ViewSection aria-labelledby="daily-summary-note-title">
          <ViewSectionHeader>
            <SectionHeading
              as="h3"
              id="daily-summary-note-title"
              title="Daily note"
            />
          </ViewSectionHeader>
          <ViewSectionBody>
            <NoteMarkdown content={dailySummaryNote} />
          </ViewSectionBody>
        </ViewSection>
      )}
      {pinnedNotes.length > 0 && (
        <ViewSection aria-labelledby="pinned-notes-title">
          <ViewSectionHeader>
            <SectionHeading
              as="h3"
              id="pinned-notes-title"
              title="Pinned notes"
            />
          </ViewSectionHeader>
          <ViewSectionBody className="grid gap-3">
            {pinnedNotes.map((note) => (
              <article key={note.id} aria-label="Pinned note">
                <NoteMarkdown content={note.content} />
              </article>
            ))}
          </ViewSectionBody>
        </ViewSection>
      )}
      <TodayQueue
        at={logicalAt}
        preferences={preferences}
        tasks={tasks}
        context={context}
        onViewTasks={onViewTasks}
        plannedTodayOrder={dayOrders.orders.get(today)?.taskIds}
        onMovePlanned={
          dayOrders.enabled
            ? (taskId, direction) =>
                void dayOrders.move(today, taskId, direction)
            : undefined
        }
      />
      {dayOrders.message !== null ? (
        <p className="message" role="status">
          {dayOrders.message}
        </p>
      ) : null}
      {preferences === undefined ? null : (
        <PlanTomorrowPanel
          date={tomorrow}
          today={today}
          tasks={tasks}
          order={dayOrders.orders.get(tomorrow)}
          available={dayOrders.enabled}
          busy={busy || dayOrders.pending}
          onPlan={(selected) => dayOrders.plan(tomorrow, selected)}
          onMove={(taskId, direction) =>
            void dayOrders.move(tomorrow, taskId, direction)
          }
        />
      )}
      <ViewSection className="week-plan" aria-labelledby="week-plan-title">
        <ViewSectionHeader>
          <SectionHeading
            id="week-plan-title"
            eyebrow="From your calendars"
            title="Week plan"
            actions={
              planner !== null ? (
                <Badge
                  variant={
                    planner.freshness.state === "fresh" ? "success" : "warning"
                  }
                >
                  {planner.freshness.message}
                </Badge>
              ) : undefined
            }
          />
        </ViewSectionHeader>
        <ViewSectionBody className="grid gap-3">
          {planner === null && syncStatus !== "offline" ? (
            <LoadingList label="Loading the week plan" />
          ) : planner === null || planner.events.length === 0 ? (
            <EmptyState title="No supported events in this week." />
          ) : (
            <>
              <fieldset className="calendar-filters">
                <legend>Calendars</legend>
                {Array.from(
                  new Map(
                    planner.events.map((event) => [
                      event.identity.calendarId,
                      event.source,
                    ]),
                  ),
                ).map(([calendarId, source]) => (
                  <label key={calendarId}>
                    <Checkbox
                      checked={!hiddenCalendarIds.includes(calendarId)}
                      onCheckedChange={(checked) => {
                        setHiddenCalendarIds((current) =>
                          updateHiddenCalendarIds(
                            current,
                            calendarId,
                            checked === true,
                          ),
                        );
                      }}
                    />
                    {source.providerDisplayLabel} · {source.calendarName}
                  </label>
                ))}
              </fieldset>
              <ol className="timeline">
                {planner.events
                  .filter(
                    (event) =>
                      !hiddenCalendarIds.includes(event.identity.calendarId),
                  )
                  .map((event) => (
                    <li key={`${event.identity.calendarId}:${event.href}`}>
                      <time dateTime={event.startsAt}>
                        {preferences === undefined
                          ? new Date(event.startsAt).toLocaleString()
                          : new Intl.DateTimeFormat("en-US", {
                              timeZone: preferences.timeZone,
                              dateStyle: "medium",
                              timeStyle: "short",
                            }).format(new Date(event.startsAt))}
                      </time>
                      <strong>{event.summary || "Untitled event"}</strong>
                      <span className="source-badge">
                        {event.source.providerDisplayLabel} ·{" "}
                        {event.source.calendarName}
                      </span>
                    </li>
                  ))}
              </ol>
            </>
          )}
        </ViewSectionBody>
      </ViewSection>
    </div>
  );
};
