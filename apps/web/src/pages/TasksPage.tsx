import { ViewIntro } from "../components/shell/ViewIntro.tsx";
import type { SyntheticEvent } from "react";
import { groupTaskHierarchy, zonedCalendarDate } from "@suite/domain";
import type {
  ActiveSession,
  BaikalStatusResponse,
  Note,
  Project,
  Tag,
  Task,
} from "@suite/contracts";
import { AddTaskBar } from "../components/tasks/AddTaskBar.tsx";
import type { TaskActions } from "../components/tasks/task-actions.ts";
import {
  TaskRows,
  useVisibleOrder,
  visibleOrder,
  type TaskListContext,
} from "../components/tasks/TaskList.tsx";
import type { ListSelectionProps } from "../components/tasks/TaskRow.tsx";
import { Field } from "../field.tsx";
import { Button } from "../components/ui/button.tsx";
import {
  ViewSection,
  ViewSectionBody,
  ViewSectionHeader,
} from "../components/shell/ViewSection.tsx";
import { EmptyState } from "../components/ui/empty-state.tsx";
import { Input } from "../components/ui/input.tsx";
import { NativeSelect } from "../components/ui/native-select.tsx";
import { SectionHeading } from "../components/ui/section-heading.tsx";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs.tsx";
import type { TasksSection } from "../app/routes.ts";
import {
  OrganizationPanel,
  type NoteQueue,
  type OrganizationQueue,
} from "../components/organization/OrganizationPanel.tsx";
import { RecurringSeriesManager } from "../components/tasks/TaskRecurrence.tsx";
import {
  MenuFolderManager,
  SectionsPanel,
  TaskViewControls,
  applyTaskView,
  groupByFolder,
  useMenuFolders,
  useSavedTaskView,
  viewContextFor,
} from "../components/tasks/TaskViews.tsx";

export interface TasksPageProps {
  readonly taskIdFilter?: string;
  readonly onClearTaskIdFilter?: () => void;
  readonly tasks: readonly Task[];
  readonly visibleTasks: readonly Task[];
  readonly recovery: readonly Task[];
  readonly projects: readonly Project[];
  readonly tags: readonly Tag[];
  readonly baikalCalendars: BaikalStatusResponse["calendars"];
  readonly activeSession?: ActiveSession | null | undefined;
  readonly taskQuery: string;
  readonly taskStatusFilter: "all" | Task["status"];
  readonly taskProjectFilter: string;
  readonly taskTagFilter: string;
  readonly busy: boolean;
  readonly calendarActionsAvailable: boolean;
  readonly focusActionsAvailable?: boolean;
  readonly onTaskQueryChange: (query: string) => void;
  readonly onTaskStatusFilterChange: (filter: "all" | Task["status"]) => void;
  readonly onTaskProjectFilterChange: (projectId: string) => void;
  readonly onTaskTagFilterChange: (tagId: string) => void;
  readonly onSubmitOrganization: (
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
    kind: "project" | "tag",
  ) => Promise<void>;
  readonly onRecoverTask: (task: Task) => Promise<void>;
  /** Issue #194: the grouped task callbacks and the list selection. */
  readonly actions: TaskActions;
  readonly list: ListSelectionProps;
  /** The add bar at the top of the list; omitted where capture is unavailable. */
  readonly onSubmitTask?:
    | ((event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => Promise<void>)
    | undefined;
  readonly onTasksCreated?: (() => void) | undefined;
  /**
   * Issue #194: a project or tag context route. The matching filter is fixed
   * by `App`; the page hides that dropdown and names a missing context.
   */
  readonly context?:
    { readonly kind: "project" | "tag"; readonly id: string } | undefined;
  /** Enables project/tag/note management when a session is available. */
  readonly organization?: {
    readonly csrfToken: string;
    readonly online: boolean;
    readonly onProjectsChange: (projects: readonly Project[]) => void;
    readonly onTagsChange: (tags: readonly Tag[]) => void;
    /** ADR 0033: lifecycle and appearance edits through the offline outbox. */
    readonly queue?: OrganizationQueue;
    /** ADR 0046: notes from the offline cache and their outbox writes. */
    readonly notes?: readonly Note[];
    readonly noteQueue?: NoteQueue;
  };
  /** Owner planning zone for date-only plans (ADR 0020). */
  readonly timeZone?: string;
  /**
   * Issue #171: the list (filters, saved views, tasks) or Organize
   * (projects, tags, sidebar folders, recurring series). The app keeps the
   * section in the URL as `/tasks` and `/tasks/organize`.
   */
  readonly section?: TasksSection;
  readonly onSectionChange?: (section: TasksSection) => void;
  /** Issue #173: opens the Boards page scoped to the filtered project. */
  readonly onOpenProjectBoards?: (projectId: string) => void;
}

export const TasksPage = ({
  taskIdFilter = "",
  onClearTaskIdFilter,
  tasks,
  organization,
  visibleTasks,
  recovery,
  projects,
  tags,
  baikalCalendars,
  activeSession = null,
  taskQuery,
  taskStatusFilter,
  taskProjectFilter,
  taskTagFilter,
  busy,
  calendarActionsAvailable,
  focusActionsAvailable = false,
  onTaskQueryChange,
  onTaskStatusFilterChange,
  onTaskProjectFilterChange,
  onTaskTagFilterChange,
  onSubmitOrganization,
  onRecoverTask,
  actions,
  list,
  onSubmitTask,
  onTasksCreated,
  context,
  timeZone = "UTC",
  section = "list",
  onSectionChange,
  onOpenProjectBoards,
}: TasksPageProps) => {
  const visibleIds = new Set(visibleTasks.map(({ id }) => id));
  const today = zonedCalendarDate(new Date(), timeZone);
  // Saved view, sections and sidebar folders (ADR 0028): online HTTP records.
  const viewContext = viewContextFor(taskProjectFilter, taskTagFilter);
  const savedView = useSavedTaskView(
    organization?.csrfToken,
    organization?.online === true,
    viewContext,
  );
  const { folders, setFolders } = useMenuFolders(
    organization?.csrfToken,
    organization?.online === true,
  );
  const viewLabels = {
    tag: (tagId: string) =>
      tags.find(({ id }) => id === tagId)?.displayName ?? "Unknown tag",
    project: (projectId: string) =>
      projects.find(({ id }) => id === projectId)?.title ?? "Unknown project",
  };
  // Children render under a visible parent; a child whose parent is filtered
  // out stays visible at top level with its placement shown.
  const topLevel = visibleTasks.filter(
    (task) => task.parentId == null || !visibleIds.has(task.parentId),
  );
  const viewGroups = applyTaskView(
    topLevel,
    savedView.view,
    { today, timeZone },
    viewLabels,
    savedView.timeSpentMinutes,
  );
  const { childrenByParent } = groupTaskHierarchy(visibleTasks);
  const titleById = new Map(tasks.map(({ id, title }) => [id, title]));
  // Issue #194: a context route whose project or tag is gone.
  const missingContext =
    context === undefined
      ? null
      : context.kind === "project"
        ? projects.some(({ id }) => id === context.id)
          ? null
          : "This project no longer exists."
        : tags.some(({ id }) => id === context.id)
          ? null
          : "This tag no longer exists.";
  useVisibleOrder(
    visibleOrder(
      section === "list" && missingContext === null
        ? viewGroups.map((group) => group.tasks)
        : [],
      childrenByParent,
    ),
    list.onVisibleOrderChange,
  );
  const rowContext: TaskListContext = {
    at: new Date().toISOString(),
    timeZone,
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
  const stateOf = (task: Task) =>
    task.status === "completed"
      ? "completed"
      : task.plannedStart != null
        ? "scheduled"
        : task.plannedDay != null
          ? "planned-day"
          : "planning";
  return (
    <>
      <ViewIntro
        description={
          section === "organize"
            ? "Projects, tags, sidebar folders and recurring series."
            : "Every task, with filters and saved views."
        }
        actions={
          <Tabs
            value={section}
            onValueChange={(value) => onSectionChange?.(value as TasksSection)}
          >
            <TabsList aria-label="Tasks page section">
              <TabsTrigger value="list">Tasks</TabsTrigger>
              <TabsTrigger value="organize">Organize</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
      {section === "organize" && (
        <>
          <ViewSection aria-labelledby="organization-title">
            <ViewSectionHeader>
              <SectionHeading
                id="organization-title"
                as="h2"
                title="Projects and tags"
              />
            </ViewSectionHeader>
            <ViewSectionBody>
              <div className="task-actions">
                <form
                  onSubmit={(event) =>
                    void onSubmitOrganization(event, "project")
                  }
                >
                  <Field label="New project" name="title" autoComplete="off" />
                  <Button disabled={busy}>Add project</Button>
                </form>
                <form
                  onSubmit={(event) => void onSubmitOrganization(event, "tag")}
                >
                  <Field label="New tag" name="title" autoComplete="off" />
                  <Button disabled={busy}>Add tag</Button>
                </form>
              </div>
            </ViewSectionBody>
          </ViewSection>
          {organization !== undefined && (
            <OrganizationPanel
              projects={projects}
              tags={tags}
              tasks={tasks}
              {...organization}
            />
          )}
          {organization !== undefined && (
            <MenuFolderManager
              csrfToken={organization.csrfToken}
              online={organization.online}
              folders={folders}
              onFoldersChange={setFolders}
              projects={projects}
              tags={tags}
              busy={busy}
            />
          )}
          {organization !== undefined && (
            <RecurringSeriesManager
              csrfToken={organization.csrfToken}
              online={organization.online}
              projects={projects}
              today={today}
            />
          )}
        </>
      )}
      {section === "list" && (
        <>
          {onSubmitTask !== undefined && missingContext === null && (
            <AddTaskBar
              busy={busy}
              online={organization?.online === true}
              csrfToken={
                organization?.online === true
                  ? organization.csrfToken
                  : undefined
              }
              onSubmit={onSubmitTask}
              onTasksCreated={onTasksCreated}
            />
          )}
          <ViewSection
            className="task-filter-bar"
            role="search"
            aria-label="Filter tasks"
          >
            <ViewSectionBody className="flex flex-wrap items-end gap-2 pt-4">
              <label>
                Search
                <Input
                  type="search"
                  value={taskQuery}
                  onChange={(event) =>
                    onTaskQueryChange(event.currentTarget.value)
                  }
                />
              </label>
              <label>
                Status
                <NativeSelect
                  value={taskStatusFilter}
                  onChange={(event) =>
                    onTaskStatusFilterChange(
                      event.currentTarget.value as "all" | Task["status"],
                    )
                  }
                >
                  <option value="all">All</option>
                  <option value="open">Open</option>
                  <option value="completed">Completed</option>
                </NativeSelect>
              </label>
              {context?.kind !== "project" && (
                <label>
                  Project
                  <NativeSelect
                    value={taskProjectFilter}
                    onChange={(event) =>
                      onTaskProjectFilterChange(event.currentTarget.value)
                    }
                  >
                    <option value="">All projects</option>
                    {groupByFolder(
                      projects.filter(
                        (project) =>
                          !project.hiddenFromMenu ||
                          project.id === taskProjectFilter,
                      ),
                      folders,
                      "project",
                    ).map((group) =>
                      group.folder === null ? (
                        group.items.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.title}
                          </option>
                        ))
                      ) : (
                        <optgroup
                          key={group.folder.id}
                          label={`${"· ".repeat(group.depth)}${group.folder.title}`}
                        >
                          {group.items.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.title}
                            </option>
                          ))}
                        </optgroup>
                      ),
                    )}
                  </NativeSelect>
                </label>
              )}
              {context?.kind !== "tag" && (
                <label>
                  Tag
                  <NativeSelect
                    value={taskTagFilter}
                    onChange={(event) =>
                      onTaskTagFilterChange(event.currentTarget.value)
                    }
                  >
                    <option value="">All tags</option>
                    {groupByFolder(tags, folders, "tag").map((group) =>
                      group.folder === null ? (
                        group.items.map((tag) => (
                          <option key={tag.id} value={tag.id}>
                            {tag.displayName}
                          </option>
                        ))
                      ) : (
                        <optgroup
                          key={group.folder.id}
                          label={`${"· ".repeat(group.depth)}${group.folder.title}`}
                        >
                          {group.items.map((tag) => (
                            <option key={tag.id} value={tag.id}>
                              {tag.displayName}
                            </option>
                          ))}
                        </optgroup>
                      ),
                    )}
                  </NativeSelect>
                </label>
              )}
            </ViewSectionBody>
          </ViewSection>
          {organization !== undefined && (
            <TaskViewControls
              view={savedView.view}
              online={organization.online}
              tags={tags}
              projects={projects}
              message={savedView.message}
              onSave={savedView.save}
            />
          )}
          {organization !== undefined &&
            viewContext.contextKind !== "all" &&
            viewContext.contextKind !== "today" && (
              <SectionsPanel
                csrfToken={organization.csrfToken}
                online={organization.online}
                contextKind={viewContext.contextKind}
                contextId={viewContext.contextId}
                contextTitle={
                  viewContext.contextKind === "project"
                    ? viewLabels.project(viewContext.contextId)
                    : viewLabels.tag(viewContext.contextId)
                }
                tasks={tasks.filter(
                  (task) =>
                    task.deletedAt == null &&
                    (viewContext.contextKind === "project"
                      ? task.projectId === viewContext.contextId
                      : task.tagIds?.includes(viewContext.contextId) === true),
                )}
                busy={busy}
              />
            )}
          {taskIdFilter !== "" && (
            <Button type="button" onClick={onClearTaskIdFilter}>
              Show all tasks
            </Button>
          )}
          {taskProjectFilter !== "" && onOpenProjectBoards !== undefined && (
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenProjectBoards(taskProjectFilter)}
            >
              Boards for this project
            </Button>
          )}
          <SectionHeading as="h2" title="Captured tasks" />
          {missingContext !== null ? (
            <EmptyState title={missingContext} />
          ) : visibleTasks.length === 0 ||
            viewGroups.every((group) => group.tasks.length === 0) ? (
            <EmptyState title="No tasks match these filters." />
          ) : (
            viewGroups.map((group) => (
              <div key={group.key} className="task-view-group">
                {group.label !== "" && (
                  <SectionHeading
                    as="h3"
                    title={`${group.label} (${String(group.tasks.length)})`}
                  />
                )}
                <TaskRows
                  tasks={group.tasks}
                  childrenByParent={childrenByParent}
                  stateOf={stateOf}
                  context={rowContext}
                  label={group.label === "" ? "Captured tasks" : group.label}
                />
              </div>
            ))
          )}
          <details className="recovery">
            <summary>
              Recently deleted tasks ({String(recovery.length)})
            </summary>
            {recovery.length === 0 ? (
              <p className="muted">Nothing needs recovery.</p>
            ) : (
              <ul className="tasks">
                {recovery.map((task) => (
                  <li key={task.id}>
                    <strong>{task.title}</strong>
                    {task.parentId != null && (
                      <small>
                        Child of{" "}
                        {titleById.get(task.parentId) ?? "a deleted task"};
                        restoring it alone makes it top-level if its parent is
                        still deleted
                      </small>
                    )}
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() => void onRecoverTask(task)}
                    >
                      Restore task
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </details>
        </>
      )}
    </>
  );
};
