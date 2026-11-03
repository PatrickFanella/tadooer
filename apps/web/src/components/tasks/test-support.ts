import type { TaskActions } from "./task-actions.ts";
import type { TaskListContext } from "./TaskList.tsx";
import type { ListSelectionProps } from "./TaskRow.tsx";

/** Inert callbacks for static-markup tests of lists and rows (issue #194). */
export const noopActions: TaskActions = {
  changeStatus: () => Promise.resolve(true),
  editTask: () => Promise.resolve(),
  startFocus: () => undefined,
  submitTimeBlock: () => Promise.resolve(),
  removeTimeBlock: () => Promise.resolve(),
  saveAsTemplate: () => Promise.resolve(),
  remove: () => Promise.resolve(),
  createChildTask: () => Promise.resolve(),
  moveTask: () => Promise.resolve(),
};

export const noopList: ListSelectionProps = {
  selectedIds: [],
  editingId: null,
  onSelect: () => undefined,
  onBeginEdit: () => undefined,
  onEndEdit: () => undefined,
  onVisibleOrderChange: () => undefined,
};

export const listContext = (
  overrides: Partial<TaskListContext> = {},
): TaskListContext => ({
  at: "2026-11-03T12:00:00.000Z",
  timeZone: "America/Chicago",
  today: "2026-11-03",
  projects: [],
  tags: [],
  activeSession: null,
  calendars: [],
  busy: false,
  calendarActionsAvailable: false,
  focusActionsAvailable: false,
  actions: noopActions,
  list: noopList,
  ...overrides,
});
