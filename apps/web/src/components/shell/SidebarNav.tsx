import { useState } from "react";
import {
  Cable,
  ChevronRight,
  Repeat,
  CalendarDays,
  Clock,
  Gauge,
  History,
  Inbox,
  LayoutGrid,
  ListTodo,
  RotateCcw,
  Settings,
  Sun,
  type LucideIcon,
} from "lucide-react";
import {
  routeGroupOf,
  routeGroups,
  routeLabel,
  type RouteGroup,
  type WorkspaceRoute,
} from "@/app/routes";

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

const storageKey = (id: RouteGroup["id"]) => `tadooer.sidebar-group:${id}`;

const readOpen = (id: RouteGroup["id"]): boolean => {
  try {
    return localStorage.getItem(storageKey(id)) === "open";
  } catch {
    return false;
  }
};

const writeOpen = (id: RouteGroup["id"], open: boolean) => {
  try {
    localStorage.setItem(storageKey(id), open ? "open" : "closed");
  } catch {
    /* private mode or storage disabled: the group simply forgets */
  }
};

interface SidebarNavProps {
  readonly route: WorkspaceRoute;
  readonly onNavigate: (route: WorkspaceRoute) => void;
}

const NavLink = ({
  item,
  current,
  onNavigate,
}: {
  readonly item: WorkspaceRoute;
  readonly current: boolean;
  readonly onNavigate: (route: WorkspaceRoute) => void;
}) => {
  const Icon = routeIcons[item];

  return (
    <a
      href={`/${item}`}
      aria-current={current ? "page" : undefined}
      onClick={(event) => {
        event.preventDefault();
        onNavigate(item);
      }}
    >
      <Icon className="nav-icon" aria-hidden="true" />
      {routeLabel(item)}
    </a>
  );
};

/**
 * Issue #175: daily views are always listed; Records and Setup are
 * collapsible groups that remember their state and open themselves while the
 * current view is inside them. The phone layout flattens the groups into the
 * scrolling row (see styles.css), so the toggles only exist on wide screens.
 */
export const SidebarNav = ({ route, onNavigate }: SidebarNavProps) => {
  const currentGroup = routeGroupOf(route);
  const [open, setOpen] = useState<Record<RouteGroup["id"], boolean>>(() => ({
    daily: true,
    records: currentGroup === "records" || readOpen("records"),
    setup: currentGroup === "setup" || readOpen("setup"),
  }));
  // A route change into a collapsed group opens it; a later manual collapse
  // while on the same route must stick, so the group is derived from the
  // last seen route rather than from an effect.
  const [seenGroup, setSeenGroup] = useState(currentGroup);
  if (seenGroup !== currentGroup) {
    setSeenGroup(currentGroup);
    if (currentGroup !== "daily" && !open[currentGroup])
      setOpen((previous) => ({ ...previous, [currentGroup]: true }));
  }

  const toggle = (id: RouteGroup["id"]) => {
    const next = !open[id];
    setOpen((previous) => ({ ...previous, [id]: next }));
    writeOpen(id, next);
  };

  return (
    <nav className="sidebar-nav" aria-label="Workspace views">
      {routeGroups.map((group) => {
        if (group.label === undefined)
          return group.routes.map((item) => (
            <NavLink
              key={item}
              item={item}
              current={route === item}
              onNavigate={onNavigate}
            />
          ));
        const expanded = open[group.id];
        const listId = `sidebar-group-${group.id}`;

        return (
          <div
            key={group.id}
            className="sidebar-group"
            data-open={expanded ? "true" : "false"}
          >
            <button
              type="button"
              className="sidebar-group-toggle"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => toggle(group.id)}
            >
              <ChevronRight
                className="nav-icon sidebar-group-chevron"
                aria-hidden="true"
              />
              {group.label}
            </button>
            <div id={listId} className="sidebar-group-items">
              {group.routes.map((item) => (
                <NavLink
                  key={item}
                  item={item}
                  current={route === item}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
};
