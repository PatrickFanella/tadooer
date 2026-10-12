import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, expect, it, vi } from "vitest";
import {
  clientRegistrationResponseSchema,
  readonlyFeedKinds,
  syncSnapshotResponseSchema,
  syncEntitySnapshotSchema,
  syncRoundResponseSchema,
  boardViewResponseSchema,
  counterHistoryResponseSchema,
  taskHistoryResponseSchema,
  planningPreferencesSchema,
} from "@suite/contracts";
import rawFixture from "./fixtures/readonly-feed.json";
import { LocalStore } from "./local-store.ts";
import { readCachedFeedResponse } from "./readonly-feed.ts";
import { getBoards, updateCapturePreferences } from "./api.ts";

const fixture = {
  ...rawFixture,
  snapshots: rawFixture.snapshots.map((value) =>
    syncEntitySnapshotSchema.parse(value),
  ),
};

afterEach(() => vi.unstubAllGlobals());
const initialize = async (indexedDb = new IDBFactory()) => {
  const store = new LocalStore({ indexedDb });
  await store.ensureClient(() =>
    Promise.resolve(clientRegistrationResponseSchema.parse(fixture.client)),
  );
  await store.replaceFromSnapshot(
    syncSnapshotResponseSchema.parse({
      protocolVersion: 2,
      snapshots: fixture.snapshots,
      nextCursor: fixture.cursor,
      hasMore: false,
      serverTimestamp: "2026-10-02T12:00:00.000Z",
    }),
  );
  return { store, indexedDb };
};
it("cold-opens all read-only feed kinds, derives boards, and preserves the one task outbox on resnapshot", async () => {
  const { store, indexedDb } = await initialize();
  const task = (await store.loadCachedTasks())[0];
  if (!task) throw new Error("Task fixture missing");
  await store.queueTaskPatch(task.task.id, { title: "Pending offline title" });
  const reopened = new LocalStore({ indexedDb });
  for (const kind of readonlyFeedKinds)
    expect(
      (await reopened.loadCachedEntities()).some((r) => r.entityKind === kind),
      kind,
    ).toBe(true);
  const board = fixture.snapshots.find((s) => s.entityKind === "board");
  if (!board) throw new Error("Board fixture missing");
  const view = boardViewResponseSchema.parse(
    await readCachedFeedResponse(
      "/api/boards/" + board.value.id,
      reopened,
      new Date("2026-10-02T12:00:00Z"),
    ),
  );
  expect(view.view.members.flatMap((m) => m.taskIds)).toContain(task.task.id);
  const counters = counterHistoryResponseSchema.parse(
    await readCachedFeedResponse(
      "/api/counters?from=2026-10-01&to=2026-10-03",
      reopened,
    ),
  );
  expect(counters.values[0]?.value).toBe(3);
  const history = taskHistoryResponseSchema.parse(
    await readCachedFeedResponse("/api/tasks/history", reopened),
  );
  expect(history.entries[0]?.task.title).toBe("Archived fixture");
  expect(
    await readCachedFeedResponse("/api/connectors/google", reopened),
  ).toBeUndefined();
  await reopened.replaceFromSnapshot(
    syncSnapshotResponseSchema.parse({
      protocolVersion: 2,
      snapshots: fixture.snapshots,
      nextCursor: fixture.cursor,
      hasMore: false,
      serverTimestamp: "2026-10-02T12:00:00.000Z",
    }),
  );
  expect(await reopened.loadOutbox()).toHaveLength(1);
  expect(
    (await reopened.loadCachedTasks()).find((t) => t.task.id === task.task.id)
      ?.task.title,
  ).toBe("Pending offline title");
  expect(
    planningPreferencesSchema.parse(await reopened.loadPlanningPreferences())
      .timeZone,
  ).toBe("America/Chicago");
});
it("uses the feed for network failure but does not mask authentication, provider, or mutation failures", async () => {
  const indexedDb = new IDBFactory();
  vi.stubGlobal("indexedDB", indexedDb);
  await initialize(indexedDb);
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new TypeError("Network unavailable"))),
  );
  expect(await getBoards()).toHaveLength(1);
  await expect(
    updateCapturePreferences({ urlBehavior: "keep" }, 0, "csrf"),
  ).rejects.toThrow("Network unavailable");
  for (const [status, code] of [
    [401, "AUTH_REQUIRED"],
    [403, "CSRF_INVALID"],
    [503, "PROVIDER_UNAVAILABLE"],
  ] as const) {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              code,
              message: "Refused",
              requestId: "00000000-0000-4000-8000-000000000001",
            }),
            { status },
          ),
        ),
      ),
    );
    await expect(getBoards()).rejects.toThrow("Refused");
  }
});

it("applies read-only tombstones and updates without consuming queued edits", async () => {
  const { store } = await initialize();
  const task = (await store.loadCachedTasks())[0];
  if (!task) throw new Error("Task fixture missing");
  await store.queueTaskPatch(task.task.id, { title: "Still queued" });
  const board = fixture.snapshots.find((s) => s.entityKind === "board");
  const series = fixture.snapshots.find(
    (s) => s.entityKind === "recurring_series",
  );
  if (!board || !series) throw new Error("Feed fixtures missing");
  await store.applySyncRound(
    syncRoundResponseSchema.parse({
      protocolVersion: 2,
      outcomes: [],
      nextCursor: fixture.cursor,
      hasMore: false,
      serverTimestamp: "2026-10-02T13:00:00Z",
      changes: [
        {
          sequence: 100,
          entityKind: "board",
          entityId: board.value.id,
          kind: "deleted",
          entityRevision: 100,
          changedAt: "2026-10-02T13:00:00Z",
          snapshot: null,
        },
        {
          sequence: 101,
          entityKind: "recurring_series",
          entityId: series.value.id,
          kind: "upsert",
          entityRevision: 101,
          changedAt: "2026-10-02T13:00:00Z",
          snapshot: {
            entityKind: "recurring_series",
            value: { ...series.value, state: "paused", revision: 2 },
          },
        },
      ],
    }),
  );
  expect(await readCachedFeedResponse("/api/boards", store)).toEqual({
    boards: [],
  });
  expect(
    await readCachedFeedResponse("/api/recurring-series", store),
  ).toMatchObject({ series: [{ state: "paused" }] });
  expect(await store.loadOutbox()).toHaveLength(1);
});
