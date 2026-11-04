import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  automationTokenScopeSchema,
  automationPreviewResponseSchema,
  automationConfirmationResponseSchema,
  createAutomationTokenResponseSchema,
} from "@suite/contracts";
import { withTemporaryDirectory } from "@suite/test-support";
import { startSuiteServer, type RunningSuiteServer } from "./server.ts";
import type { ServerConfig } from "./config.ts";

it("requires explicit reset authority and confirmation; rejects changes and never repeats a committed reset", async () => {
  await withTemporaryDirectory(async (directory) => {
    await mkdir(join(directory, "web"));
    const config: ServerConfig = {
      host: "127.0.0.1",
      port: 0,
      databasePath: join(directory, "suite.sqlite"),
      webRoot: join(directory, "web"),
      baikalEndpoint: "http://baikal.test/dav.php/",
      credentialKeyPath: join(directory, "credential.key"),
      secureCookies: false,
      build: { version: "test", revision: "test", builtAt: null },
    };
    let server: RunningSuiteServer = await startSuiteServer(config);
    try {
      const credentials = {
        username: "organizer",
        displayName: "Organizer",
        password: "a sufficiently long disposable password",
      };
      const browser = (path: string, body: unknown, cookie = "", csrf = "") =>
        fetch(`${server.baseUrl}${path}`, {
          method: "POST",
          headers: {
            Origin: server.baseUrl,
            "Content-Type": "application/json",
            Cookie: cookie,
            "X-CSRF-Token": csrf,
          },
          body: JSON.stringify(body),
        });
      expect((await browser("/api/setup", credentials)).status).toBe(201);
      const login = await browser("/api/auth/login", credentials);
      const cookie = login.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
      const { csrfToken } = (await login.json()) as { csrfToken: string };
      const issue = async (scopes: string[]) =>
        createAutomationTokenResponseSchema.parse(
          await (
            await browser(
              "/api/automation/tokens",
              {
                label: "Reset qualification",
                scopes,
                confirmationPolicy: "execute_ordinary",
                expiresAt: new Date(Date.now() + 3600000).toISOString(),
              },
              cookie,
              csrfToken,
            )
          ).json(),
        ).token;
      const old = await issue(
        automationTokenScopeSchema.options.filter(
          (scope) => scope !== "data:reset",
        ),
      );
      const authorized = await issue([...automationTokenScopeSchema.options]);
      const api = (path: string, token: string, body?: unknown) =>
        fetch(`${server.baseUrl}${path}`, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      const preview = async (
        operation: string,
        input: unknown,
        token = authorized,
      ) => {
        const response = await api("/api/automation/v1/previews", token, {
          operation,
          input,
        });
        expect(response.status, await response.clone().text()).toBe(201);
        return automationPreviewResponseSchema.parse(await response.json())
          .preview;
      };
      const confirm = (previewId: string, key = randomUUID()) =>
        api(`/api/automation/v1/previews/${previewId}/confirm`, authorized, {
          idempotencyKey: key,
        });
      const apply = async (operation: string, input: unknown) => {
        const p = await preview(operation, input);
        const response = await confirm(p.id);
        expect(response.status, await response.clone().text()).toBe(200);
        return automationConfirmationResponseSchema.parse(
          await response.json(),
        );
      };
      const created = await apply("tasks.create", {
        title: "Discard old content",
        notes: "Original notes",
      });
      if (!("task" in created.result)) throw new Error("Missing task result");
      const task = created.result.task;
      expect(
        (
          await api("/api/automation/v1/previews", old, {
            operation: "data.reset",
            input: {},
          })
        ).status,
      ).toBe(403);
      const read = async () =>
        (await (
          await api("/api/automation/v1/resources/tasks", authorized)
        ).json()) as { tasks: { id: string }[] };
      expect((await read()).tasks).toHaveLength(1);
      const shortcut = await api("/api/automation/v1/previews", authorized, {
        operation: "data.reset",
        input: {},
        execute: { idempotencyKey: randomUUID() },
      });
      expect(shortcut.status).toBe(409);
      expect((await read()).tasks).toHaveLength(1);
      const stale = await preview("data.reset", {});
      expect(stale.confirmation.policy).toBe("consequential");
      expect(stale.contentReset?.counts).toContainEqual({
        table: "tasks",
        rows: 1,
      });
      expect(stale.summary).toContain("Preserve account access");
      await apply("tasks.update", {
        taskId: task.id,
        expectedRevision: task.revision,
        patch: { notes: "Changed after reset preview" },
      });
      expect((await confirm(stale.id)).status).toBe(412);
      expect((await read()).tasks).toHaveLength(1);
      const focus = await apply("focus.start", {
        operation: "focus.start",
        taskId: task.id,
      });
      if (!("session" in focus.result))
        throw new Error("Missing focus session");
      expect(
        (
          await api("/api/automation/v1/previews", authorized, {
            operation: "data.reset",
            input: {},
          })
        ).status,
      ).toBe(409);
      await apply("focus.complete", {
        operation: "focus.complete",
        sessionId: focus.result.session.id,
        expectedRevision: focus.result.session.revision,
      });
      const client = (await (
        await browser(
          "/api/clients",
          { label: "Reset test browser" },
          cookie,
          csrfToken,
        )
      ).json()) as { client: { id: string }; clientCredential: string };
      const ready = await preview("data.reset", {});
      const key = randomUUID();
      const reset = await confirm(ready.id, key);
      expect(reset.status, await reset.clone().text()).toBe(200);
      const result = automationConfirmationResponseSchema.parse(
        await reset.json(),
      );
      expect(result.result).toHaveProperty("contentReset");
      expect((await read()).tasks).toEqual([]);
      const clientHeaders = {
        Cookie: cookie,
        "X-Suite-Client-Id": client.client.id,
        "X-Suite-Client-Credential": client.clientCredential,
        "X-Suite-Sync-Version": "2",
      };
      const snapshot = (await (
        await fetch(`${server.baseUrl}/api/sync/snapshot`, {
          headers: clientHeaders,
        })
      ).json()) as { nextCursor: string; contentGeneration: string };
      expect(snapshot.contentGeneration).toMatch(/^[0-9a-f-]{36}$/);
      const round = (generation?: string) =>
        fetch(`${server.baseUrl}/api/sync/round`, {
          method: "POST",
          headers: {
            ...clientHeaders,
            Origin: server.baseUrl,
            "X-CSRF-Token": csrfToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            cursor: snapshot.nextCursor,
            operations: [],
            pullLimit: 100,
            ...(generation ? { contentGeneration: generation } : {}),
          }),
        });
      // An old cached client cannot reintroduce its queue, even with a new cursor.
      expect((await round()).status).toBe(426);
      expect((await round(snapshot.contentGeneration)).status).toBe(200);

      // Both the owner session and the previous automation token remain usable.
      expect(
        (
          await fetch(`${server.baseUrl}/api/automation/tokens`, {
            headers: { Cookie: cookie },
          })
        ).status,
      ).toBe(200);
      await preview(
        "tasks.create",
        { title: "Old token still authorized", notes: "" },
        old,
      );
      await apply("tasks.create", {
        title: "New content after reset",
        notes: "",
      });
      await server.close();
      server = await startSuiteServer(config);
      const replay = await confirm(ready.id, key);
      expect(replay.status).toBe(200);
      expect(
        automationConfirmationResponseSchema.parse(await replay.json())
          .replayed,
      ).toBe(true);
      expect((await read()).tasks).toHaveLength(1);
    } finally {
      await server.close();
    }
  });
});
