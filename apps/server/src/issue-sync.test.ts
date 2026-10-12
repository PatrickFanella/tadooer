import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { SuiteDatabase } from "@suite/persistence";
import { withTemporaryDirectory } from "@suite/test-support";
import {
  issueConnectionsResponseSchema,
  type IssueConnectionInput,
} from "@suite/contracts";
import { IssueConnectorService } from "./issue-connector.ts";
import { IssueProvider } from "./issue-provider.ts";
import { startSuiteServer } from "./server.ts";

const required = <T>(value: T | undefined | null): T => {
  if (value == null) throw new Error("Expected fixture value is missing");
  return value;
};

const fixture = () => {
  let issue = {
    number: 1,
    title: "Provider issue",
    body: "Description",
    state: "open",
    updated_at: "2026-10-11T12:00:00Z",
    labels: [{ name: "bug" }],
    assignees: [{ login: "owner" }],
  };
  let fail = 0;
  let ambiguous = false;
  let rejectWrite = false;
  let patchCount = 0;
  const fetcher: typeof fetch = async (input, init) => {
    await Promise.resolve();
    const url =
      input instanceof URL
        ? input
        : new URL(typeof input === "string" ? input : input.url);
    if (fail) return new Response(null, { status: fail });
    if (init?.method === "PATCH") {
      patchCount++;
      if (rejectWrite) throw new Error("write interrupted before acceptance");
      const { state } = JSON.parse(
        typeof init.body === "string" ? init.body : "",
      ) as { state: string };
      issue = { ...issue, state, updated_at: "2026-10-11T13:00:00Z" };
      if (ambiguous) throw new Error("response lost");
      return Response.json(issue);
    }
    if (url.pathname.endsWith("/issues/1")) return Response.json(issue);
    if (/\/issues\/\d+$/.test(url.pathname))
      return new Response(null, { status: 404 });
    if (url.pathname.endsWith("/issues"))
      return Response.json([
        issue,
        { ...issue, number: 2, pull_request: { url: "ignored" } },
      ]);
    return Response.json({ full_name: "org/repo" });
  };
  return {
    fetcher,
    patch: (changes: Partial<typeof issue>) => {
      issue = { ...issue, ...changes };
    },
    fail: (status: number) => {
      fail = status;
    },
    ambiguous: () => {
      ambiguous = true;
    },
    rejectWrites: (value: boolean) => {
      rejectWrite = value;
    },
    patches: () => patchCount,
  };
};
const connectionInput = (
  provider: "github" | "gitea",
  writeBack = false,
): IssueConnectionInput => ({
  provider,
  origin:
    provider === "github" ? "https://github.com" : "https://git.subcult.tv",
  repository: "org/repo",
  token: "synthetic-issue-token",
  writeBack,
});

const createOwner = (db: SuiteDatabase) => {
  const owner = {
    id: randomUUID(),
    username: "owner",
    displayName: "Owner",
    passwordHash: "test-only",
    createdAt: new Date().toISOString(),
  };
  expect(db.createOwner(owner)).toBe(true);
  return owner;
};

describe.each(["github", "gitea"] as const)("%s issue sync", (provider) => {
  it("reuses and rotates an encrypted shared token while repository overrides stay independent", async () => {
    await withTemporaryDirectory(async (directory) => {
      const path = join(directory, "shared.sqlite");
      const key = join(directory, "shared.key");
      let db = SuiteDatabase.open(path);
      const owner = createOwner(db);
      const remote = fixture();
      const authorizations: string[] = [];
      const fetcher: typeof fetch = async (input, init) => {
        authorizations.push(
          new Headers(init?.headers).get("Authorization") ?? "",
        );
        return remote.fetcher(input, init);
      };
      let service = new IssueConnectorService(
        db,
        key,
        ["https://git.subcult.tv", "https://other.example"],
        fetcher,
      );
      const input = connectionInput(provider);
      await expect(
        service.connect(owner.id, {
          ...input,
          tokenScope: "global",
          token: "",
        }),
      ).rejects.toThrow("Reconnect");
      await service.saveSharedToken(owner.id, {
        provider,
        origin: input.origin,
        token: "synthetic-global-one",
      });
      expect(authorizations).toEqual([]);
      expect(service.overview(owner.id).connections).toEqual([]);
      await service.connect(owner.id, {
        ...input,
        tokenScope: "global",
        token: "",
      });
      await service.connect(owner.id, {
        ...input,
        repository: "org/second",
        tokenScope: "global",
        token: "",
      });
      await service.connect(owner.id, {
        ...input,
        repository: "org/private",
        token: "synthetic-repository",
      });
      let overview = service.overview(owner.id);
      expect(overview.sharedTokens).toEqual([
        { provider, origin: input.origin },
      ]);
      expect(JSON.stringify(overview)).not.toContain("synthetic-");
      expect(
        db.issues.sharedToken(owner.id, provider, input.origin),
      ).not.toContain("synthetic-global-one");
      const first = required(
        overview.connections.find((x) => x.repository === "org/repo"),
      );
      const second = required(
        overview.connections.find((x) => x.repository === "org/second"),
      );
      const specific = required(
        overview.connections.find((x) => x.repository === "org/private"),
      );
      await service.connect(owner.id, {
        ...input,
        tokenScope: "global",
        token: "synthetic-global-two",
      });
      const prefix = provider === "github" ? "Bearer" : "token";
      await service.browse(owner.id, second.id);
      expect(authorizations.at(-1)).toBe(`${prefix} synthetic-global-two`);
      await service.browse(owner.id, specific.id);
      expect(authorizations.at(-1)).toBe(`${prefix} synthetic-repository`);
      remote.fail(401);
      await expect(
        service.connect(owner.id, {
          ...input,
          tokenScope: "global",
          token: "synthetic-invalid",
        }),
      ).rejects.toThrow();
      remote.fail(0);
      await service.browse(owner.id, second.id);
      expect(authorizations.at(-1)).toBe(`${prefix} synthetic-global-two`);
      db.close();
      db = SuiteDatabase.open(path);
      try {
        service = new IssueConnectorService(
          db,
          key,
          ["https://git.subcult.tv", "https://other.example"],
          fetcher,
        );
        await service.browse(owner.id, second.id);
        expect(authorizations.at(-1)).toBe(`${prefix} synthetic-global-two`);
        await service.disconnect(owner.id, first.id);
        await expect(service.browse(owner.id, first.id)).rejects.toThrow(
          "Reconnect",
        );
        await service.browse(owner.id, second.id);
        expect(service.overview(owner.id).sharedTokens).toHaveLength(1);
        if (provider === "gitea")
          await expect(
            service.connect(owner.id, {
              ...input,
              origin: "https://other.example",
              tokenScope: "global",
              token: "",
            }),
          ).rejects.toThrow("Reconnect");
        await service.removeSharedToken(
          "another-owner",
          provider,
          input.origin,
        );
        await service.browse(owner.id, second.id);
        await service.removeSharedToken(owner.id, provider, input.origin);
        overview = service.overview(owner.id);
        expect(overview.sharedTokens).toEqual([]);
        expect(
          required(overview.connections.find((x) => x.id === second.id)).state,
        ).toBe("authentication_required");
        await expect(service.browse(owner.id, second.id)).rejects.toThrow(
          "Reconnect",
        );
        await service.browse(owner.id, specific.id);
        expect(authorizations.at(-1)).toBe(`${prefix} synthetic-repository`);
        expect(
          required(overview.connections.find((x) => x.id === first.id)).state,
        ).toBe("disconnected");
      } finally {
        db.close();
      }
    });
  });

  it("imports exactly once across restart, pulls changes, preserves planning, detects text conflicts, and writes state only when enabled", async () => {
    await withTemporaryDirectory(async (directory) => {
      const path = join(directory, "suite.sqlite");
      const key = join(directory, "credential.key");
      let db = SuiteDatabase.open(path);
      const owner = createOwner(db);
      const remote = fixture();
      let service = new IssueConnectorService(
        db,
        key,
        ["https://git.subcult.tv"],
        remote.fetcher,
      );
      await service.connect(owner.id, connectionInput(provider));
      const id = required(service.overview(owner.id).connections[0]).id;
      expect(await service.browse(owner.id, id)).toHaveLength(1);
      await service.import(owner.id, id, [1], null);
      expect(service.overview(owner.id).links).toHaveLength(1);
      const taskId = required(service.overview(owner.id).links[0]).taskId;
      const initial = required(db.getTask(owner.id, taskId));
      db.patchTask(
        owner.id,
        taskId,
        initial.revision,
        { estimateMinutes: 45, plannedStart: "2026-10-12T12:00:00Z" },
        new Date().toISOString(),
      );
      db.close();
      db = SuiteDatabase.open(path);
      service = new IssueConnectorService(
        db,
        key,
        ["https://git.subcult.tv"],
        remote.fetcher,
      );
      await service.import(owner.id, id, [1], null);
      expect(db.listTasks(owner.id)).toHaveLength(1);
      remote.patch({ title: "Updated provider title", state: "closed" });
      const cursor = db.getSyncState(owner.id);
      await service.synchronize(owner.id, id);
      expect(
        db
          .pageSyncChanges(owner.id, cursor.epoch, cursor.cursor)
          .changes.some((change) => change.entityId === taskId),
      ).toBe(true);
      expect(db.getTask(owner.id, taskId)).toMatchObject({
        title: "Updated provider title",
        status: "completed",
        estimateMinutes: 45,
        plannedStart: "2026-10-12T12:00:00Z",
      });
      let task = required(db.getTask(owner.id, taskId));
      db.patchTask(
        owner.id,
        taskId,
        task.revision,
        { title: "Local title" },
        new Date().toISOString(),
      );
      remote.patch({ title: "Concurrent provider title" });
      await service.synchronize(owner.id, id);
      expect(required(service.overview(owner.id).links[0]).state).toBe(
        "conflict",
      );
      expect(required(db.getTask(owner.id, taskId)).title).toBe("Local title");
      await service.synchronize(
        owner.id,
        id,
        "retry_local",
        required(service.overview(owner.id).links[0]).id,
      );
      await service.synchronize(owner.id, id);
      expect(required(db.getTask(owner.id, taskId)).title).toBe("Local title");
      task = required(db.getTask(owner.id, taskId));
      db.setTaskCompleted(
        owner.id,
        taskId,
        task.revision,
        false,
        new Date().toISOString(),
      );
      await service.synchronize(owner.id, id);
      await service.synchronize(owner.id, id);
      expect(remote.patches()).toBe(0);
      expect(required(db.getTask(owner.id, taskId)).status).toBe("open");
      await service.connect(owner.id, connectionInput(provider, true));
      await service.synchronize(owner.id, id);
      expect(remote.patches()).toBe(1);
      expect(required(service.overview(owner.id).links[0]).issue.state).toBe(
        "open",
      );
      const inspection = new DatabaseSync(path);
      const stored = JSON.stringify(
        inspection.prepare("SELECT * FROM issue_connections").all(),
      );
      expect(stored).not.toContain("synthetic-issue-token");
      expect(stored).toContain("credential");
      expect(JSON.stringify(service.overview(owner.id))).not.toContain(
        "credential",
      );
      inspection.close();
      expect(Buffer.from(readFileSync(key, "utf8"), "base64").byteLength).toBe(
        32,
      );
      await service.disconnect(owner.id, id);
      expect(db.listTasks(owner.id)).toHaveLength(1);
      expect(required(service.overview(owner.id).connections[0]).state).toBe(
        "disconnected",
      );
      db.close();
    });
  }, 15_000);

  it("reconciles an interrupted remote state write after restart without another PATCH, and preserves tasks on provider failures", async () => {
    await withTemporaryDirectory(async (directory) => {
      const path = join(directory, "suite.sqlite");
      const key = join(directory, "credential.key");
      let db = SuiteDatabase.open(path);
      const owner = createOwner(db);
      const remote = fixture();
      let service = new IssueConnectorService(
        db,
        key,
        ["https://git.subcult.tv"],
        remote.fetcher,
      );
      await service.connect(owner.id, connectionInput(provider, true));
      const id = required(service.overview(owner.id).connections[0]).id;
      await service.import(owner.id, id, [1], null);
      const task = required(db.listTasks(owner.id)[0]);
      db.setTaskCompleted(
        owner.id,
        task.id,
        task.revision,
        true,
        new Date().toISOString(),
      );
      remote.ambiguous();
      await service.synchronize(owner.id, id);
      expect(required(service.overview(owner.id).links[0]).state).toBe(
        "uncertain",
      );
      expect(remote.patches()).toBe(1);
      db.close();
      db = SuiteDatabase.open(path);
      service = new IssueConnectorService(
        db,
        key,
        ["https://git.subcult.tv"],
        remote.fetcher,
      );
      await service.synchronize(owner.id, id);
      expect(required(service.overview(owner.id).links[0]).state).toBe(
        "synced",
      );
      expect(remote.patches()).toBe(1);
      remote.fail(401);
      await service.synchronize(owner.id, id);
      expect(required(service.overview(owner.id).connections[0]).state).toBe(
        "authentication_required",
      );
      expect(required(db.getTask(owner.id, task.id)).status).toBe("completed");
      remote.fail(404);
      await service.synchronize(owner.id, id);
      expect(required(service.overview(owner.id).links[0]).state).toBe(
        "unavailable",
      );
      expect(db.listTasks(owner.id)).toHaveLength(1);
      db.close();
    });
  });

  it("requires explicit retry for an unaccepted write and preserves later local text edits", async () => {
    await withTemporaryDirectory(async (directory) => {
      const db = SuiteDatabase.open(join(directory, "suite.sqlite"));
      const owner = createOwner(db);
      const remote = fixture();
      const service = new IssueConnectorService(
        db,
        join(directory, "credential.key"),
        ["https://git.subcult.tv"],
        remote.fetcher,
      );
      try {
        await service.connect(owner.id, connectionInput(provider, true));
        const id = required(service.overview(owner.id).connections[0]).id;
        await service.import(owner.id, id, [1], null);
        let task = required(db.listTasks(owner.id)[0]);
        db.setTaskCompleted(
          owner.id,
          task.id,
          task.revision,
          true,
          new Date().toISOString(),
        );
        remote.rejectWrites(true);
        await service.synchronize(owner.id, id);
        remote.rejectWrites(false);
        await service.synchronize(owner.id, id);
        const linkId = required(service.overview(owner.id).links[0]).id;
        expect(required(service.overview(owner.id).links[0]).state).toBe(
          "uncertain",
        );
        expect(remote.patches()).toBe(1);
        await service.synchronize(owner.id, id, "retry_local", linkId);
        expect(remote.patches()).toBe(2);
        task = required(db.getTask(owner.id, task.id));
        db.patchTask(
          owner.id,
          task.id,
          task.revision,
          { title: "Persistent local edit" },
          new Date().toISOString(),
        );
        await service.synchronize(owner.id, id);
        remote.patch({ title: "Later remote edit" });
        await service.synchronize(owner.id, id);
        expect(required(service.overview(owner.id).links[0]).state).toBe(
          "conflict",
        );
        expect(required(db.getTask(owner.id, task.id)).title).toBe(
          "Persistent local edit",
        );
        await service.synchronize(owner.id, id, "accept_remote", linkId);
        expect(required(db.getTask(owner.id, task.id)).title).toBe(
          "Later remote edit",
        );
        task = required(db.getTask(owner.id, task.id));
        db.deleteTask(
          owner.id,
          task.id,
          task.revision,
          new Date().toISOString(),
        );
        await service.synchronize(owner.id, id);
        expect(required(service.overview(owner.id).links[0]).state).toBe(
          "task_deleted",
        );
        expect(db.listTasks(owner.id)).toHaveLength(0);
      } finally {
        db.close();
      }
    });
  });
});

it("uses bounded pagination, rejects incomplete or malformed lists, and never follows provider redirects", async () => {
  const pages: string[] = [];
  const remote = fixture();
  const seed = await new IssueProvider(remote.fetcher).get(
    connectionInput("github"),
    1,
  );
  const fetcher: typeof fetch = async (input, init) => {
    await Promise.resolve();
    expect(init?.redirect).toBe("error");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer synthetic-issue-token",
    );
    const url =
      input instanceof URL
        ? input
        : new URL(typeof input === "string" ? input : input.url);
    pages.push(required(url.searchParams.get("page")));
    return Response.json(
      url.searchParams.get("page") === "1"
        ? Array.from({ length: 100 }, (_, i) => ({
            number: i + 1,
            title: seed.title,
            body: seed.notes,
            state: "open",
            updated_at: seed.updatedAt,
          }))
        : [],
    );
  };
  expect(
    await new IssueProvider(fetcher).list(connectionInput("github")),
  ).toHaveLength(100);
  expect(pages).toEqual(["1", "2"]);
  await expect(
    new IssueProvider(() =>
      Promise.resolve(Response.json({ error: "not a list" })),
    ).list(connectionInput("gitea")),
  ).rejects.toMatchObject({ code: "invalid_response" });
  await expect(
    new IssueProvider(async () => {
      await Promise.resolve();
      return Response.json(
        Array.from({ length: 100 }, () => ({
          number: 1,
          title: "Issue",
          state: "open",
          updated_at: seed.updatedAt,
        })),
      );
    }).list(connectionInput("github")),
  ).rejects.toMatchObject({ code: "too_many_issues" });
});

it("requires owner authentication, same-origin CSRF, allowed hosts, and atomic imports through HTTP", async () => {
  await withTemporaryDirectory(async (directory) => {
    const server = await startSuiteServer(
      {
        host: "127.0.0.1",
        port: 0,
        databasePath: join(directory, "suite.sqlite"),
        webRoot: directory,
        baikalEndpoint: "http://baikal.test/dav.php/",
        credentialKeyPath: join(directory, "credential.key"),
        secureCookies: false,
        build: { version: "test", revision: "issues", builtAt: null },
      },
      { issueFetch: fixture().fetcher, disableNotificationTimer: true },
    );
    try {
      const request = (
        path: string,
        method = "GET",
        body?: unknown,
        cookie = "",
        csrf = "",
      ) =>
        fetch(`${server.baseUrl}${path}`, {
          method,
          headers: {
            Origin: server.baseUrl,
            Cookie: cookie,
            "X-CSRF-Token": csrf,
            "Content-Type": "application/json",
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      expect((await request("/api/issue-connections")).status).toBe(401);
      expect(
        (
          await request("/api/setup", "POST", {
            username: "owner",
            displayName: "Owner",
            password: "correct horse battery staple",
          })
        ).status,
      ).toBe(201);
      const login = await request("/api/auth/login", "POST", {
        username: "owner",
        password: "correct horse battery staple",
      });
      const cookie = required(
        required(login.headers.get("set-cookie")).split(";")[0],
      );
      const { csrfToken: originalCsrf } = (await login.json()) as {
        csrfToken: string;
      };
      const resumed = await request(
        "/api/auth/session",
        "GET",
        undefined,
        cookie,
      );
      const { csrfToken } = (await resumed.json()) as { csrfToken: string };
      expect(
        (
          await request(
            "/api/issue-connections",
            "POST",
            connectionInput("gitea"),
            cookie,
            originalCsrf,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await request(
            "/api/issue-connections",
            "POST",
            connectionInput("gitea"),
            cookie,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await request(
            "/api/issue-connections",
            "POST",
            {
              ...connectionInput("gitea"),
              origin: "https://untrusted.example",
            },
            cookie,
            csrfToken,
          )
        ).status,
      ).toBe(409);
      const sharedInput = {
        provider: "gitea",
        origin: "https://git.subcult.tv",
        token: "synthetic-shared-token",
      };
      expect(
        (
          await request(
            "/api/issue-connections/shared-token",
            "POST",
            sharedInput,
            cookie,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await request(
            "/api/issue-connections/shared-token",
            "POST",
            { ...sharedInput, origin: "https://untrusted.example" },
            cookie,
            csrfToken,
          )
        ).status,
      ).toBe(409);
      const sharedSaved = await request(
        "/api/issue-connections/shared-token",
        "POST",
        sharedInput,
        cookie,
        csrfToken,
      );
      expect(sharedSaved.status).toBe(200);
      const sharedText = await sharedSaved.text();
      expect(sharedText).not.toContain(sharedInput.token);
      const sharedOverview = issueConnectionsResponseSchema.parse(
        JSON.parse(sharedText),
      );
      expect(sharedOverview.connections).toEqual([]);
      expect(sharedOverview.sharedTokens).toEqual([
        { provider: "gitea", origin: sharedInput.origin },
      ]);
      expect(
        (
          await request(
            "/api/issue-connections/shared-token",
            "POST",
            { ...sharedInput, token: "" },
            cookie,
            csrfToken,
          )
        ).status,
      ).toBe(409);
      const saved = await request(
        "/api/issue-connections",
        "POST",
        { ...connectionInput("gitea"), token: "", tokenScope: "global" },
        cookie,
        csrfToken,
      );
      expect(saved.status).toBe(200);
      const overview = issueConnectionsResponseSchema.parse(await saved.json());
      const id = required(overview.connections[0]).id;
      expect(
        (
          await request(
            `/api/issue-connections/${id}/import`,
            "POST",
            { numbers: [1, 99] },
            cookie,
            csrfToken,
          )
        ).status,
      ).toBe(502);
      expect(
        (
          (await (
            await request("/api/tasks", "GET", undefined, cookie)
          ).json()) as { tasks: unknown[] }
        ).tasks,
      ).toHaveLength(0);
      expect(
        (
          await request(
            `/api/issue-connections/${id}/import`,
            "POST",
            { numbers: [1] },
            cookie,
            csrfToken,
          )
        ).status,
      ).toBe(200);
      const replay = await request(
        `/api/issue-connections/${id}/import`,
        "POST",
        { numbers: [1] },
        cookie,
        csrfToken,
      );
      expect(
        issueConnectionsResponseSchema.parse(await replay.json()).links,
      ).toHaveLength(1);
      expect(
        (
          await request(
            `/api/issue-connections/${id}/sync`,
            "POST",
            {
              linkId: "00000000-0000-4000-8000-000000000000",
              resolution: "accept_remote",
            },
            cookie,
            csrfToken,
          )
        ).status,
      ).toBe(409);
    } finally {
      await server.close();
    }
  });
});
