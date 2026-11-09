import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { noteSchema, type Task } from "@suite/contracts";
import {
  TodayPage,
  updateHiddenCalendarIds,
  type TodayPageProps,
} from "./TodayPage.tsx";

const actions = {
  changeStatus: () => Promise.resolve(false),
  editTask: () => Promise.resolve(),
  startFocus: () => undefined,
  submitTimeBlock: () => Promise.resolve(),
  removeTimeBlock: () => Promise.resolve(),
  saveAsTemplate: () => Promise.resolve(),
  remove: () => Promise.resolve(),
  createChildTask: () => Promise.resolve(),
  moveTask: () => Promise.resolve(),
};
const list = {
  selectedIds: [],
  editingId: null,
  onSelect: () => undefined,
  onBeginEdit: () => undefined,
  onEndEdit: () => undefined,
  onVisibleOrderChange: () => undefined,
};

describe("updateHiddenCalendarIds", () => {
  it("can hide and then show the same calendar without retaining stale state", () => {
    const hidden = updateHiddenCalendarIds([], "calendar-work", false);
    expect(hidden).toEqual(["calendar-work"]);
    expect(updateHiddenCalendarIds(hidden, "calendar-work", true)).toEqual([]);
  });

  it("does not duplicate a hidden calendar", () => {
    expect(
      updateHiddenCalendarIds(["calendar-work"], "calendar-work", false),
    ).toEqual(["calendar-work"]);
  });
});

describe("TodayPage", () => {
  const props: TodayPageProps = {
    dayPlan: undefined,
    planningPreferences: undefined,
    tasks: [],
    projects: [],
    tags: [],
    activeSession: null,
    syncStatus: "offline",
    planner: null,
    baikalCalendars: [],
    calendarActionsAvailable: false,
    focusActionsAvailable: false,
    busy: false,
    actions,
    list,
    onSubmitTask: () => Promise.resolve(),
    onViewTasks: () => undefined,
  };
  const note = noteSchema.parse({
    id: "2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d",
    ownerId: "5b7c3f1e-5d2a-4c2e-9d0e-1f2a3b4c5d6e",
    content: "Water the **seedlings**",
    projectId: null,
    tagId: null,
    pinnedToToday: true,
    position: 0,
    revision: 1,
    createdAt: "2026-10-02T12:00:00.000Z",
    updatedAt: "2026-10-02T12:00:00.000Z",
  });

  it("uses child estimates once in the daily overview, rather than the stored parent estimate", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-09T12:00:00Z"));
    try {
      const parent: Task = {
        id: "parent",
        title: "A parent",
        notes: "",
        status: "open",
        revision: 1,
        createdAt: "2026-11-09T12:00:00Z",
        updatedAt: "2026-11-09T12:00:00Z",
        completedAt: null,
        deletedAt: null,
        plannedStart: null,
        plannedDay: "2026-11-09",
        estimateMinutes: 120,
      };
      const html = renderToStaticMarkup(
        <TodayPage
          {...props}
          planningPreferences={{
            timeZone: "UTC",
            workingDays: [1, 2, 3, 4, 5],
            workdayStart: "09:00",
            workdayEnd: "17:00",
            breakStart: "12:00",
            breakEnd: "12:30",
          }}
          tasks={[
            parent,
            {
              ...parent,
              id: "child-a",
              parentId: parent.id,
              estimateMinutes: 30,
            },
            {
              ...parent,
              id: "child-b",
              parentId: parent.id,
              estimateMinutes: 15,
            },
          ]}
        />,
      );
      expect(html).toMatch(/Estimated.*?>45m<\/strong>/);
      expect(html).not.toMatch(/Estimated.*?>2h<\/strong>/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders cached pinned notes with no connection and no session", () => {
    const html = renderToStaticMarkup(
      <TodayPage {...props} pinnedNotes={[note]} />,
    );
    expect(html).toContain("Pinned notes");
    expect(html).toContain("Water the <strong>seedlings</strong>");
  });

  it("shows no pinned notes section when nothing is pinned", () => {
    expect(renderToStaticMarkup(<TodayPage {...props} />)).not.toContain(
      "Pinned notes",
    );
  });
});

describe("week plan loading (issue #169)", () => {
  const props: TodayPageProps = {
    dayPlan: undefined,
    planningPreferences: undefined,
    tasks: [],
    projects: [],
    tags: [],
    activeSession: null,
    syncStatus: "online",
    planner: null,
    baikalCalendars: [],
    calendarActionsAvailable: false,
    focusActionsAvailable: false,
    busy: false,
    actions,
    list,
    onSubmitTask: () => Promise.resolve(),
    onViewTasks: () => undefined,
  };

  it("holds the week plan with placeholder rows until the planner loads", () => {
    const html = renderToStaticMarkup(<TodayPage {...props} />);
    expect(html).toContain("Loading the week plan");
    expect(html).not.toContain("No supported events in this week.");
  });

  it("shows the empty state offline instead of a placeholder that never resolves", () => {
    const html = renderToStaticMarkup(
      <TodayPage {...props} syncStatus="offline" />,
    );
    expect(html).not.toContain("Loading the week plan");
    expect(html).toContain("No supported events in this week.");
  });
});
