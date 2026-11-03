import { describe, expect, it } from "vitest";
import {
  emptySelection,
  extendTo,
  next,
  previous,
  primaryId,
  retain,
  selectSingle,
  toggle,
} from "./selection.ts";

const order = ["a", "b", "c", "d"] as const;

describe("selection helpers (issue #194)", () => {
  it("selects one task and anchors on it", () => {
    expect(selectSingle("b")).toEqual({ ids: ["b"], anchor: "b" });
    expect(primaryId(selectSingle("b"))).toBe("b");
  });

  it("toggles an id in and out and drops the anchor with it", () => {
    const two = toggle(selectSingle("a"), "c");
    expect(two.ids).toEqual(["a", "c"]);
    expect(two.anchor).toBe("a");
    expect(primaryId(two)).toBeNull();
    const back = toggle(two, "a");
    expect(back).toEqual({ ids: ["c"], anchor: null });
  });

  it("extends across the visible range in either direction", () => {
    expect(extendTo(selectSingle("b"), order, "d").ids).toEqual([
      "b",
      "c",
      "d",
    ]);
    expect(extendTo(selectSingle("c"), order, "a")).toEqual({
      ids: ["a", "b", "c"],
      anchor: "c",
    });
    expect(extendTo(emptySelection, order, "b")).toEqual(selectSingle("b"));
  });

  it("steps through the visible order and starts over when lost", () => {
    expect(next(emptySelection, order)).toEqual(selectSingle("a"));
    expect(next(selectSingle("a"), order)).toEqual(selectSingle("b"));
    expect(next(selectSingle("d"), order)).toEqual(selectSingle("d"));
    expect(next(selectSingle("gone"), order)).toEqual(selectSingle("a"));
    expect(previous(selectSingle("a"), order)).toEqual(selectSingle("a"));
    expect(previous(selectSingle("c"), order)).toEqual(selectSingle("b"));
    expect(previous(emptySelection, order)).toEqual(selectSingle("d"));
    expect(next(emptySelection, [])).toEqual(emptySelection);
  });

  it("keeps only ids that are still visible", () => {
    const three = extendTo(selectSingle("a"), order, "c");
    expect(retain(three, ["b", "c"])).toEqual({
      ids: ["b", "c"],
      anchor: null,
    });
    expect(retain(three, order)).toBe(three);
    expect(primaryId(emptySelection)).toBeNull();
  });
});
