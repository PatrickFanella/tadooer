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

/**
 * Issue #194: a location is a view route or a project/tag context that
 * renders the Tasks list with a fixed filter. `/projects/<id>` and
 * `/tags/<id>`; anything else parses like `routeFromPath`.
 */
export type Location =
  | { readonly route: WorkspaceRoute }
  | { readonly route: "project"; readonly id: string }
  | { readonly route: "tag"; readonly id: string };

const contextPrefixes = { projects: "project", tags: "tag" } as const;

export const locationFromPath = (path: string): Location => {
  const [first, second] = path.replace(/^\//, "").split("/");
  const kind =
    first === "projects" || first === "tags" ? contextPrefixes[first] : null;
  if (kind !== null) {
    if (second === undefined || second === "") return { route: "tasks" };
    return { route: kind, id: decodeURIComponent(second) };
  }
  return { route: routeFromPath(path) };
};

export const pathForLocation = (location: Location): string =>
  location.route === "project"
    ? `/projects/${encodeURIComponent(location.id)}`
    : location.route === "tag"
      ? `/tags/${encodeURIComponent(location.id)}`
      : `/${location.route}`;

/** The view that renders a location; contexts render the Tasks page. */
export const routeOf = (location: Location): WorkspaceRoute =>
  location.route === "project" || location.route === "tag"
    ? "tasks"
    : location.route;

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
