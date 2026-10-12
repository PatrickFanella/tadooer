import { useEffect, useState, type DragEvent } from "react";
import type { Task } from "@suite/contracts";
import { Button } from "../ui/button.tsx";
import { EmptyState } from "../ui/empty-state.tsx";
import { Input } from "../ui/input.tsx";
import { NativeSelect } from "../ui/native-select.tsx";
import { SectionHeading } from "../ui/section-heading.tsx";

/**
 * Unplanned-tasks drawer (issue #172). A side panel of open tasks with no
 * planned day or time that can be dragged onto a planner day or a board
 * panel. Drag-and-drop uses the native HTML API with a private data type;
 * every row also has a select-and-place control so the same move works
 * from the keyboard. The open state is kept per device and page.
 */
export const taskDragType = "application/x-tadooer-task";

export const isUnplanned = (task: Task): boolean =>
  task.status === "open" &&
  task.deletedAt == null &&
  task.archivedAt == null &&
  task.plannedStart == null &&
  task.plannedDay == null;

/** Task ID carried by a drag, or null when the drag is something else. */
export const draggedTaskId = (event: DragEvent): string | null => {
  if (!event.dataTransfer.types.includes(taskDragType)) return null;
  const id = event.dataTransfer.getData(taskDragType);
  return id === "" ? null : id;
};

export const acceptsTaskDrag = (event: DragEvent): boolean =>
  event.dataTransfer.types.includes(taskDragType);

const storageKey = (page: string) => `tadooer.unplanned-drawer:${page}`;

/** Drawer open state remembered per device and page. */
export const useDrawerOpen = (
  page: string,
): [boolean, (open: boolean) => void] => {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(storageKey(page)) === "open";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(page), open ? "open" : "closed");
    } catch {
      // Private mode or a full store; the drawer simply opens closed next time.
    }
  }, [open, page]);
  return [open, setOpen];
};

export interface DrawerTarget {
  readonly id: string;
  readonly label: string;
}

export interface UnplannedTasksDrawerProps {
  readonly tasks: readonly Task[];
  /** Where a task can be placed; the keyboard control lists these. */
  readonly targets: readonly DrawerTarget[];
  readonly targetLabel: string;
  readonly placeLabel: string;
  readonly available: boolean;
  readonly busy: boolean;
  readonly onPlace: (task: Task, targetId: string) => void;
  readonly onClose: () => void;
}

export const UnplannedTasksDrawer = ({
  tasks,
  targets,
  targetLabel,
  placeLabel,
  available,
  busy,
  onPlace,
  onClose,
}: UnplannedTasksDrawerProps) => {
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const unplanned = tasks
    .filter(isUnplanned)
    .filter(
      (task) =>
        query.trim() === "" ||
        task.title.toLowerCase().includes(query.trim().toLowerCase()),
    )
    .toSorted((left, right) => left.title.localeCompare(right.title));
  const defaultTarget = targets[0]?.id ?? "";
  return (
    <aside
      className="unplanned-drawer"
      aria-labelledby="unplanned-drawer-title"
    >
      <SectionHeading
        id="unplanned-drawer-title"
        as="h2"
        eyebrow="Not yet planned"
        title="Unplanned tasks"
        actions={
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        }
      />
      <label className="field">
        <span>Search</span>
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </label>
      {!available && (
        <p className="hint">Placing a task needs this device to have synced.</p>
      )}
      {unplanned.length === 0 ? (
        <EmptyState
          title={
            query.trim() === ""
              ? "Everything is planned."
              : "No unplanned task matches."
          }
        />
      ) : (
        <ul className="unplanned-drawer__list" aria-label="Unplanned tasks">
          {unplanned.map((task) => {
            const target = chosen[task.id] ?? defaultTarget;
            return (
              <li
                key={task.id}
                className="unplanned-drawer__task"
                draggable={available && !busy}
                onDragStart={(event) => {
                  event.dataTransfer.setData(taskDragType, task.id);
                  event.dataTransfer.setData("text/plain", task.title);
                  event.dataTransfer.effectAllowed = "move";
                }}
              >
                <strong>{task.title}</strong>
                {task.estimateMinutes !== null && (
                  <small>{String(task.estimateMinutes)} min</small>
                )}
                {targets.length > 0 && (
                  <form
                    className="unplanned-drawer__place"
                    aria-label={`Place “${task.title}”`}
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (target !== "") onPlace(task, target);
                    }}
                  >
                    <NativeSelect
                      aria-label={`${targetLabel} for “${task.title}”`}
                      value={target}
                      onChange={(event) =>
                        setChosen((current) => ({
                          ...current,
                          [task.id]: event.currentTarget.value,
                        }))
                      }
                    >
                      {targets.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </NativeSelect>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!available || busy || target === ""}
                    >
                      {placeLabel}
                    </Button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
};
