import { useId, useState, type ReactNode } from "react";
import {
  Cable,
  CalendarDays,
  ChevronRight,
  Clock,
  Gauge,
  History,
  Inbox,
  LayoutGrid,
  ListTodo,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Repeat,
  RotateCcw,
  Settings,
  Sun,
  type LucideIcon,
} from "lucide-react";
import type { Project, Tag, Task } from "@suite/contracts";
import { zonedCalendarDate } from "@suite/domain";
import {
  pathForLocation,
  routeGroups,
  routeLabel,
  type Location,
  type WorkspaceRoute,
} from "@/app/routes";

export interface SidebarCounts {
  readonly today: number;
  readonly inbox: number;
  readonly byProject: ReadonlyMap<string, number>;
  readonly byTag: ReadonlyMap<string, number>;
}

/** Open-task counts for the sidebar (issue #194), from the cached tasks. */
export const sidebarCounts = (
  tasks: readonly Task[],
  today: string,
  timeZone: string,
): SidebarCounts => {
  const byProject = new Map<string, number>();
  const byTag = new Map<string, number>();
  let todayCount = 0;
  let inbox = 0;
  for (const task of tasks) {
    if (task.status !== "open" || task.deletedAt != null) continue;
    const plannedToday =
      task.plannedDay === today ||
      (task.plannedStart != null &&
        zonedCalendarDate(task.plannedStart, timeZone) === today);
    if (plannedToday) todayCount += 1;
    if (task.plannedStart == null) inbox += 1;
    if (task.projectId != null)
      byProject.set(task.projectId, (byProject.get(task.projectId) ?? 0) + 1);
    for (const tagId of task.tagIds ?? [])
      byTag.set(tagId, (byTag.get(tagId) ?? 0) + 1);
  }
  return { today: todayCount, inbox, byProject, byTag };
};

export interface SidebarProps {
  readonly location: Location;
  readonly projects: readonly Project[];
  readonly tags: readonly Tag[];
  readonly counts: SidebarCounts;
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
  readonly offline: boolean;
  readonly onNavigate: (location: Location) => void;
}

const routeIcons: Readonly<Record<WorkspaceRoute, LucideIcon>> = {
  today: Sun,
  inbox: Inbox,
  planner: CalendarDays,
  tasks: ListTodo,
  boards: LayoutGrid,
  history: History,
  worklog: Clock,
  counters: Gauge,
  reuse: RotateCcw,
  habits: Repeat,
  connections: Cable,
  settings: Settings,
};

type GroupId = "projects" | "tags" | "records" | "setup";

const storageKey = (id: GroupId) => `tadooer.sidebar-group:${id}`;

const readOpen = (id: GroupId, fallback: boolean): boolean => {
  try {
    const stored = localStorage.getItem(storageKey(id));
    return stored === null ? fallback : stored === "open";
  } catch {
    return fallback;
  }
};

const writeOpen = (id: GroupId, open: boolean) => {
  try {
    localStorage.setItem(storageKey(id), open ? "open" : "closed");
  } catch {
    /* private mode or storage disabled: the group simply forgets */
  }
};

const sameLocation = (left: Location, right: Location): boolean =>
  left.route === right.route &&
  ("id" in left ? left.id : null) === ("id" in right ? right.id : null);

const groupOf = (location: Location): GroupId | null => {
  if (location.route === "project") return "projects";
  if (location.route === "tag") return "tags";
  const group = routeGroups.find((candidate) =>
    candidate.routes.includes(location.route),
  );
  return group?.id === "records" || group?.id === "setup" ? group.id : null;
};

const NavLink = ({
  location,
  current,
  collapsed,
  icon,
  label,
  count,
  swatch,
  onNavigate,
}: {
  readonly location: Location;
  readonly current: boolean;
  readonly collapsed: boolean;
  readonly icon: ReactNode;
  readonly label: string;
  readonly count?: number | undefined;
  readonly swatch?: string | null | undefined;
  readonly onNavigate: (location: Location) => void;
}) => (
  <a
    href={pathForLocation(location)}
    aria-current={current ? "page" : undefined}
    title={collapsed ? label : undefined}
    onClick={(event) => {
      event.preventDefault();
      onNavigate(location);
    }}
  >
    {swatch === undefined ? (
      icon
    ) : (
      <span
        className="sidebar-swatch"
        aria-hidden="true"
        style={{ backgroundColor: swatch ?? "var(--overlay-0)" }}
      />
    )}
    <span className="sidebar-label">{label}</span>
    {count !== undefined && count > 0 && (
      <span className="sidebar-count" data-count={count}>
        {count}
      </span>
    )}
  </a>
);

/**
 * Issue #194: views first, then the owner's projects and tags as
 * navigable contexts, then Records and Setup (issue #175). Every group
 * remembers its state per browser and opens while it holds the current
 * location. The phone layout flattens the groups into the scrolling row.
 */
export const Sidebar = ({
  location,
  projects,
  tags,
  counts,
  collapsed,
  onToggleCollapsed,
  offline,
  onNavigate,
}: SidebarProps) => {
  const idPrefix = useId();
  const currentGroup = groupOf(location);
  const [open, setOpen] = useState<Record<GroupId, boolean>>(() => ({
    projects: currentGroup === "projects" || readOpen("projects", true),
    tags: currentGroup === "tags" || readOpen("tags", true),
    records: currentGroup === "records" || readOpen("records", false),
    setup: currentGroup === "setup" || readOpen("setup", false),
  }));
  // A location change into a collapsed group opens it; a later manual
  // collapse on the same location must stick, so this derives from the last
  // seen group rather than from an effect.
  const [seenGroup, setSeenGroup] = useState(currentGroup);
  if (seenGroup !== currentGroup) {
    setSeenGroup(currentGroup);
    if (currentGroup !== null && !open[currentGroup])
      setOpen((previous) => ({ ...previous, [currentGroup]: true }));
  }
  const toggle = (id: GroupId) => {
    const next = !open[id];
    setOpen((previous) => ({ ...previous, [id]: next }));
    writeOpen(id, next);
  };

  const viewLink = (route: WorkspaceRoute) => {
    const Icon = routeIcons[route];
    return (
      <NavLink
        key={route}
        location={{ route }}
        current={location.route === route}
        collapsed={collapsed}
        icon={<Icon className="nav-icon" aria-hidden="true" />}
        label={routeLabel(route)}
        count={
          route === "today"
            ? counts.today
            : route === "inbox"
              ? counts.inbox
              : undefined
        }
        onNavigate={onNavigate}
      />
    );
  };

  const group = (id: GroupId, label: string, items: ReactNode) => {
    const expanded = open[id];
    const listId = `${idPrefix}-sidebar-group-${id}`;
    return (
      <div
        key={id}
        className="sidebar-group"
        data-open={expanded ? "true" : "false"}
      >
        <button
          type="button"
          className="sidebar-group-toggle"
          aria-expanded={expanded}
          aria-controls={listId}
          title={collapsed ? label : undefined}
          onClick={() => toggle(id)}
        >
          <ChevronRight
            className="nav-icon sidebar-group-chevron"
            aria-hidden="true"
          />
          <span className="sidebar-label">{label}</span>
        </button>
        <div id={listId} className="sidebar-group-items">
          {items}
        </div>
      </div>
    );
  };

  const visibleProjects = projects
    .filter((project) => project.archivedAt === null && !project.hiddenFromMenu)
    .toSorted((left, right) => left.position - right.position);
  const visibleTags = tags
    .filter((tag) => tag.archivedAt === null)
    .toSorted((left, right) => left.position - right.position);
  const organize: Location = { route: "tasks" };

  return (
    <aside className="sidebar" data-collapsed={collapsed ? "true" : "false"}>
      <div className="sidebar-brand">
        <img src="/suite-icon.svg" className="size-7 shrink-0" alt="" />
        <span className="sidebar-label">Tadooer</span>
        <button
          type="button"
          className="sidebar-collapse"
          aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
          aria-pressed={collapsed}
          onClick={onToggleCollapsed}
        >
          {collapsed ? (
            <PanelLeftOpen className="nav-icon" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="nav-icon" aria-hidden="true" />
          )}
        </button>
      </div>
      <nav className="sidebar-nav" aria-label="Workspace views">
        {routeGroups
          .find((candidate) => candidate.id === "daily")
          ?.routes.map(viewLink)}
        {group(
          "projects",
          "Projects",
          <>
            {visibleProjects.map((project) => (
              <NavLink
                key={project.id}
                location={{ route: "project", id: project.id }}
                current={sameLocation(location, {
                  route: "project",
                  id: project.id,
                })}
                collapsed={collapsed}
                icon={null}
                swatch={project.color}
                label={project.title}
                count={counts.byProject.get(project.id)}
                onNavigate={onNavigate}
              />
            ))}
            <a
              href="/tasks/organize"
              className="sidebar-new"
              title={collapsed ? "New project" : undefined}
              onClick={(event) => {
                event.preventDefault();
                onNavigate(organize);
                if (typeof history !== "undefined")
                  history.replaceState({}, "", "/tasks/organize");
              }}
            >
              <Plus className="nav-icon" aria-hidden="true" />
              <span className="sidebar-label">New project</span>
            </a>
          </>,
        )}
        {group(
          "tags",
          "Tags",
          <>
            {visibleTags.map((tag) => (
              <NavLink
                key={tag.id}
                location={{ route: "tag", id: tag.id }}
                current={sameLocation(location, { route: "tag", id: tag.id })}
                collapsed={collapsed}
                icon={null}
                swatch={tag.color}
                label={tag.displayName}
                count={counts.byTag.get(tag.id)}
                onNavigate={onNavigate}
              />
            ))}
            <a
              href="/tasks/organize"
              className="sidebar-new"
              title={collapsed ? "New tag" : undefined}
              onClick={(event) => {
                event.preventDefault();
                onNavigate(organize);
                if (typeof history !== "undefined")
                  history.replaceState({}, "", "/tasks/organize");
              }}
            >
              <Plus className="nav-icon" aria-hidden="true" />
              <span className="sidebar-label">New tag</span>
            </a>
          </>,
        )}
        {routeGroups
          .filter((candidate) => candidate.label !== undefined)
          .map((candidate) =>
            group(
              candidate.id as GroupId,
              candidate.label ?? "",
              candidate.routes.map(viewLink),
            ),
          )}
      </nav>
      {offline && (
        <p className="sidebar-offline" role="status">
          Showing tasks saved in this browser.
        </p>
      )}
    </aside>
  );
};
