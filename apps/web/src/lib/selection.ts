/**
 * Task selection for the workspace lists (issue #194). Pure functions over
 * the visible order so the keyboard follows what the owner sees. `App`
 * holds one `Selection` and passes it down; no component keeps its own.
 */
export interface Selection {
  readonly ids: readonly string[];
  /** The id a Shift-click extends from; null after a toggle removed it. */
  readonly anchor: string | null;
}

export const emptySelection: Selection = { ids: [], anchor: null };

export const selectSingle = (id: string): Selection => ({
  ids: [id],
  anchor: id,
});

export const toggle = (selection: Selection, id: string): Selection =>
  selection.ids.includes(id)
    ? {
        ids: selection.ids.filter((current) => current !== id),
        anchor: selection.anchor === id ? null : selection.anchor,
      }
    : { ids: [...selection.ids, id], anchor: selection.anchor ?? id };

export const extendTo = (
  selection: Selection,
  order: readonly string[],
  id: string,
): Selection => {
  const anchor = selection.anchor ?? selection.ids[0];
  const from = anchor === undefined ? -1 : order.indexOf(anchor);
  const to = order.indexOf(id);
  if (from === -1 || to === -1) return selectSingle(id);
  const [start, end] = from <= to ? [from, to] : [to, from];
  return { ids: order.slice(start, end + 1), anchor: anchor ?? id };
};

const step = (
  selection: Selection,
  order: readonly string[],
  direction: 1 | -1,
): Selection => {
  if (order.length === 0) return emptySelection;
  const current = primaryId(selection) ?? selection.anchor;
  const index = current === null ? -1 : order.indexOf(current);
  if (index === -1) {
    const first = order[direction === 1 ? 0 : order.length - 1];
    return first === undefined ? emptySelection : selectSingle(first);
  }
  const target =
    order[Math.min(Math.max(index + direction, 0), order.length - 1)];
  return target === undefined ? emptySelection : selectSingle(target);
};

export const next = (selection: Selection, order: readonly string[]) =>
  step(selection, order, 1);

export const previous = (selection: Selection, order: readonly string[]) =>
  step(selection, order, -1);

/** Drops ids that left the visible list; returns the same object when none did. */
export const retain = (
  selection: Selection,
  order: readonly string[],
): Selection => {
  const visible = new Set(order);
  if (
    selection.ids.every((id) => visible.has(id)) &&
    (selection.anchor === null || visible.has(selection.anchor))
  )
    return selection;
  return {
    ids: selection.ids.filter((id) => visible.has(id)),
    anchor:
      selection.anchor !== null && visible.has(selection.anchor)
        ? selection.anchor
        : null,
  };
};

/** The one selected id, or null when none or several are selected. */
export const primaryId = (selection: Selection): string | null =>
  selection.ids.length === 1 ? (selection.ids[0] ?? null) : null;
