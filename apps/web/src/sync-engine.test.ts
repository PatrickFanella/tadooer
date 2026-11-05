import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ClientRegistrationResponse,
  SyncRoundResponse,
  SyncRoundRequest,
} from "@suite/contracts";
import { createSyncTransport } from "./api.ts";
import { LocalStore } from "./local-store.ts";
import {
  installOnlineSync,
  SyncCursorResetRequired,
  SyncEngine,
} from "./sync-engine.ts";

const clientId = "d1054acd-c04d-4bd8-a814-254b007154ba";
const registration: ClientRegistrationResponse = {
  client: {
    id: clientId,
    ownerId: "1b34cc57-972c-42e8-bafa-0ba455dced20",
    label: "Test client",
  },
  clientCredential: "A".repeat(43),
  protocolVersion: 2 as const,
  initialCursor: "sync-v1.epoch.0.tag",
};

let store: LocalStore | undefined;

afterEach(async () => {
  vi.unstubAllGlobals();
  await store?.close();
  store = undefined;
  await new Promise<void>((resolveDelete, rejectDelete) => {
    const request = indexedDB.deleteDatabase("suite-local-v1");
    request.onsuccess = () => resolveDelete();
    request.onerror = () =>
      rejectDelete(request.error ?? new Error("IndexedDB delete failed"));
  });
});

describe("SyncEngine", () => {
  it("does not send the outbox until a failed upgrade snapshot succeeds, including after restart", async () => {
    store = new LocalStore({ indexedDb: indexedDB });
    await store.ensureClient(() => Promise.resolve(registration));
    await store.queueTaskCreate({ title: "Preserved offline task" });
    const before = await store.loadOutbox();
    const proofBefore = await store.clientIdentity();
    const syncRound = vi.fn(() =>
      Promise.resolve({
        outcomes: [],
        changes: [],
        nextCursor: "sync-v1.epoch.4.tag",
        hasMore: false,
        protocolVersion: 2 as const,
        serverTimestamp: "2026-08-06T16:00:00.000Z",
      } satisfies SyncRoundResponse),
    );
    const transport = {
      registerClient: vi.fn(() => Promise.resolve(registration)),
      snapshot: vi.fn(() => Promise.reject(new Error("Snapshot unavailable"))),
      syncRound,
    };
    await expect(new SyncEngine(store, transport).sync()).rejects.toThrow(
      "Snapshot unavailable",
    );
    expect(syncRound).not.toHaveBeenCalled();
    expect(await store.loadOutbox()).toEqual(before);
    expect(await store.clientIdentity()).toEqual(proofBefore);
    await store.close();
    store = new LocalStore({ indexedDb: indexedDB });
    await new SyncEngine(store, {
      ...transport,
      snapshot: () =>
        Promise.resolve({
          snapshots: [],
          nextCursor: "sync-v1.epoch.4.tag",
          hasMore: false,
          protocolVersion: 2 as const,
          serverTimestamp: "2026-08-06T16:00:00.000Z",
        }),
    }).sync();
    expect(syncRound).toHaveBeenCalledWith(
      expect.objectContaining({ clientId }),
      {
        cursor: "sync-v1.epoch.4.tag",
        operations: before.map(({ operation }) => operation),
        pullLimit: 100,
      },
    );
    expect(transport.registerClient).not.toHaveBeenCalled();
    expect(await store.requiresSnapshot()).toBe(false);
  });

  it("uses the persisted client proof and only queued operations", async () => {
    store = new LocalStore({ indexedDb: indexedDB });
    const syncRound = vi.fn(() =>
      Promise.resolve({
        outcomes: [],
        changes: [],
        nextCursor: "sync-v1.epoch.0.tag",
        hasMore: false,
        protocolVersion: 2 as const,
        serverTimestamp: "2026-08-06T16:00:00.000Z",
      } satisfies SyncRoundResponse),
    );
    const engine = new SyncEngine(store, {
      registerClient: () => Promise.resolve(registration),
      snapshot: () =>
        Promise.resolve({
          snapshots: [],
          nextCursor: "sync-v1.epoch.0.tag",
          hasMore: false,
          protocolVersion: 2 as const,
          serverTimestamp: "2026-08-06T16:00:00.000Z",
        }),
      syncRound,
    });

    await engine.sync();

    expect(syncRound).toHaveBeenCalledWith(
      expect.objectContaining({ clientId, clientCredential: "A".repeat(43) }),
      { cursor: "sync-v1.epoch.0.tag", operations: [], pullLimit: 100 },
    );
  });

  it("resets from a bounded snapshot and retries an expired cursor", async () => {
    store = new LocalStore({ indexedDb: indexedDB });
    let attempts = 0;
    const snapshot = vi.fn(() =>
      Promise.resolve({
        snapshots: [],
        nextCursor: "sync-v1.epoch.4.tag",
        hasMore: false,
        protocolVersion: 2 as const,
        serverTimestamp: "2026-08-06T16:00:00.000Z",
      }),
    );
    const engine = new SyncEngine(store, {
      registerClient: () => Promise.resolve(registration),
      snapshot,
      syncRound: (_client, request) => {
        attempts += 1;
        if (attempts === 1)
          return Promise.reject(new SyncCursorResetRequired());
        if (request.cursor === null)
          return Promise.reject(new Error("Cursor missing"));
        return Promise.resolve({
          outcomes: [],
          changes: [],
          nextCursor: request.cursor,
          hasMore: false,
          protocolVersion: 2 as const,
          serverTimestamp: "2026-08-06T16:00:01.000Z",
        });
      },
    });

    const response = await engine.sync();

    expect(snapshot).toHaveBeenCalledTimes(2);
    expect(attempts).toBe(2);
    expect(response.nextCursor).toBe("sync-v1.epoch.4.tag");
  });

  it("installs and removes a foreground-only online listener", async () => {
    const listeners = new Map<string, () => void>();
    const target = {
      addEventListener: (name: string, listener: () => void) =>
        listeners.set(name, listener),
      removeEventListener: (name: string) => listeners.delete(name),
    } as unknown as Window;
    const sync = vi.fn(() => Promise.resolve(undefined));
    const remove = installOnlineSync(target, sync);

    listeners.get("online")?.();
    await Promise.resolve();
    expect(sync).toHaveBeenCalledOnce();
    remove();
    expect(listeners.has("online")).toBe(false);
  });
});

it("does not resend pre-reset queued work after a content reset generation changes", async () => {
  store = new LocalStore({ indexedDb: indexedDB });
  await store.ensureClient(() => Promise.resolve(registration));
  const base = {
    snapshots: [],
    nextCursor: "old-cursor",
    hasMore: false,
    protocolVersion: 2 as const,
    serverTimestamp: "2026-11-04T12:00:00.000Z",
  };
  await store.replaceFromSnapshot(base);
  await store.queueTaskCreate({ title: "Queued before the explicit reset" });
  const seen: SyncRoundRequest[] = [];
  const engine = new SyncEngine(store, {
    registerClient: () => Promise.resolve(registration),
    snapshot: () =>
      Promise.resolve({
        ...base,
        nextCursor: "new-cursor",
        contentGeneration: "6519c805-e478-486b-a918-616fc6d9ea98",
      }),
    syncRound: (_client, request) => {
      seen.push(request);
      if (seen.length === 1)
        return Promise.reject(new SyncCursorResetRequired());
      return Promise.resolve({
        protocolVersion: 2 as const,
        outcomes: [],
        changes: [],
        nextCursor: "new-cursor",
        hasMore: false,
        serverTimestamp: base.serverTimestamp,
      });
    },
  });
  await engine.sync();
  expect(seen[0]?.operations).toHaveLength(1);
  expect(seen[1]?.operations).toEqual([]);
  expect(await store.loadOutbox()).toEqual([]);
  expect(await store.loadCachedTasks()).toEqual([]);
});

it("preserves new offline work when later snapshots have the same reset generation", async () => {
  store = new LocalStore({ indexedDb: indexedDB });
  await store.ensureClient(() => Promise.resolve(registration));
  const snapshot = {
    snapshots: [],
    nextCursor: "cursor",
    hasMore: false,
    protocolVersion: 2 as const,
    contentGeneration: "6519c805-e478-486b-a918-616fc6d9ea98",
    serverTimestamp: "2026-11-04T12:00:00.000Z",
  };
  await store.replaceFromSnapshot(snapshot);
  await store.queueTaskCreate({ title: "Created after learning the reset" });
  await store.replaceFromSnapshot(snapshot);
  expect(await store.loadOutbox()).toHaveLength(1);
  expect(await store.loadCachedTasks()).toHaveLength(1);
});

it("recovers an upgraded post-reset cache through the real HTTP transport", async () => {
  store = new LocalStore({ indexedDb: indexedDB });
  await store.ensureClient(() => Promise.resolve(registration));
  const timestamp = "2026-11-04T23:05:10.000Z";
  await store.replaceFromSnapshot({
    snapshots: [],
    nextCursor: "current-epoch.0",
    hasMore: false,
    protocolVersion: 2,
    serverTimestamp: timestamp,
  });
  await store.queueTaskCreate({ title: "Stale work from before the reset" });
  const requests: SyncRoundRequest[] = [];
  const paths: string[] = [];
  const generation = "6519c805-e478-486b-a918-616fc6d9ea98";
  const taskId = "afcab502-2199-43fd-b9d3-c8b556c6f25b";
  vi.stubGlobal(
    "fetch",
    vi.fn((path: string, init?: RequestInit) => {
      paths.push(path);
      const respond = (body: unknown, status = 200) =>
        Promise.resolve(
          new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json" },
          }),
        );
      if (path === "/api/sync/round") {
        const request = JSON.parse(init?.body as string) as SyncRoundRequest;
        requests.push(request);
        if (request.contentGeneration !== generation)
          return respond(
            {
              code: "CONTENT_RESET_CLIENT_UPDATE_REQUIRED",
              message: "Content was reset",
              requestId: clientId,
            },
            426,
          );
        return respond({
          protocolVersion: 2,
          outcomes: [],
          changes: [],
          nextCursor: "current-epoch.1944",
          hasMore: false,
          serverTimestamp: timestamp,
        });
      }
      if (path === "/api/sync/snapshot?offset=0")
        return respond({
          protocolVersion: 2,
          contentGeneration: generation,
          nextCursor: "current-epoch.1944",
          hasMore: false,
          serverTimestamp: timestamp,
          snapshots: [
            {
              entityKind: "task",
              value: {
                task: {
                  id: taskId,
                  title: "Rebuilt task",
                  notes: "",
                  status: "open",
                  revision: 1,
                  createdAt: timestamp,
                  updatedAt: timestamp,
                  completedAt: null,
                  deletedAt: null,
                },
                fieldVersions: {
                  title: 1,
                  notes: 1,
                  status: 1,
                  estimateMinutes: 1,
                  projectId: 1,
                  tagIds: 1,
                  deadline: 1,
                  parent: 1,
                  plannedStart: 1,
                },
                changeSequence: 1,
              },
            },
          ],
        });
      throw new Error("Unexpected sync request");
    }),
  );
  await new SyncEngine(store, createSyncTransport("csrf-token")).sync();
  expect(paths).toEqual([
    "/api/sync/round",
    "/api/sync/snapshot?offset=0",
    "/api/sync/round",
  ]);
  expect(requests[0]?.contentGeneration).toBeUndefined();
  expect(requests[1]).toMatchObject({
    contentGeneration: generation,
    cursor: "current-epoch.1944",
    operations: [],
  });
  expect((await store.loadCachedTasks()).map(({ task }) => task.id)).toEqual([
    taskId,
  ]);
  expect(await store.loadOutbox()).toEqual([]);
  expect((await store.clientIdentity())?.clientId).toBe(clientId);
});
