import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Header } from "../components/shell/Header.tsx";
import {
  liveSyncStatusDescription,
  liveSyncStatusDot,
  liveSyncStatusLabel,
  type LiveSyncStatus,
} from "./status.ts";

const statuses: readonly LiveSyncStatus[] = [
  "live",
  "reconnecting",
  "offline",
  "paused",
];

const shell = (liveStatus?: LiveSyncStatus): string =>
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
      sync={{ syncStatus: "online", liveStatus, baikalConnected: false }}
      conflictCount={0}
      commandTrigger={null}
      ownerName="Owner"
      onSignOut={() => undefined}
      formError={null}
    />,
  );

describe("live sync status", () => {
  it.each(statuses)("shows %s beside the task sync status", (status) => {
    const markup = shell(status);
    expect(markup).toContain("Task sync: online");
    expect(markup).toContain(`Live updates: ${liveSyncStatusLabel(status)}`);
    // The state is text in a status region, not colour alone.
    expect(markup).toContain('role="status"');
    expect(markup).toContain(liveSyncStatusDescription(status));
  });

  it("gives each state a distinct label and description", () => {
    expect(new Set(statuses.map(liveSyncStatusLabel)).size).toBe(4);
    expect(new Set(statuses.map(liveSyncStatusDescription)).size).toBe(4);
    expect(statuses.map(liveSyncStatusDot)).toEqual([
      "online",
      "syncing",
      "offline",
      "offline",
    ]);
  });

  it("omits the row where live sync is not running", () => {
    expect(shell()).not.toContain("Live updates");
  });
});
