import type { Task } from "@suite/contracts";
import { zonedCalendarDate } from "@suite/domain";

export type TaskListItemState =
  "overdue" | "scheduled" | "planned-day" | "planning" | "completed";

/** In-place title editing on a row (issue #194); pure, so tests can drive it. */
export type TitleEdit =
  | { readonly editing: false }
  | {
      readonly editing: true;
      readonly draft: string;
      readonly original: string;
    };

export const beginEdit = (title: string): TitleEdit => ({
  editing: true,
  draft: title,
  original: title,
});

export const changeDraft = (edit: TitleEdit, draft: string): TitleEdit =>
  edit.editing ? { ...edit, draft } : edit;

/** Ends the edit; `save` is the trimmed title, or null when nothing changed or it is blank. */
export const commitEdit = (
  edit: TitleEdit,
): { readonly next: TitleEdit; readonly save: string | null } => {
  if (!edit.editing) return { next: edit, save: null };
  const trimmed = edit.draft.trim();
  return {
    next: { editing: false },
    save: trimmed === "" || trimmed === edit.original ? null : trimmed,
  };
};

export const cancelEdit = (): TitleEdit => ({ editing: false });

export interface RowMetaItem {
  readonly kind: "time" | "overdue" | "today" | "estimate" | "deadline";
  readonly text: string;
  readonly tone?: "warning";
}

const dayMs = 86_400_000;

const daysBetween = (from: string, to: string): number =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / dayMs,
  );

const weekday = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  timeZone: "UTC",
});
const dayMonth = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "due Fri" within a week, "due 12 Nov" beyond; past deadlines say so. */
export const describeDeadline = (
  deadline: NonNullable<Task["deadline"]>,
  today: string,
  timeZone: string,
): { readonly text: string; readonly tone?: "warning" } => {
  const date =
    deadline.kind === "date"
      ? deadline.value
      : zonedCalendarDate(deadline.value, timeZone);
  const diff = daysBetween(today, date);
  const when = new Date(`${date}T00:00:00Z`);
  if (diff < 0)
    return {
      text: `was due ${diff >= -6 ? weekday.format(when) : dayMonth.format(when)}`,
      tone: "warning",
    };
  if (diff === 0) return { text: "due today", tone: "warning" };
  if (diff === 1) return { text: "due tomorrow" };
  if (diff <= 7) return { text: `due ${weekday.format(when)}` };
  return { text: `due ${dayMonth.format(when)}` };
};

export const formatEstimate = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${String(rest)}m`;
  return rest === 0 ? `${String(hours)}h` : `${String(hours)}h${String(rest)}m`;
};

const taskTime = (value: string, timeZone: string): string =>
  new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));

/** The metadata a row shows after its title, in order. */
export const rowMeta = (
  task: Task,
  state: TaskListItemState,
  at: string,
  timeZone: string,
  today: string,
): readonly RowMetaItem[] => {
  const items: RowMetaItem[] = [];
  if (state === "overdue")
    items.push({
      kind: "overdue",
      text:
        task.plannedStart == null && task.plannedDay != null
          ? `Overdue · planned for ${task.plannedDay}`
          : "Overdue",
      tone: "warning",
    });
  else if (state === "planned-day")
    items.push({ kind: "today", text: "Today" });
  else if (state === "scheduled")
    items.push({
      kind: "time",
      text: taskTime(task.plannedStart ?? at, timeZone),
    });
  if (task.estimateMinutes != null)
    items.push({
      kind: "estimate",
      text: formatEstimate(task.estimateMinutes),
    });
  if (task.deadline != null && state !== "completed") {
    const described = describeDeadline(task.deadline, today, timeZone);
    items.push(
      described.tone === undefined
        ? { kind: "deadline", text: described.text }
        : { kind: "deadline", text: described.text, tone: described.tone },
    );
  }
  return items;
};
