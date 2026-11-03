import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { CalendarClock, ChevronRight, Ellipsis, Play } from "lucide-react";
import type {
  BaikalStatusResponse,
  Project,
  Tag,
  Task,
} from "@suite/contracts";
import { Badge } from "../ui/badge.tsx";
import { Button } from "../ui/button.tsx";
import { Checkbox } from "../ui/checkbox.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu.tsx";
import { Input } from "../ui/input.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover.tsx";
import { TimeBlockForm } from "../../time-block-form.tsx";
import type { TaskActions } from "./task-actions.ts";
import {
  beginEdit,
  cancelEdit,
  changeDraft,
  commitEdit,
  rowMeta,
  type TaskListItemState,
  type TitleEdit,
} from "./task-row-state.ts";

export type { TaskListItemState } from "./task-row-state.ts";

export interface SelectModifiers {
  readonly shift: boolean;
  readonly toggle: boolean;
}

/** What a list passes to every row so selection stays in `App` (issue #194). */
export interface ListSelectionProps {
  readonly selectedIds: readonly string[];
  readonly editingId: string | null;
  readonly onSelect: (task: Task, modifiers: SelectModifiers) => void;
  readonly onBeginEdit: (task: Task) => void;
  readonly onEndEdit: () => void;
  readonly onVisibleOrderChange: (ids: readonly string[]) => void;
}

export interface TaskRowProps {
  readonly task: Task;
  readonly state: TaskListItemState;
  readonly at: string;
  readonly timeZone: string;
  readonly today: string;
  readonly project: Project | undefined;
  readonly tags: readonly Tag[];
  readonly selected: boolean;
  readonly editing: boolean;
  readonly focusState: "idle" | "running" | "blocked";
  readonly busy: boolean;
  readonly calendarActionsAvailable: boolean;
  readonly focusActionsAvailable: boolean;
  readonly calendars: BaikalStatusResponse["calendars"];
  readonly actions: TaskActions;
  /** ADR 0027: move controls for a saved day order. */
  readonly moveControls?:
    | {
        readonly canMoveUp: boolean;
        readonly canMoveDown: boolean;
        readonly onMove: (direction: -1 | 1) => void;
      }
    | undefined;
  /** Nested child rows, rendered under this row. */
  readonly children?: ReactNode;
  readonly childCount?: number | undefined;
  readonly onSelect: (task: Task, modifiers: SelectModifiers) => void;
  readonly onBeginEdit: (task: Task) => void;
  readonly onEndEdit: () => void;
}

const isControl = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  target.closest(
    "button, a, input, textarea, select, form, [role=menuitem]",
  ) !== null;

const maxTagChips = 3;

/**
 * One task on one line (issue #194): complete toggle, title, metadata and
 * the actions that appear on hover, focus or selection. Clicking the body
 * selects; the list owns selection, this row only reports it.
 */
export const TaskRow = ({
  task,
  state,
  at,
  timeZone,
  today,
  project,
  tags,
  selected,
  editing,
  focusState,
  busy,
  calendarActionsAvailable,
  focusActionsAvailable,
  calendars,
  actions,
  moveControls,
  children,
  childCount = 0,
  onSelect,
  onBeginEdit,
  onEndEdit,
}: TaskRowProps) => {
  const [edit, setEdit] = useState<TitleEdit>(() =>
    editing ? beginEdit(task.title) : { editing: false },
  );
  const [childrenOpen, setChildrenOpen] = useState(true);
  const [addingChild, setAddingChild] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);
  const completed = task.status === "completed";
  const isChild = task.parentId != null;

  // The list says which row edits; the draft lives here while it does.
  useEffect(() => {
    setEdit((current) =>
      editing === current.editing
        ? current
        : editing
          ? beginEdit(task.title)
          : cancelEdit(),
    );
  }, [editing, task.title]);

  const finishEdit = (save: boolean) => {
    const result = save ? commitEdit(edit) : { next: cancelEdit(), save: null };
    setEdit(result.next);
    if (result.save !== null)
      void actions.editTask(task, { title: result.save });
    onEndEdit();
    rowRef.current?.focus();
  };

  const onBodyClick = (event: MouseEvent<HTMLElement>) => {
    if (isControl(event.target) || edit.editing) return;
    onSelect(task, {
      shift: event.shiftKey,
      toggle: event.ctrlKey || event.metaKey,
    });
  };

  const onBodyDoubleClick = (event: MouseEvent<HTMLElement>) => {
    if (isControl(event.target) || completed) return;
    event.preventDefault();
    onBeginEdit(task);
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      finishEdit(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finishEdit(false);
    }
  };

  const meta = rowMeta(task, state, at, timeZone, today);
  const shownTags = tags.slice(0, maxTagChips);
  const hiddenTags = tags.length - shownTags.length;
  const toggleLabel = `${completed ? "Reopen" : "Complete"} “${task.title}”`;
  const focusLabel = `Start focus on “${task.title}”`;
  const focusDisabled =
    busy || !focusActionsAvailable || focusState === "blocked";

  return (
    <li
      ref={rowRef}
      className={[
        "task-row",
        selected ? "task-row--selected" : "",
        completed ? "task-row--completed" : "",
        isChild ? "task-row--child" : "",
        edit.editing ? "task-row--editing" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-task-id={task.id}
      data-state={state}
      role="option"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
    >
      <div
        className="task-row__main"
        onClick={onBodyClick}
        onDoubleClick={onBodyDoubleClick}
      >
        {childCount > 0 ? (
          <button
            type="button"
            className="task-row__chevron"
            aria-expanded={childrenOpen}
            aria-label={`${childrenOpen ? "Hide" : "Show"} ${String(childCount)} child ${childCount === 1 ? "task" : "tasks"} of “${task.title}”`}
            onClick={() => setChildrenOpen((open) => !open)}
          >
            <ChevronRight
              aria-hidden="true"
              className="task-row__chevron-icon"
              data-open={childrenOpen}
            />
          </button>
        ) : (
          <span className="task-row__chevron task-row__chevron--empty" />
        )}
        <Checkbox
          className="task-row__toggle"
          checked={completed}
          disabled={busy}
          aria-label={toggleLabel}
          onCheckedChange={() =>
            void actions.changeStatus(task, completed ? "reopen" : "complete")
          }
        />
        {edit.editing ? (
          <Input
            className="task-row__input"
            value={edit.draft}
            autoFocus
            aria-label={`Title of “${task.title}”`}
            onChange={(event) =>
              setEdit((current) => changeDraft(current, event.target.value))
            }
            onKeyDown={onInputKeyDown}
            onBlur={() => finishEdit(true)}
          />
        ) : (
          <span className="task-row__title">{task.title}</span>
        )}
        <span className="task-row__meta">
          {meta.map((item) => (
            <span
              key={item.kind}
              className="task-row__meta-item"
              data-kind={item.kind}
              data-tone={item.tone}
            >
              {item.text}
            </span>
          ))}
          {project !== undefined && (
            <span className="task-chip" data-kind="project">
              <span
                className="task-chip__swatch"
                aria-hidden="true"
                style={{
                  backgroundColor: project.color ?? "var(--overlay-0)",
                }}
              />
              {project.title}
            </span>
          )}
          {shownTags.map((tag) => (
            <span key={tag.id} className="task-chip" data-kind="tag">
              {tag.color !== null && (
                <span
                  className="task-chip__swatch"
                  aria-hidden="true"
                  style={{ backgroundColor: tag.color }}
                />
              )}
              #{tag.displayName}
            </span>
          ))}
          {hiddenTags > 0 && (
            <span
              className="task-chip"
              data-kind="more"
              title={tags
                .slice(maxTagChips)
                .map((tag) => `#${tag.displayName}`)
                .join(" ")}
            >
              +{hiddenTags}
            </span>
          )}
        </span>
        <span className="task-row__actions">
          {completed ? null : focusState === "running" ? (
            <Badge variant="now">Running</Badge>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={focusDisabled}
              aria-label={focusLabel}
              title={
                !focusActionsAvailable
                  ? "Reconnect to start focus."
                  : focusState === "blocked"
                    ? "Another task has the focus session."
                    : "Start focus"
              }
              onClick={() => actions.startFocus(task)}
            >
              <Play />
            </Button>
          )}
          {completed ? null : (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={
                    task.plannedStart === null
                      ? `Schedule “${task.title}”`
                      : `Change schedule for “${task.title}”`
                  }
                  title={
                    task.plannedStart === null ? "Schedule" : "Change schedule"
                  }
                >
                  <CalendarClock />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="task-row__schedule">
                <TimeBlockForm
                  task={task}
                  calendars={calendars}
                  busy={busy}
                  available={calendarActionsAvailable}
                  onSubmit={actions.submitTimeBlock}
                  onRemove={actions.removeTimeBlock}
                />
              </PopoverContent>
            </Popover>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`More actions for “${task.title}”`}
                title="More actions"
              >
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!completed && (
                <DropdownMenuItem onSelect={() => onBeginEdit(task)}>
                  Edit title
                </DropdownMenuItem>
              )}
              {!completed && !isChild && (
                <DropdownMenuItem onSelect={() => setAddingChild(true)}>
                  Add child task
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                disabled={busy}
                onSelect={() => void actions.saveAsTemplate(task)}
              >
                Save as template
              </DropdownMenuItem>
              {moveControls !== undefined && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={busy || !moveControls.canMoveUp}
                    onSelect={() => moveControls.onMove(-1)}
                  >
                    Move up
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={busy || !moveControls.canMoveDown}
                    onSelect={() => moveControls.onMove(1)}
                  >
                    Move down
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              {actions.archive !== undefined && !isChild && (
                <DropdownMenuItem
                  disabled={busy}
                  onSelect={() => void actions.archive?.(task)}
                >
                  Archive
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                variant="destructive"
                disabled={busy}
                onSelect={() => void actions.remove(task)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </div>
      {(childCount > 0 && childrenOpen) || addingChild ? (
        <div className="task-row__children">
          {childrenOpen && children}
          {addingChild && (
            <form
              className="task-row__child-form"
              aria-label={`Add a child task to ${task.title}`}
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const value = new FormData(form).get("title");
                const title = typeof value === "string" ? value.trim() : "";
                if (title === "") return;
                void actions.createChildTask(task, title).then(() => {
                  form.reset();
                  setAddingChild(false);
                });
              }}
            >
              <Input
                name="title"
                autoFocus
                autoComplete="off"
                placeholder="New child task"
                aria-label="New child task"
              />
              <Button type="submit" size="sm" disabled={busy}>
                Add
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setAddingChild(false)}
              >
                Cancel
              </Button>
            </form>
          )}
        </div>
      ) : null}
    </li>
  );
};
