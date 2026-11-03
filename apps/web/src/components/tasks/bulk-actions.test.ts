import { describe, expect, it } from "vitest";
import type { Task } from "@suite/contracts";
import { runBulk } from "./bulk-actions.ts";

const task = (id: string): Task => ({
  id,
  title: `Task ${id}`,
  notes: "",
  status: "open",
  revision: 1,
  createdAt: "2026-11-03T12:00:00.000Z",
  updatedAt: "2026-11-03T12:00:00.000Z",
  completedAt: null,
  deletedAt: null,
  plannedStart: null,
  estimateMinutes: null,
});

describe("runBulk (issue #194)", () => {
  const three = [task("a"), task("b"), task("c")];

  it("reports success with no message", async () => {
    const seen: string[] = [];
    const result = await runBulk(three, (t) => {
      seen.push(t.id);
      return Promise.resolve(true);
    });
    expect(result).toEqual({ done: 3, failed: null, message: null });
    expect(seen).toEqual(["a", "b", "c"]);
  });

  it("stops at the first failure and names it", async () => {
    const seen: string[] = [];
    const result = await runBulk(three, (t) => {
      seen.push(t.id);
      if (t.id === "b") return Promise.reject(new Error("revision changed"));
      return Promise.resolve(undefined);
    });
    expect(seen).toEqual(["a", "b"]);
    expect(result.done).toBe(1);
    expect(result.failed?.id).toBe("b");
    expect(result.message).toBe(
      "Changed 1 of 3. “Task b” did not change: revision changed",
    );
  });

  it("treats a false outcome as a refusal without a reason", async () => {
    const result = await runBulk(three, (t) => Promise.resolve(t.id !== "c"));
    expect(result.done).toBe(2);
    expect(result.message).toBe("Changed 2 of 3. “Task c” did not change.");
  });
});
