import { describe, expect, it } from "vitest";
import type { Task } from "@suite/contracts";
import {
  beginEdit,
  cancelEdit,
  changeDraft,
  commitEdit,
  describeDeadline,
  formatEstimate,
  rowMeta,
} from "./task-row-state.ts";

const task = (overrides: Partial<Task> = {}): Task => ({
  id: "t1",
  title: "Write the brief",
  notes: "",
  status: "open",
  revision: 1,
  createdAt: "2026-11-03T12:00:00.000Z",
  updatedAt: "2026-11-03T12:00:00.000Z",
  completedAt: null,
  deletedAt: null,
  plannedStart: null,
  estimateMinutes: null,
  ...overrides,
});

describe("title edit (issue #194)", () => {
  it("saves a changed, trimmed title and nothing otherwise", () => {
    const edit = beginEdit("Write the brief");
    expect(commitEdit(edit).save).toBeNull();
    expect(commitEdit(changeDraft(edit, "   ")).save).toBeNull();
    expect(commitEdit(changeDraft(edit, "  Write the brief ")).save).toBeNull();
    const changed = commitEdit(changeDraft(edit, " Draft the brief "));
    expect(changed.save).toBe("Draft the brief");
    expect(changed.next).toEqual({ editing: false });
  });

  it("cancels back to the original without saving", () => {
    expect(cancelEdit()).toEqual({ editing: false });
    expect(changeDraft(cancelEdit(), "x")).toEqual({ editing: false });
  });
});

describe("row metadata (issue #194)", () => {
  const today = "2026-11-03";
  const zone = "America/Chicago";

  it("names overdue and planned-day states with a warning tone", () => {
    expect(rowMeta(task(), "overdue", today, zone, today)).toEqual([
      { kind: "overdue", text: "Overdue", tone: "warning" },
    ]);
    expect(
      rowMeta(
        task({ plannedDay: "2026-11-01" }),
        "overdue",
        today,
        zone,
        today,
      ),
    ).toEqual([
      {
        kind: "overdue",
        text: "Overdue · planned for 2026-11-01",
        tone: "warning",
      },
    ]);
    expect(rowMeta(task(), "planned-day", today, zone, today)).toEqual([
      { kind: "today", text: "Today" },
    ]);
  });

  it("shows the scheduled time, then the estimate and deadline", () => {
    const items = rowMeta(
      task({
        plannedStart: "2026-11-03T15:30:00.000Z",
        estimateMinutes: 90,
        deadline: { kind: "date", value: "2026-11-05" },
      }),
      "scheduled",
      "2026-11-03T12:00:00.000Z",
      zone,
      today,
    );
    expect(items.map(({ kind }) => kind)).toEqual([
      "time",
      "estimate",
      "deadline",
    ]);
    expect(items[0]?.text).toBe("9:30 AM");
    expect(items[1]?.text).toBe("1h30m");
    expect(items[2]?.text).toBe("due Thu");
  });

  it("formats estimates compactly", () => {
    expect(formatEstimate(45)).toBe("45m");
    expect(formatEstimate(120)).toBe("2h");
    expect(formatEstimate(90)).toBe("1h30m");
  });

  it("describes deadlines relative to today", () => {
    expect(
      describeDeadline({ kind: "date", value: today }, today, zone),
    ).toEqual({ text: "due today", tone: "warning" });
    expect(
      describeDeadline({ kind: "date", value: "2026-11-04" }, today, zone),
    ).toEqual({ text: "due tomorrow" });
    expect(
      describeDeadline({ kind: "date", value: "2026-11-13" }, today, zone),
    ).toEqual({ text: "due 13 Nov" });
    expect(
      describeDeadline({ kind: "date", value: "2026-11-01" }, today, zone),
    ).toEqual({ text: "was due Sun", tone: "warning" });
    // 2026-11-04T03:00Z is still the 3rd in Chicago.
    expect(
      describeDeadline(
        { kind: "instant", value: "2026-11-04T03:00:00.000Z" },
        today,
        zone,
      ),
    ).toEqual({ text: "due today", tone: "warning" });
  });
});
