import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ActiveSession } from "@suite/contracts";
import { FocusStrip } from "./FocusStrip.tsx";
import { Header } from "./Header.tsx";
import { syncTone } from "./SyncIndicator.tsx";

const session = (overrides: Partial<ActiveSession> = {}): ActiveSession => ({
  id: "df8c5e63-3280-4d25-b148-2d0e46e9a19d",
  ownerId: "c6d3a6fa-12c1-4d49-9544-5f85d885e7bc",
  taskId: "afcab502-2199-43fd-b9d3-c8b556c6f25b",
  controllerClientId: "me",
  state: "running",
  phase: "focus",
  revision: 3,
  startedAt: "2026-11-03T12:00:00.000Z",
  updatedAt: "2026-11-03T12:05:00.000Z",
  leaseExpiresAt: "2026-11-03T12:10:00.000Z",
  hardExpiresAt: "2026-11-03T20:00:00.000Z",
  currentIntervalId: "47f178b0-4f32-4426-a974-13d3592a7c2c",
  ...overrides,
});

const strip = (active: ActiveSession | null, clientId = "me") =>
  renderToStaticMarkup(
    <FocusStrip
      session={active}
      taskTitle="Write the brief"
      clientId={clientId}
      busy={false}
      online={true}
      timer={{
        timer: {
          at: "2026-11-03T12:05:00.000Z",
          session: active,
          plan: { mode: "countdown", focusMinutes: 25 },
          countdown: {
            phase: "focus",
            elapsedMs: 300_000,
            targetMs: 1_500_000,
            done: false,
            cycle: 1,
            isLongBreak: false,
          },
        },
        receivedAt: Date.now(),
        onSelectMode: () => undefined,
      }}
      onCommand={() => undefined}
    />,
  );

describe("FocusStrip (issue #194)", () => {
  it("says so when no session runs", () => {
    expect(strip(null)).toContain("No session");
    expect(strip(session({ state: "completed" }))).toContain("No session");
  });

  it("shows the task, the countdown and the owner's controls", () => {
    const html = strip(session());
    expect(html).toContain("Write the brief");
    expect(html).toMatch(/<time[^>]*>20:00<\/time>/);
    expect(html).toContain('aria-label="Pause"');
    expect(html).toContain(">Break<");
    expect(html).toContain("Complete focus session");
    expect(html).toContain('data-state="running"');
  });

  it("offers Resume while paused and End break during a break", () => {
    expect(strip(session({ state: "paused" }))).toContain(
      'aria-label="Resume"',
    );
    expect(strip(session({ phase: "break" }))).toContain("End break");
  });

  it("offers a takeover to a follower", () => {
    const html = strip(session(), "other-device");
    expect(html).toContain("Take over");
    expect(html).not.toContain('aria-label="Pause"');
    expect(html).toContain("Another device controls this session.");
  });
});

describe("syncTone (issue #194)", () => {
  it.each([
    [undefined, "live", true, "neutral"],
    ["online", "live", true, "success"],
    ["online", undefined, true, "success"],
    ["syncing", "live", true, "warning"],
    ["online", "reconnecting", true, "warning"],
    ["online", "live", false, "warning"],
    ["offline", "offline", true, "danger"],
  ] as const)("%s / %s / baikal %s is %s", (sync, live, baikal, tone) => {
    expect(
      syncTone({ syncStatus: sync, liveStatus: live, baikalConnected: baikal }),
    ).toBe(tone);
  });
});

describe("Header (issue #194)", () => {
  const render = (conflictCount: number) =>
    renderToStaticMarkup(
      <Header
        title="Today"
        focus={{
          session: null,
          taskTitle: null,
          clientId: null,
          busy: false,
          online: true,
          timer: undefined,
          onCommand: () => undefined,
        }}
        sync={{
          syncStatus: "online",
          liveStatus: "live",
          baikalConnected: true,
        }}
        conflictCount={conflictCount}
        commandTrigger={<button type="button">Command</button>}
        ownerName="Owner"
        onSignOut={() => undefined}
        formError={null}
      />,
    );

  it("shows the title, the sync dot and the account menu", () => {
    const html = render(0);
    expect(html).toContain(">Today</h1>");
    expect(html).toContain('data-tone="success"');
    expect(html).toContain("Account menu for Owner");
    expect(html).not.toContain("conflict");
  });

  it("shows a conflict badge only when conflicts need action", () => {
    expect(render(2)).toContain("2 conflicts");
    expect(render(1)).toContain("1 conflict<");
  });
});
