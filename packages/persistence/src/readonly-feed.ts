import type { DatabaseSync } from "node:sqlite";
import type { ReadonlyFeedKind } from "@suite/contracts";

// Triggers are on persistence tables, so browser, assistant, imports and ticks
// share the same transaction boundary. Only explicitly reviewed tables appear.
interface Source {
  table: string;
  kind: ReadonlyFeedKind;
  owner: string;
  key: string;
  when?: string;
  archived?: boolean;
}
const sources: readonly Source[] = [
  { table: "boards", kind: "board", owner: "ROW.owner_id", key: "ROW.id" },
  {
    table: "board_panels",
    kind: "board",
    owner: "ROW.owner_id",
    key: "ROW.board_id",
  },
  {
    table: "board_panel_tasks",
    kind: "board",
    owner: "(SELECT owner_id FROM board_panels WHERE id=ROW.panel_id)",
    key: "(SELECT board_id FROM board_panels WHERE id=ROW.panel_id)",
  },
  {
    table: "task_board_markers",
    kind: "board_task",
    owner: "ROW.owner_id",
    key: "ROW.task_id",
  },
  {
    table: "project_backlog_tasks",
    kind: "board_task",
    owner: "ROW.owner_id",
    key: "ROW.task_id",
  },
  { table: "sections", kind: "section", owner: "ROW.owner_id", key: "ROW.id" },
  {
    table: "section_tasks",
    kind: "section",
    owner: "(SELECT owner_id FROM sections WHERE id=ROW.section_id)",
    key: "ROW.section_id",
  },
  {
    table: "task_views",
    kind: "task_view",
    owner: "ROW.owner_id",
    key: "ROW.context_kind || ':' || ROW.context_id",
  },
  {
    table: "menu_folders",
    kind: "menu_folder",
    owner: "ROW.owner_id",
    key: "ROW.id",
  },
  {
    table: "menu_folder_items",
    kind: "menu_folder",
    owner: "(SELECT owner_id FROM menu_folders WHERE id=ROW.folder_id)",
    key: "ROW.folder_id",
  },
  {
    table: "owner_application_preferences",
    kind: "application_preferences",
    owner: "ROW.owner_id",
    key: "ROW.owner_id",
  },
  {
    table: "owner_planning_preferences",
    kind: "planning_preferences",
    owner: "ROW.owner_id",
    key: "ROW.owner_id",
  },
  {
    table: "owner_notification_preferences",
    kind: "notification_preferences",
    owner: "ROW.owner_id",
    key: "ROW.owner_id",
  },
  {
    table: "owner_capture_preferences",
    kind: "capture_preferences",
    owner: "ROW.owner_id",
    key: "ROW.owner_id",
  },
  { table: "counters", kind: "counter", owner: "ROW.owner_id", key: "ROW.id" },
  {
    table: "counter_day_values",
    kind: "counter_day",
    owner: "ROW.owner_id",
    key: "'counter-day:' || ROW.counter_id || ':' || ROW.day",
  },
  {
    table: "daily_evaluations",
    kind: "evaluation",
    owner: "ROW.owner_id",
    key: "ROW.id",
  },
  {
    table: "task_issue_links",
    kind: "task_links",
    owner: "ROW.owner_id",
    key: "ROW.task_id",
  },
  {
    table: "task_attachments",
    kind: "task_links",
    owner: "ROW.owner_id",
    key: "ROW.task_id",
  },
  {
    table: "tasks",
    kind: "archived_task",
    owner: "ROW.owner_id",
    key: "ROW.id",
    archived: true,
  },
  {
    table: "task_archive_provenance",
    kind: "archived_task",
    owner: "ROW.owner_id",
    key: "ROW.task_id",
  },
  {
    table: "task_historical_references",
    kind: "archived_task",
    owner: "ROW.owner_id",
    key: "ROW.task_id",
  },
  {
    table: "recurring_series",
    kind: "recurring_series",
    owner: "ROW.owner_id",
    key: "ROW.id",
  },
  {
    table: "recurring_occurrences",
    kind: "recurring_series",
    owner: "ROW.owner_id",
    key: "ROW.series_id",
  },
  {
    table: "recurring_task_links",
    kind: "recurring_series",
    owner: "ROW.owner_id",
    key: "ROW.series_id",
  },
];
const now = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const append = (source: Source, row: "OLD" | "NEW", condition = "1") => {
  const owner = source.owner.replaceAll("ROW", row),
    key = source.key.replaceAll("ROW", row);
  return `INSERT OR IGNORE INTO sync_owner_state(owner_id,epoch,next_sequence,updated_at) SELECT ${owner},lower(hex(randomblob(16))),1,${now} WHERE NOT EXISTS(SELECT 1 FROM sync_owner_state WHERE owner_id=${owner}) AND EXISTS(SELECT 1 FROM owner_accounts WHERE id=${owner}) AND ${key} IS NOT NULL AND (${condition});
 INSERT INTO sync_changes(owner_id,epoch,sequence,entity_type,entity_id,kind,revision,created_at)
 SELECT owner_id,epoch,next_sequence,'${source.kind}',${key},'upsert',next_sequence,${now} FROM sync_owner_state WHERE owner_id=${owner} AND ${key} IS NOT NULL AND EXISTS(SELECT 1 FROM owner_accounts WHERE id=${owner}) AND (${condition});
 UPDATE sync_owner_state SET next_sequence=next_sequence+1,updated_at=${now} WHERE owner_id=${owner} AND ${key} IS NOT NULL AND EXISTS(SELECT 1 FROM owner_accounts WHERE id=${owner}) AND (${condition});`;
};
export const completeReadonlyFeedMigration = {
  id: "0054_complete_readonly_feed_coverage",
  sql:
    sources
      .flatMap((source) =>
        ["INSERT", "UPDATE", "DELETE"].map((operation) => {
          const row = operation === "DELETE" ? "OLD" : "NEW";
          const condition = source.archived
            ? operation === "UPDATE"
              ? "WHEN OLD.archived_at IS NOT NULL OR NEW.archived_at IS NOT NULL"
              : `WHEN ${row}.archived_at IS NOT NULL`
            : "";
          const oldOwner = source.owner.replaceAll("ROW", "OLD"),
            newOwner = source.owner.replaceAll("ROW", "NEW"),
            oldKey = source.key.replaceAll("ROW", "OLD"),
            newKey = source.key.replaceAll("ROW", "NEW");
          const oldChange =
            operation === "UPDATE"
              ? append(
                  source,
                  "OLD",
                  `${oldOwner} IS NOT ${newOwner} OR ${oldKey} IS NOT ${newKey}`,
                )
              : "";
          return `CREATE TRIGGER complete_feed_${source.table}_${operation.toLowerCase()} AFTER ${operation} ON ${source.table} ${condition} BEGIN ${append(source, row)} ${source.kind === "counter_day" ? append({ table: source.table, kind: "counter", owner: source.owner, key: "ROW.counter_id" }, row) : ""} ${oldChange} END;`;
        }),
      )
      .join("\n") +
    `
 ${["UPDATE", "DELETE"]
   .map((operation) => {
     const row = operation === "DELETE" ? "OLD" : "NEW";
     return `CREATE TRIGGER complete_feed_task_dependents_${operation.toLowerCase()} AFTER ${operation} ON tasks ${operation === "UPDATE" ? "WHEN OLD.deleted_at IS NOT NEW.deleted_at OR OLD.archived_at IS NOT NEW.archived_at" : ""} BEGIN
 ${append({ table: "tasks", kind: "board_task", owner: "ROW.owner_id", key: "ROW.id" }, row)}
 ${append({ table: "tasks", kind: "task_links", owner: "ROW.owner_id", key: "ROW.id" }, row)}
 ${append({ table: "tasks", kind: "recurring_series", owner: "ROW.owner_id", key: "(SELECT series_id FROM recurring_task_links WHERE task_id=ROW.id AND owner_id=ROW.owner_id)" }, row)}
 END;`;
   })
   .join("\n")}
 DELETE FROM sync_changes;
 UPDATE sync_owner_state SET epoch=lower(hex(randomblob(16))),next_sequence=1,retained_floor=0,updated_at=${now};`,
};

export interface ReadonlyFeedKey {
  readonly kind: ReadonlyFeedKind;
  readonly id: string;
}
export class ReadonlyFeedStore {
  constructor(private readonly db: DatabaseSync) {}
  keys(ownerId: string): readonly ReadonlyFeedKey[] {
    const entries = new Map<string, ReadonlyFeedKey>();
    for (const source of sources) {
      const owner = source.owner.replaceAll("ROW", "r"),
        key = source.key.replaceAll("ROW", "r");
      const taskCondition =
        source.kind === "archived_task"
          ? "AND t.archived_at IS NOT NULL"
          : source.kind === "board_task"
            ? "AND t.archived_at IS NULL"
            : "";
      const needsTask =
        source.kind === "archived_task" ||
        source.kind === "board_task" ||
        source.kind === "task_links";
      const predicate = needsTask
        ? `AND EXISTS(SELECT 1 FROM tasks t WHERE t.owner_id=? AND t.id=${key} AND t.deleted_at IS NULL ${taskCondition})`
        : "";
      for (const row of this.db
        .prepare(
          `SELECT DISTINCT ${key} AS id FROM ${source.table} r WHERE ${owner}=? ${predicate}`,
        )
        .all(...(needsTask ? [ownerId, ownerId] : [ownerId]))) {
        if (row.id != null) {
          const id = String(row.id);
          entries.set(source.kind + ":" + id, { kind: source.kind, id });
        }
      }
    }
    for (const kind of [
      "application_preferences",
      "planning_preferences",
      "notification_preferences",
      "capture_preferences",
    ] as const)
      entries.set(kind + ":" + ownerId, { kind, id: ownerId });
    return [...entries.values()].sort(
      (a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id),
    );
  }
  boardOrder(ownerId: string, boardId: string): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const row of this.db
      .prepare(
        `SELECT p.id AS panel_id,t.task_id FROM board_panels p JOIN board_panel_tasks t ON t.panel_id=p.id WHERE p.owner_id=? AND p.board_id=? ORDER BY p.position,p.id,t.position,t.task_id`,
      )
      .all(ownerId, boardId))
      (result[String(row.panel_id)] ??= []).push(String(row.task_id));
    return result;
  }
  boardTask(
    ownerId: string,
    taskId: string,
  ):
    | {
        id: string;
        markers: ("urgent" | "important" | "in_progress")[];
        inBacklog: boolean;
      }
    | undefined {
    if (
      !this.db
        .prepare(
          "SELECT 1 FROM tasks WHERE owner_id=? AND id=? AND deleted_at IS NULL AND archived_at IS NULL",
        )
        .get(ownerId, taskId)
    )
      return undefined;
    const markers = this.db
      .prepare(
        "SELECT marker FROM task_board_markers WHERE owner_id=? AND task_id=? ORDER BY marker",
      )
      .all(ownerId, taskId)
      .map((x) => String(x.marker) as "urgent" | "important" | "in_progress");
    return {
      id: taskId,
      markers,
      inBacklog:
        this.db
          .prepare(
            "SELECT 1 FROM project_backlog_tasks WHERE owner_id=? AND task_id=?",
          )
          .get(ownerId, taskId) !== undefined,
    };
  }
}
