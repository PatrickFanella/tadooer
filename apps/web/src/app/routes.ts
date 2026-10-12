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
