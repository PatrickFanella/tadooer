export const workspaceRoutes = [
  "today",
  "inbox",
  "planner",
  "tasks",
  "boards",
  "history",
  "worklog",
  "counters",
  "reuse",
  "habits",
  "connections",
  "settings",
] as const;

export type WorkspaceRoute = (typeof workspaceRoutes)[number];

/**
 * Issue #175: the sidebar shows the views used daily; records and setup
 * sit in named groups. Every route stays reachable by URL and command bar.
 */
export interface RouteGroup {
  readonly id: "daily" | "records" | "setup";
  /** Omitted for the daily group, which has no heading. */
  readonly label?: string;
  readonly routes: readonly WorkspaceRoute[];
}

export const routeGroups: readonly RouteGroup[] = [
  {
    id: "daily",
    routes: ["today", "inbox", "planner", "tasks", "boards", "habits"],
  },
  {
    id: "records",
    label: "Records",
    routes: ["history", "worklog", "counters", "reuse"],
  },
  { id: "setup", label: "Setup", routes: ["connections", "settings"] },
];

export const routeGroupOf = (route: WorkspaceRoute): RouteGroup["id"] =>
  routeGroups.find((group) => group.routes.includes(route))?.id ?? "daily";

export const routeFromPath = (path: string): WorkspaceRoute => {
  const candidate = path.replace(/^\//, "").split("/")[0];
  return workspaceRoutes.find((route) => route === candidate) ?? "today";
};

/** Issue #171: the Tasks page has two sections, the list and Organize. */
export const tasksSections = ["list", "organize"] as const;
export type TasksSection = (typeof tasksSections)[number];

export const tasksSectionFromPath = (path: string): TasksSection => {
  const [route, second] = path.replace(/^\//, "").split("/");
  return route === "tasks" && second === "organize" ? "organize" : "list";
};

export const tasksSectionPath = (section: TasksSection): string =>
  section === "organize" ? "/tasks/organize" : "/tasks";

export const routeLabel = (route: WorkspaceRoute): string =>
  route === "reuse" ? "Reuse" : route.charAt(0).toUpperCase() + route.slice(1);
