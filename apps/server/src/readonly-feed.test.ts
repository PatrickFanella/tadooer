import { SuiteDatabase } from "@suite/persistence";
import { readonlyFeedSnapshot } from "./readonly-feed.ts";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import {
  readonlyFeedKinds,
  clientRegistrationResponseSchema,
  syncRoundResponseSchema,
  syncSnapshotResponseSchema,
  type SyncEntitySnapshot,
  type Task,
  type Tag,
  type Board,
  type RecurringSeries,
  type ApplicationPreferences,
  type TaskAttachment,
} from "@suite/contracts";
import { withTemporaryDirectory } from "@suite/test-support";
import { ManualSessionClock } from "@suite/domain";
import type { ServerConfig } from "./config.ts";
import { startSuiteServer, type RunningSuiteServer } from "./server.ts";
const configuration = (directory: string): ServerConfig => ({
  host: "127.0.0.1",
  port: 0,
  databasePath: join(directory, "suite.sqlite"),
  webRoot: join(directory, "web"),
  baikalEndpoint: "http://baikal.test/dav.php/",
  credentialKeyPath: join(directory, "credential.key"),
  secureCookies: false,
  build: { version: "test", revision: "test", builtAt: null },
});

const clockAt = "2026-10-02T12:00:00.000Z";
const day = "2026-10-02";

const signIn = async (server: RunningSuiteServer) => {
  const owner = {
    username: "worklog",
    displayName: "Worklog",
    password: "a sufficiently long disposable password",
  };
  await fetch(`${server.baseUrl}/api/setup`, {
    method: "POST",
    headers: { Origin: server.baseUrl, "Content-Type": "application/json" },
    body: JSON.stringify(owner),
  });
  const login = await fetch(`${server.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { Origin: server.baseUrl, "Content-Type": "application/json" },
    body: JSON.stringify(owner),
  });
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
  const { csrfToken } = (await login.json()) as { csrfToken: string };
  return (
    path: string,
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    fetch(`${server.baseUrl}${path}`, {
      method,
      headers: {
        Origin: server.baseUrl,
        Cookie: cookie,
        "X-CSRF-Token": csrfToken,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
};

it("feeds all read-only families atomically over HTTP, paginates and sends deletion and derived-state changes", async () => {
  await withTemporaryDirectory(async (directory) => {
    await mkdir(join(directory, "web"));
    const server = await startSuiteServer(configuration(directory), {
      disableNotificationTimer: true,
      sessionClock: new ManualSessionClock(clockAt),
    });
    try {
      const call = await signIn(server);
      const client = clientRegistrationResponseSchema.parse(
        await (
          await call("/api/clients", "POST", {
            label: "Offline feed qualification",
          })
        ).json(),
      );
      const proof = {
        "X-Suite-Client-Id": client.client.id,
        "X-Suite-Client-Credential": client.clientCredential,
        "X-Suite-Sync-Version": "2",
      };
      const json = async (
        path: string,
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET",
        body?: unknown,
        headers: Record<string, string> = {},
      ) => {
        const response = await call(path, method, body, headers);
        const value: unknown = await response.json();
        expect(response.status, JSON.stringify(value)).toBeLessThan(300);
        return value as {
          task: Task;
          tag: Tag;
          board: Board;
          series: RecurringSeries;
          preferences: ApplicationPreferences;
          revision: number;
          attachments: TaskAttachment[];
        };
      };
      const before = syncRoundResponseSchema.parse(
        await (
          await call(
            "/api/sync/round",
            "POST",
            { cursor: null, operations: [], pullLimit: 200 },
            proof,
          )
        ).json(),
      );
      const peer = clientRegistrationResponseSchema.parse(
        await (
          await call("/api/clients", "POST", { label: "Second device" })
        ).json(),
      );
      const peerProof = {
        "X-Suite-Client-Id": peer.client.id,
        "X-Suite-Client-Credential": peer.clientCredential,
        "X-Suite-Sync-Version": "2",
      };
      const task = (
        await json(
          "/api/tasks",
          "POST",
          { title: "Active fixture" },
          { "Idempotency-Key": randomUUID() },
        )
      ).task;
      const archived = (
        await json(
          "/api/tasks",
          "POST",
          { title: "Archived fixture" },
          { "Idempotency-Key": randomUUID() },
        )
      ).task;
      const tag = (await json("/api/tags", "POST", { title: "Fixture" })).tag;
      const board = (await json("/api/boards", "POST", { template: "kanban" }))
        .board;
      await json(
        `/api/boards/${board.id}/panels/${board.panels[1]?.id ?? "missing-panel"}/tasks`,
        "POST",
        {
          taskId: task.id,
          expectedRevision: board.revision,
          taskRevision: task.revision,
          dryRun: false,
        },
      );
      await json("/api/sections", "POST", {
        contextKind: "tag",
        contextId: tag.id,
        title: "Section fixture",
      });
      await json("/api/task-views", "PUT", {
        contextKind: "all",
        contextId: "",
        expectedRevision: 0,
        sortBy: "name",
      });
      await json("/api/menu-folders", "POST", {
        kind: "tag",
        title: "Folder fixture",
        itemIds: [tag.id],
      });
      const planning = await json("/api/planning/preferences");
      await json("/api/planning/preferences", "PUT", planning);
      const notifications = await json("/api/notifications/preferences");
      await json("/api/notifications/preferences", "PUT", notifications);
      const application = await json("/api/application/preferences");
      await json("/api/application/preferences", "PUT", {
        expectedRevision: application.revision,
        preferences: application.preferences,
      });
      await json("/api/capture-preferences", "PUT", {
        expectedRevision: 0,
        preferences: { urlBehavior: "extract" },
      });
      const counter = randomUUID();
      await json("/api/counters", "POST", {
        id: counter,
        title: "Fixture count",
        kind: "click",
      });
      await json(`/api/counters/${counter}/days/${day}`, "POST", {
        action: "set",
        value: 3,
        expectedRevision: 0,
      });
      await json(`/api/evaluations/${day}`, "PUT", {
        expectedRevision: 0,
        notes: "Fixture reflection",
      });
      const links = await json(`/api/tasks/${task.id}/attachments`, "POST", {
        kind: "link",
        title: "Fixture reference",
        url: "https://example.test/reference",
      });
      await json(
        `/api/tasks/${archived.id}/archive`,
        "POST",
        {},
        { "If-Match": `"${String(archived.revision)}"` },
      );
      const series = (
        await json(
          "/api/recurring-series",
          "POST",
          {
            title: "Recurring fixture",
            rule: { cycle: "daily", interval: 1 },
            startDate: day,
          },
          { "Idempotency-Key": randomUUID() },
        )
      ).series;
      const readDb = SuiteDatabase.open(configuration(directory).databasePath);
      try {
        for (const key of readDb.readonlyFeed.keys(client.client.ownerId)) {
          try {
            readonlyFeedSnapshot(
              readDb,
              client.client.ownerId,
              key.kind,
              key.id,
              new Date(clockAt),
            );
          } catch (error) {
            throw new Error(key.kind + ":" + key.id, { cause: error });
          }
        }
      } finally {
        readDb.close();
      }
      const round = syncRoundResponseSchema.parse(
        await (
          await call(
            "/api/sync/round",
            "POST",
            { cursor: before.nextCursor, operations: [], pullLimit: 200 },
            proof,
          )
        ).json(),
      );
      for (const kind of readonlyFeedKinds)
        expect(
          round.changes.some((c) => c.entityKind === kind),
          kind,
        ).toBe(true);
      // More than one wire page, including historical counter values.
      const peerResponse = await call(
        "/api/sync/round",
        "POST",
        { cursor: peer.initialCursor, operations: [], pullLimit: 200 },
        peerProof,
      );
      expect(peerResponse.status).toBe(200);
      const peerRound = syncRoundResponseSchema.parse(
        await peerResponse.json(),
      );
      expect(
        peerRound.changes.filter((change) =>
          readonlyFeedKinds.includes(
            change.entityKind as (typeof readonlyFeedKinds)[number],
          ),
        ),
      ).toEqual(
        round.changes.filter((change) =>
          readonlyFeedKinds.includes(
            change.entityKind as (typeof readonlyFeedKinds)[number],
          ),
        ),
      );
      const seed = new DatabaseSync(configuration(directory).databasePath);
      for (let index = 0; index < 205; index++) {
        const date = new Date(Date.UTC(2026, 0, 1 + index))
          .toISOString()
          .slice(0, 10);
        seed
          .prepare(
            "INSERT INTO counter_day_values(owner_id,counter_id,day,value,revision,updated_at) VALUES(?,?,?,?,1,?)",
          )
          .run(client.client.ownerId, counter, date, index, clockAt);
      }
      seed.close();
      const snapshots: SyncEntitySnapshot[] = [];
      let snapshotCursor = round.nextCursor;
      let offset = 0,
        hasMore = true;
      while (hasMore) {
        const response = await call(
          `/api/sync/snapshot?offset=${String(offset)}`,
          "GET",
          undefined,
          proof,
        );
        expect(response.status).toBe(200);
        const page = syncSnapshotResponseSchema.parse(await response.json());
        expect(page.snapshots.length).toBeLessThanOrEqual(200);
        snapshots.push(...page.snapshots);
        snapshotCursor = page.nextCursor;
        offset += page.snapshots.length;
        hasMore = page.hasMore;
        expect(offset).toBeLessThan(400);
      }
      for (const kind of readonlyFeedKinds)
        expect(
          snapshots.some((s) => s.entityKind === kind),
          kind,
        ).toBe(true);
      expect(
        new Set(
          snapshots.map(
            (s) =>
              s.entityKind +
              ":" +
              ("id" in s.value ? s.value.id : JSON.stringify(s.value)),
          ),
        ).size,
      ).toBe(snapshots.length);
      // Fixture output is deliberately opt-in, for native-browser qualification only.
      if (process.env.TADOOER_FEED_FIXTURE_PATH)
        await writeFile(
          process.env.TADOOER_FEED_FIXTURE_PATH,
          JSON.stringify({
            client,
            snapshots,
            cursor: round.nextCursor,
          }),
        );
      const sql = new DatabaseSync(configuration(directory).databasePath);
      const count = () =>
        (
          sql.prepare("SELECT count(*) AS n FROM sync_changes").get() as {
            n: number;
          }
        ).n;
      const initial = count();
      sql.exec("BEGIN");
      sql
        .prepare("UPDATE boards SET title='Rolled back' WHERE id=?")
        .run(board.id);
      expect(count()).toBeGreaterThan(initial);
      sql.exec("ROLLBACK");
      expect(count()).toBe(initial);
      sql.close();
      await call(`/api/boards/${board.id}`, "DELETE", undefined, {
        "If-Match": `"${String(board.revision + 1)}"`,
      });
      await call(
        `/api/tasks/${task.id}/attachments/${links.attachments[0]?.id ?? "missing-attachment"}`,
        "DELETE",
        undefined,
        { "If-Match": '"1"' },
      );
      await json(`/api/counters/${counter}/days/${day}`, "POST", {
        action: "increment",
        delta: 1,
        expectedRevision: 1,
      });
      await json(
        `/api/recurring-series/${series.id}/state`,
        "POST",
        { action: "pause" },
        { "If-Match": `"${String(series.revision)}"` },
      );
      const after = syncRoundResponseSchema.parse(
        await (
          await call(
            "/api/sync/round",
            "POST",
            { cursor: snapshotCursor, operations: [], pullLimit: 200 },
            proof,
          )
        ).json(),
      );
      expect(
        after.changes.find(
          (c) => c.entityKind === "board" && c.entityId === board.id,
        ),
      ).toMatchObject({ kind: "deleted", snapshot: null });
      expect(after.changes.some((c) => c.entityKind === "counter")).toBe(true);
      expect(
        after.changes.find((c) => c.entityKind === "task_links")?.snapshot,
      ).toMatchObject({ value: { attachments: [] } });
    } finally {
      await server.close();
    }
  });
});
