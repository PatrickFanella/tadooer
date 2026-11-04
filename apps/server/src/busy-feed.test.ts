import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  calendarFeedCreateResponseSchema,
  calendarFeedListResponseSchema,
  calendarFeedPreviewResponseSchema,
  calendarImportMutationResponseSchema,
  sessionResponseSchema,
  taskMutationResponseSchema,
} from "@suite/contracts";
import { withTemporaryDirectory } from "@suite/test-support";
import { startSuiteServer } from "./server.ts";

// Issue #189 / ADR 0055: busy-only publication over the existing capability
// feed. The fake Baikal stores PUT bodies and honours If-Match so a task time
// block can be created, moved and removed through the ordinary write path.

const multi = (body: string) =>
  `<?xml version="1.0"?><D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">${body}</D:multistatus>`;

const calDav = () => {
  const resources = new Map<string, { rawIcs: string; etag: string }>();
  let version = 1;
  const fetcher: typeof fetch = async (input, init) => {
    await Promise.resolve();
    const url =
      input instanceof URL
        ? input
        : new URL(typeof input === "string" ? input : input.url);
    const method = init?.method ?? "GET";
    if (method === "PROPFIND" && url.pathname === "/dav.php/")
      return new Response(
        multi(
          `<D:response><D:href>/dav.php/</D:href><D:propstat><D:prop><D:current-user-principal><D:href>/dav.php/principals/alice/</D:href></D:current-user-principal></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`,
        ),
        { status: 207, headers: { "content-type": "application/xml" } },
      );
    if (method === "PROPFIND" && url.pathname === "/dav.php/principals/alice/")
      return new Response(
        multi(
          `<D:response><D:href>/dav.php/principals/alice/</D:href><D:propstat><D:prop><C:calendar-home-set><D:href>/dav.php/calendars/alice/</D:href></C:calendar-home-set></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`,
        ),
        { status: 207, headers: { "content-type": "application/xml" } },
      );
    if (method === "PROPFIND")
      return new Response(
        multi(
          `<D:response><D:href>/dav.php/calendars/alice/work/</D:href><D:propstat><D:prop><D:resourcetype><D:collection/><C:calendar/></D:resourcetype><D:displayname>Work</D:displayname><C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`,
        ),
        { status: 207, headers: { "content-type": "application/xml" } },
      );
    // Baikal filters REPORTs by time range. The imported event (November 10
    // and 17) never overlaps a task block window, so it is left out here.
    if (method === "REPORT")
      return new Response(
        multi(
          [...resources.entries()]
            .filter(([, resource]) => !resource.rawIcs.includes("SECRET-UID"))
            .map(
              ([href, resource]) =>
                `<D:response><D:href>${href}</D:href><D:propstat><D:prop><D:getetag>${resource.etag}</D:getetag></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`,
            )
            .join(""),
        ),
        { status: 207, headers: { "content-type": "application/xml" } },
      );
    const headers = new Headers(init?.headers);
    const existing = resources.get(url.pathname);
    if (method === "GET")
      return existing === undefined
        ? new Response("", { status: 404 })
        : new Response(existing.rawIcs, {
            status: 200,
            headers: { etag: existing.etag, "content-type": "text/calendar" },
          });
    if (method === "PUT") {
      if (headers.get("if-none-match") === "*" && existing !== undefined)
        return new Response("", { status: 412 });
      if (headers.has("if-match") && headers.get("if-match") !== existing?.etag)
        return new Response("", { status: 412 });
      version += 1;
      const etag = `"v${String(version)}"`;
      resources.set(url.pathname, {
        rawIcs: typeof init?.body === "string" ? init.body : "",
        etag,
      });
      return new Response(null, { status: 201, headers: { etag } });
    }
    if (method === "DELETE") {
      if (existing === undefined) return new Response("", { status: 404 });
      if (headers.get("if-match") !== existing.etag)
        return new Response("", { status: 412 });
      resources.delete(url.pathname);
      return new Response(null, { status: 204 });
    }
    return new Response("", { status: 404 });
  };
  return { fetcher };
};

const secretEvent = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:SECRET-UID@example.test",
  "DTSTAMP:20261101T000000Z",
  "DTSTART:20261110T150000Z",
  "DTEND:20261110T160000Z",
  "RRULE:FREQ=WEEKLY;COUNT=2",
  "SUMMARY:SECRET-SUMMARY",
  "DESCRIPTION:SECRET-DESCRIPTION",
  "LOCATION:SECRET-LOCATION",
  "ATTENDEE;CN=SECRET-CN:mailto:secret-attendee@example.test",
  "ORGANIZER:mailto:secret-organizer@example.test",
  "URL:https://SECRET-URL.test/",
  "X-SECRET-EXTENSION:SECRET-EXTENSION",
  "BEGIN:VALARM",
  "ACTION:DISPLAY",
  "DESCRIPTION:SECRET-ALARM",
  "TRIGGER:-PT10M",
  "END:VALARM",
  "END:VEVENT",
  "END:VCALENDAR",
  "",
].join("\r\n");

const vevents = (ics: string) =>
  ics.split("\r\n").filter((line) => line === "BEGIN:VEVENT").length;

describe("busy-only calendar feeds (issue #189)", () => {
  it("publishes occupied intervals only and follows task block moves and removals", async () => {
    await withTemporaryDirectory(async (directory) => {
      await mkdir(join(directory, "web"));
      await writeFile(join(directory, "web", "index.html"), "<h1>Suite</h1>");
      const dav = calDav();
      const server = await startSuiteServer(
        {
          host: "127.0.0.1",
          port: 0,
          databasePath: join(directory, "suite.sqlite"),
          webRoot: join(directory, "web"),
          baikalEndpoint: "http://baikal.test/dav.php/",
          credentialKeyPath: join(directory, "key"),
          secureCookies: false,
          build: { version: "test", revision: "test", builtAt: null },
        },
        { connectorFetch: dav.fetcher },
      );
      try {
        const base = server.baseUrl;
        const json = { Origin: base, "Content-Type": "application/json" };
        await fetch(`${base}/api/setup`, {
          method: "POST",
          headers: json,
          body: JSON.stringify({
            username: "owner",
            displayName: "Owner",
            password: "correct horse battery staple",
          }),
        });
        const login = await fetch(`${base}/api/auth/login`, {
          method: "POST",
          headers: json,
          body: JSON.stringify({
            username: "owner",
            password: "correct horse battery staple",
          }),
        });
        const session = sessionResponseSchema.parse(await login.json());
        const cookie = login.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
        const unsafe = {
          ...json,
          Cookie: cookie,
          "X-CSRF-Token": session.csrfToken,
        };
        const connected = await fetch(`${base}/api/connectors/baikal`, {
          method: "PUT",
          headers: unsafe,
          body: JSON.stringify({ username: "alice", password: "secret" }),
        });
        const calendarId =
          ((await connected.json()) as { calendars: { id: string }[] })
            .calendars[0]?.id ?? "";

        // An event carrying secrets in every field, published through import.
        const imported = calendarImportMutationResponseSchema.parse(
          await (
            await fetch(`${base}/api/imports/preview`, {
              method: "POST",
              headers: unsafe,
              body: JSON.stringify({
                source: "ics",
                calendarId,
                rawIcs: secretEvent,
              }),
            })
          ).json(),
        );
        await fetch(`${base}/api/imports/${imported.job.id}/apply`, {
          method: "POST",
          headers: unsafe,
        });

        // A task with a calendar-backed time block.
        const created = taskMutationResponseSchema.parse(
          await (
            await fetch(`${base}/api/tasks`, {
              method: "POST",
              headers: { ...unsafe, "Idempotency-Key": "busy-task" },
              body: JSON.stringify({ title: "SECRET-TASK-TITLE" }),
            })
          ).json(),
        );
        const block = async (
          startsAt: string,
          key: string,
          revision: number,
        ) => {
          const response = await fetch(
            `${base}/api/tasks/${created.task.id}/time-block`,
            {
              method: "POST",
              headers: {
                ...unsafe,
                "If-Match": `"${String(revision)}"`,
                "Idempotency-Key": key,
              },
              body: JSON.stringify({
                calendarId,
                startsAt,
                durationMinutes: 45,
              }),
            },
          );
          const body: unknown = await response.json();
          expect([200, 201], JSON.stringify(body)).toContain(response.status);
          return taskMutationResponseSchema.parse(body).task;
        };
        let task = await block(
          "2026-11-11T14:00:00.000Z",
          "busy-block-1",
          created.task.revision,
        );

        const issue = async (visibility?: "busy" | "full") =>
          calendarFeedCreateResponseSchema.parse(
            await (
              await fetch(`${base}/api/calendar-feeds`, {
                method: "POST",
                headers: unsafe,
                body: JSON.stringify({
                  calendarId,
                  label: visibility ?? "default",
                  ...(visibility === undefined ? {} : { visibility }),
                }),
              })
            ).json(),
          );
        const busy = await issue("busy");
        const legacy = await issue();
        expect(busy.capability.visibility).toBe("busy");
        expect(legacy.capability.visibility).toBe("full");

        const read = async (url: string) => {
          const response = await fetch(`${base}${url}`);
          expect(response.status).toBe(200);
          expect(response.headers.get("cache-control")).toBe(
            "private, no-store",
          );
          return response.text();
        };
        let busyIcs = await read(busy.url);
        expect(busyIcs).not.toMatch(/secret/i);
        expect(vevents(busyIcs)).toBe(2);
        expect(busyIcs).toContain("RRULE:FREQ=WEEKLY;COUNT=2");
        expect(busyIcs).toContain("DTSTART:20261111T140000Z");
        expect(busyIcs).toContain("DTEND:20261111T144500Z");
        // The full-details feed is unchanged.
        expect(await read(legacy.url)).toContain("SUMMARY:SECRET-SUMMARY");

        const preview = calendarFeedPreviewResponseSchema.parse(
          await (
            await fetch(`${base}/api/calendars/${calendarId}/feed-preview`, {
              headers: { Cookie: cookie },
            })
          ).json(),
        );
        expect(preview).toEqual({
          calendarId,
          full: { events: 2 },
          busy: {
            published: 2,
            omittedCancelled: 0,
            omittedFree: 0,
            unsupported: 0,
          },
        });

        // Moving the block changes the next publication.
        task = await block(
          "2026-11-12T16:00:00.000Z",
          "busy-block-2",
          task.revision,
        );
        busyIcs = await read(busy.url);
        expect(busyIcs).toContain("DTSTART:20261112T160000Z");
        expect(busyIcs).not.toContain("DTSTART:20261111T140000Z");
        expect(busyIcs).not.toMatch(/secret/i);

        // Removing it drops the interval.
        const removed = await fetch(
          `${base}/api/tasks/${created.task.id}/time-block`,
          {
            method: "DELETE",
            headers: { ...unsafe, "If-Match": `"${String(task.revision)}"` },
          },
        );
        expect(removed.status).toBe(200);
        busyIcs = await read(busy.url);
        expect(vevents(busyIcs)).toBe(1);
        expect(busyIcs).not.toContain("DTSTART:20261112T160000Z");

        // GET/HEAD only, owner-only listing and preview, revocation.
        const head = await fetch(`${base}${busy.url}`, { method: "HEAD" });
        expect(head.status).toBe(200);
        expect(await head.text()).toBe("");
        expect(
          (await fetch(`${base}${busy.url}`, { method: "POST" })).status,
        ).toBe(405);
        expect(
          (await fetch(`${base}/api/calendars/${calendarId}/feed-preview`))
            .status,
        ).toBe(401);
        expect(
          (
            await fetch(
              `${base}/api/calendars/00000000-0000-4000-8000-000000000999/feed-preview`,
              { headers: { Cookie: cookie } },
            )
          ).status,
        ).toBe(404);
        const listed = calendarFeedListResponseSchema.parse(
          await (
            await fetch(`${base}/api/calendar-feeds`, {
              headers: { Cookie: cookie },
            })
          ).json(),
        );
        expect(
          listed.capabilities.map(({ label, visibility }) => [
            label,
            visibility,
          ]),
        ).toEqual([
          ["busy", "busy"],
          ["default", "full"],
        ]);
        expect(
          (
            await fetch(`${base}/api/calendar-feeds/${busy.capability.id}`, {
              method: "DELETE",
              headers: unsafe,
            })
          ).status,
        ).toBe(204);
        expect((await fetch(`${base}${busy.url}`)).status).toBe(404);
      } finally {
        await server.close();
      }
    });
  });
});
