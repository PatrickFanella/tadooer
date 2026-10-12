import {
  readonlyFeedSnapshotSchema,
  type ReadonlyFeedKind,
  type ReadonlyFeedSnapshot,
} from "@suite/contracts";
import type { SuiteDatabase } from "@suite/persistence";
import {
  counterResponse,
  counterDayValueResponse,
  evaluationResponse,
} from "./routes/counters.ts";
import { ownerToday, recurringSeriesResponse } from "./routes/recurrence.ts";
import { taskLinksResponse } from "./routes/task-links.ts";
import { archivedTask } from "./routes/task-archive.ts";

export const readonlyFeedSnapshot = (
  database: SuiteDatabase,
  ownerId: string,
  kind: ReadonlyFeedKind,
  id: string,
  now: Date,
): ReadonlyFeedSnapshot | null => {
  let value: unknown;
  switch (kind) {
    case "board": {
      const board = database.boards.getBoard(ownerId, id);
      if (board)
        value = {
          ...board,
          manualOrder: database.readonlyFeed.boardOrder(ownerId, id),
        };
      break;
    }
    case "board_task":
      value = database.readonlyFeed.boardTask(ownerId, id);
      break;
    case "section":
      value = database.boards.getSection(ownerId, id);
      break;
    case "task_view": {
      const view = database.boards
        .listTaskViews(ownerId)
        .find((x) => x.contextKind + ":" + x.contextId === id);
      if (view) value = { ...view, id };
      break;
    }
    case "menu_folder":
      value = database.boards.getMenuFolder(ownerId, id);
      break;
    case "application_preferences":
      value = { id, ...database.applicationPreferences.get(ownerId) };
      break;
    case "planning_preferences":
      value = {
        id,
        revision: database.getPreferenceRevision(ownerId, "planning"),
        preferences: database.getPlanningPreferences(ownerId),
      };
      break;
    case "notification_preferences":
      value = {
        id,
        revision: database.getPreferenceRevision(ownerId, "notifications"),
        preferences: database.getNotificationPreferences(ownerId),
      };
      break;
    case "capture_preferences":
      {
        const preferences = database.capture.getPreferences(ownerId);
        value = {
          id,
          revision: preferences.revision,
          preferences: { urlBehavior: preferences.urlBehavior },
        };
      }
      break;
    case "counter": {
      const counter = database.counters.get(ownerId, id);
      if (counter)
        value = counterResponse(
          counter,
          database.counters.currentStreak(
            counter,
            ownerToday(database, ownerId, now).today,
          ),
        );
      break;
    }
    case "counter_day": {
      const [, counterId, day] = id.split(":");
      if (counterId && day) {
        const record = database.counters.dayValue(ownerId, counterId, day);
        if (record) value = { id, ...counterDayValueResponse(record) };
      }
      break;
    }
    case "evaluation": {
      const evaluation = database.counters.getEvaluationById(ownerId, id);
      if (evaluation) value = evaluationResponse(evaluation);
      break;
    }
    case "task_links": {
      const task = database.getTask(ownerId, id, true);
      const links =
        task?.deletedAt == null
          ? database.taskLinks.get(ownerId, id)
          : undefined;
      if (links) value = { id, ...taskLinksResponse(links) };
      break;
    }
    case "archived_task": {
      const record = database.taskArchive.readArchived(ownerId, id);
      if (record) value = { id, ...archivedTask(record) };
      break;
    }
    case "recurring_series": {
      const series = database.recurrence.get(ownerId, id);
      if (series)
        value = recurringSeriesResponse(
          database,
          series,
          ownerToday(database, ownerId, now).today,
        );
      break;
    }
  }
  return value === undefined
    ? null
    : readonlyFeedSnapshotSchema.parse({ entityKind: kind, value });
};
export const readonlyFeedSnapshotBuilders = (
  database: SuiteDatabase,
  ownerId: string,
  now: Date,
): readonly (() => ReadonlyFeedSnapshot)[] =>
  database.readonlyFeed.keys(ownerId).map(({ kind, id }) => () => {
    const snapshot = readonlyFeedSnapshot(database, ownerId, kind, id, now);
    if (snapshot === null)
      throw new Error("Feed snapshot changed; retry the snapshot");
    return snapshot;
  });
