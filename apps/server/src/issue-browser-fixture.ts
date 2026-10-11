// Disposable browser qualification only. Never select this entry point in a release.
import { loadConfig } from "./config.ts";
import { startSuiteServer } from "./server.ts";

if (process.env.SUITE_ISSUE_FIXTURE !== "true")
  throw new Error("Explicit disposable fixture opt-in required");
const states = new Map<string, "open" | "closed">();
const issueFetch: typeof fetch = async (input, init) => {
  await Promise.resolve();
  const url =
    input instanceof URL
      ? input
      : new URL(typeof input === "string" ? input : input.url);
  if (
    !["https://api.github.com", "https://git.subcult.tv"].includes(url.origin)
  )
    throw new Error("Fixture rejects external requests");
  const authorization = new Headers(init?.headers).get("authorization");
  if (
    authorization !==
    `${url.origin === "https://api.github.com" ? "Bearer" : "token"} synthetic-issue-token`
  )
    return new Response(null, { status: 401 });
  const key = url.origin;
  if (init?.method === "PATCH") {
    const value: unknown = JSON.parse(
      typeof init.body === "string" ? init.body : "",
    );
    if (
      typeof value !== "object" ||
      value === null ||
      !("state" in value) ||
      (value.state !== "open" && value.state !== "closed")
    )
      return new Response(null, { status: 400 });
    states.set(key, value.state);
    console.info("fixture.issue.state_updated");
  }
  const issue = {
    number: 1,
    title: "Synthetic issue for browser verification",
    body: "This fixture uses no live repository or provider token.",
    state: states.get(key) ?? "open",
    updated_at: "2026-10-11T12:00:00Z",
    labels: [{ name: "bug" }],
    assignees: [{ login: "issue-test" }],
  };
  if (url.pathname.endsWith("/issues/1")) return Response.json(issue);
  if (url.pathname.endsWith("/issues")) return Response.json([issue]);
  if (url.pathname.endsWith("/repos/fixture/issues"))
    return Response.json({ full_name: "fixture/issues" });
  return new Response(null, { status: 404 });
};
const server = await startSuiteServer(loadConfig(), {
  issueFetch,
  connectorFetch: async (input, init) => {
    await Promise.resolve();
    const url =
      input instanceof URL
        ? input
        : new URL(typeof input === "string" ? input : input.url);
    if (url.hostname !== "baikal")
      throw new Error("Fixture rejects external DAV requests");
    const properties =
      url.pathname === "/dav.php/"
        ? "<D:current-user-principal><D:href>/dav.php/principals/fixture/</D:href></D:current-user-principal>"
        : url.pathname === "/dav.php/principals/fixture/"
          ? "<C:calendar-home-set><D:href>/dav.php/calendars/fixture/</D:href></C:calendar-home-set>"
          : '<D:resourcetype><D:collection/><C:calendar/></D:resourcetype><D:displayname>Fixture calendar</D:displayname><C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set>';
    const href =
      url.pathname === "/dav.php/calendars/fixture/"
        ? "/dav.php/calendars/fixture/test/"
        : url.pathname;
    return new Response(
      `<?xml version="1.0"?><D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">${init?.method === "REPORT" ? "" : `<D:response><D:href>${href}</D:href><D:propstat><D:prop>${properties}</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`}</D:multistatus>`,
      { status: 207, headers: { "content-type": "application/xml" } },
    );
  },
  disableNotificationTimer: true,
});
console.info(`Disposable issue fixture listening on ${server.baseUrl}`);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void server.close().then(() => process.exit(0));
  });
