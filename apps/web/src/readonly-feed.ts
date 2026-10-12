import {
  readonlyFeedKinds,
  readonlyFeedSnapshotSchema,
  type ReadonlyFeedKind,
  type ReadonlyFeedSnapshot,
} from "@suite/contracts";
import {
  planningDate,
  counterStreak,
  zonedCalendarDate,
  sortPanelTasks,
  taskMatchesPanel,
  type BoardTaskFacts,
} from "@suite/domain";
import { LocalStore } from "./local-store.ts";

/** Read-only projections of the authoritative IndexedDB feed. No response cache. */
export const readCachedFeedResponse = async (
  path: string,
  store = new LocalStore(),
  now = new Date(),
): Promise<unknown> => {
  const url = new URL(path, "http://local.invalid"),
    route = url.pathname;
  const supported =
    /^\/api\/(boards(?:\/[^/]+)?|sections|task-views|menu-folders|planning\/preferences|application\/preferences|notifications\/preferences|capture-preferences|counters|evaluations|tasks\/history|tasks\/[^/]+\/links|recurring-series(?:\/[^/]+)?)$/.test(
      route,
    );
  if (!supported) return undefined;
  if ((await store.clientIdentity()) === undefined) return undefined;
  const records = (await store.loadCachedEntities()).flatMap((record) => {
    if (!readonlyFeedKinds.includes(record.entityKind as ReadonlyFeedKind))
      return [];
    const parsed = readonlyFeedSnapshotSchema.safeParse({
      entityKind: record.entityKind,
      value: record.value,
    });
    return parsed.success ? [parsed.data] : [];
  });
  type Values = {
    [K in ReadonlyFeedKind]: Extract<
      ReadonlyFeedSnapshot,
      { entityKind: K }
    >["value"];
  };
  const values = <K extends ReadonlyFeedKind>(kind: K): Values[K][] =>
    records
      .filter((r) => r.entityKind === kind)
      .map((r) => r.value) as Values[K][];
  const withoutId = <T extends { id: string }>(value: T) => {
    const rest = { ...value };
    Reflect.deleteProperty(rest, "id");
    return rest as Omit<T, "id">;
  };
  const planning = values("planning_preferences")[0]?.preferences;
  if (planning === undefined) return undefined; // A complete, registered snapshot is required.
  const clock = {
    today: planningDate(now, planning.timeZone, planning.dayStartsAt),
    timeZone: planning.timeZone,
  };
  if (route === "/api/planning/preferences") return planning;
  if (route === "/api/notifications/preferences")
    return values("notification_preferences")[0]?.preferences;
  if (route === "/api/application/preferences") {
    const value = values("application_preferences")[0];
    return value && withoutId(value);
  }
  if (route === "/api/capture-preferences") {
    const value = values("capture_preferences")[0];
    return value && withoutId(value);
  }
  if (route === "/api/task-views")
    return { views: values("task_view").map(withoutId) };
  if (route === "/api/menu-folders")
    return {
      folders: values("menu_folder").sort((a, b) => a.position - b.position),
    };
  if (route === "/api/sections")
    return {
      sections: values("section")
        .filter(
          (s) =>
            s.contextKind === url.searchParams.get("contextKind") &&
            s.contextId === url.searchParams.get("contextId"),
        )
        .sort((a, b) => a.position - b.position),
    };
  const boards = values("board");
  const configuration = (board: (typeof boards)[number]) => {
    const configuration = { ...board };
    Reflect.deleteProperty(configuration, "manualOrder");
    return configuration as Omit<typeof board, "manualOrder">;
  };
  if (route === "/api/boards")
    return {
      boards: boards.sort((a, b) => a.position - b.position).map(configuration),
    };
  if (route.startsWith("/api/boards/")) {
    const board = boards.find(
      (b) => b.id === decodeURIComponent(route.split("/")[3] ?? ""),
    );
    if (!board) return undefined;
    const auxiliary = new Map(values("board_task").map((t) => [t.id, t]));
    const tasks = (await store.loadCachedTasks()).map(
      ({ task }): BoardTaskFacts => ({
        ...task,
        estimateMinutes: task.estimateMinutes ?? null,
        projectId: task.projectId ?? null,
        tagIds: task.tagIds ?? [],
        markers: auxiliary.get(task.id)?.markers ?? [],
        inBacklog: auxiliary.get(task.id)?.inBacklog ?? false,
        deadlineDate:
          task.deadline?.kind === "date" ? task.deadline.value : null,
        deadlineAt:
          task.deadline?.kind === "instant" ? task.deadline.value : null,
        plannedDay: task.plannedDay ?? null,
        plannedStart: task.plannedStart ?? null,
        parentId: task.parentId ?? null,
      }),
    );
    const members = board.panels.map((panel) => ({
      panelId: panel.id,
      taskIds: sortPanelTasks(
        tasks.filter((t) => taskMatchesPanel(t, panel.filter, clock)),
        panel.filter,
        board.manualOrder[panel.id] ?? [],
      ).map((t) => t.id),
    }));
    return {
      view: {
        board: configuration(board),
        today: clock.today,
        members,
        markers: Object.fromEntries(
          tasks
            .filter((t) => members.some((m) => m.taskIds.includes(t.id)))
            .map((t) => [t.id, t.markers]),
        ),
      },
    };
  }
  if (route === "/api/counters")
    return {
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      today: zonedCalendarDate(now, planning.timeZone),
      timeZone: planning.timeZone,
      generatedAt: now.toISOString(),
      counters: values("counter").map((counter) => ({
        ...counter,
        currentStreak: counter.streak.enabled
          ? counterStreak(
              counter.streak,
              new Map(
                values("counter_day")
                  .filter((value) => value.counterId === counter.id)
                  .map((value) => [value.day, value.value]),
              ),
              zonedCalendarDate(now, planning.timeZone),
            )
          : null,
      })),
      values: values("counter_day")
        .filter(
          (v) =>
            v.day >= (url.searchParams.get("from") ?? "") &&
            v.day <= (url.searchParams.get("to") ?? "9999"),
        )
        .map(withoutId),
    };
  if (route === "/api/evaluations")
    return {
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      timeZone: planning.timeZone,
      evaluations: values("evaluation").filter(
        (v) =>
          v.day >= (url.searchParams.get("from") ?? "") &&
          v.day <= (url.searchParams.get("to") ?? "9999"),
      ),
      focus: [],
    };
  if (route.endsWith("/links")) {
    const value = values("task_links").find(
      (v) => v.id === route.split("/")[3],
    );
    return value && withoutId(value);
  }
  if (route === "/api/recurring-series")
    return { series: values("recurring_series") };
  if (route.startsWith("/api/recurring-series/")) {
    const series = values("recurring_series").find(
      (v) => v.id === route.split("/")[3],
    );
    return series && { series };
  }
  if (route === "/api/tasks/history") {
    const all = values("archived_task").map(withoutId),
      query = (url.searchParams.get("query") ?? "").toLowerCase();
    const top = all
      .filter(
        (v) =>
          v.task.parentId == null ||
          !all.some((p) => p.task.id === v.task.parentId),
      )
      .map((v) => ({
        ...v,
        children: all.filter((c) => c.task.parentId === v.task.id),
      }))
      .filter((v) =>
        [v, ...v.children].some((x) =>
          (x.task.title + " " + x.task.notes).toLowerCase().includes(query),
        ),
      )
      .sort(
        (a, b) =>
          (b.task.archivedAt ?? "").localeCompare(a.task.archivedAt ?? "") ||
          a.task.id.localeCompare(b.task.id),
      );
    const cursor = url.searchParams.get("cursor");
    if (cursor !== null && !/^offline_\d+$/.test(cursor)) return undefined;
    const offset = Number(cursor?.slice(8) ?? 0),
      limit = 100;
    return {
      entries: top.slice(offset, offset + limit),
      total: top.length,
      nextCursor:
        offset + limit < top.length
          ? `offline_${String(offset + limit)}`
          : null,
    };
  }
  return undefined;
};
