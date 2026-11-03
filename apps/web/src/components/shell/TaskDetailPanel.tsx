import { useState, type SyntheticEvent } from "react";
import { Play, X } from "lucide-react";
import { groupTaskHierarchy } from "@suite/domain";
import type {
  BaikalStatusResponse,
  Project,
  Subtask,
  Tag,
  Task,
  TaskPatchRequest,
} from "@suite/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SectionHeading } from "@/components/ui/section-heading";
import { Textarea } from "@/components/ui/textarea";
import { useApplicationPreferences } from "../../application-preferences.tsx";
import { Field } from "../../field.tsx";
import { TimeBlockForm } from "../../time-block-form.tsx";
import { NoteMarkdown } from "../notes/NoteMarkdown.tsx";
import { DeadlineFields } from "../tasks/DeadlineFields.tsx";
import type { TaskActions } from "../tasks/task-actions.ts";
import {
  TaskChildrenSection,
  TaskPlacementControls,
} from "../tasks/TaskHierarchy.tsx";
import { TaskLinksPanel } from "../tasks/TaskLinksPanel.tsx";
import { TaskPlanningForm } from "../tasks/TaskPlanningForm.tsx";
import { TaskRecurrencePanel } from "../tasks/TaskRecurrence.tsx";
import {
  beginEdit,
  cancelEdit,
  changeDraft,
  commitEdit,
  type TitleEdit,
} from "../tasks/task-row-state.ts";

type FormSubmit = SyntheticEvent<HTMLFormElement, SubmitEvent>;

export interface TaskDetailPanelProps {
  readonly task: Task;
  readonly tasks: readonly Task[];
  readonly projects: readonly Project[];
  readonly tags: readonly Tag[];
  readonly subtasks: readonly Subtask[];
  readonly provenance: string | undefined;
  readonly calendars: BaikalStatusResponse["calendars"];
  readonly timeZone: string;
  readonly today: string;
  readonly busy: boolean;
  readonly online: boolean;
  readonly csrfToken: string | undefined;
  readonly calendarActionsAvailable: boolean;
  readonly focusState: "idle" | "running" | "blocked";
  readonly focusActionsAvailable: boolean;
  readonly actions: TaskActions;
  readonly onSubmitTaskEdit: (event: FormSubmit, task: Task) => Promise<void>;
  readonly onSubmitTaskOrganization: (
    event: FormSubmit,
    task: Task,
  ) => Promise<void>;
  readonly onSubmitTaskPlanning?:
    ((task: Task, patch: TaskPatchRequest) => Promise<void>) | undefined;
  readonly onSubmitSubtask: (event: FormSubmit, task: Task) => Promise<void>;
  readonly onChangeSubtask: (
    subtask: Subtask,
    action: "toggle" | "up" | "down" | "delete",
  ) => Promise<void>;
  readonly onClose: () => void;
}

/**
 * The selected task (issue #194): the editor the Tasks page rendered under
 * every row, in one column. Each section is an existing component; the
 * panel only arranges them and adds the in-place title and notes edits.
 */
export const TaskDetailPanel = ({
  task,
  tasks,
  projects,
  tags,
  subtasks,
  provenance,
  calendars,
  timeZone,
  today,
  busy,
  online,
  csrfToken,
  calendarActionsAvailable,
  focusState,
  focusActionsAvailable,
  actions,
  onSubmitTaskEdit,
  onSubmitTaskOrganization,
  onSubmitTaskPlanning,
  onSubmitSubtask,
  onChangeSubtask,
  onClose,
}: TaskDetailPanelProps) => {
  const { markdownInNotes } = useApplicationPreferences().snapshot.preferences;
  const [title, setTitle] = useState<TitleEdit>({ editing: false });
  const [notesOpen, setNotesOpen] = useState(false);
  const completed = task.status === "completed";
  const { childrenByParent } = groupTaskHierarchy(
    tasks.filter((candidate) => candidate.deletedAt == null),
  );
  const children = childrenByParent.get(task.id) ?? [];
  const siblings =
    task.parentId == null ? [] : (childrenByParent.get(task.parentId) ?? []);
  const titleById = new Map(tasks.map(({ id, title: t }) => [id, t]));
  const parents = tasks.filter(
    (candidate) => candidate.parentId == null && candidate.deletedAt == null,
  );

  const finishTitle = (save: boolean) => {
    const result = save
      ? commitEdit(title)
      : { next: cancelEdit(), save: null };
    setTitle(result.next);
    if (result.save !== null)
      void actions.editTask(task, { title: result.save });
  };

  return (
    <aside className="task-detail" aria-label="Task details">
      <header className="task-detail__header">
        <Checkbox
          className="task-row__toggle"
          checked={completed}
          disabled={busy}
          aria-label={`${completed ? "Reopen" : "Complete"} “${task.title}”`}
          onCheckedChange={() =>
            void actions.changeStatus(task, completed ? "reopen" : "complete")
          }
        />
        {title.editing ? (
          <Input
            className="task-detail__title-input"
            value={title.draft}
            autoFocus
            aria-label="Task title"
            onChange={(event) =>
              setTitle((current) => changeDraft(current, event.target.value))
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                finishTitle(true);
              } else if (event.key === "Escape") {
                event.preventDefault();
                finishTitle(false);
              }
            }}
            onBlur={() => finishTitle(true)}
          />
        ) : (
          <button
            type="button"
            className="task-detail__title"
            disabled={completed}
            title={completed ? undefined : "Edit title"}
            onClick={() => setTitle(beginEdit(task.title))}
          >
            {task.title}
          </button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close task details"
          onClick={onClose}
        >
          <X />
        </Button>
      </header>
      <div className="task-detail__meta">
        {focusState === "running" ? (
          <Badge variant="now">Focus running</Badge>
        ) : completed ? null : (
          <Button
            type="button"
            size="sm"
            disabled={
              busy || !focusActionsAvailable || focusState === "blocked"
            }
            title={
              !focusActionsAvailable
                ? "Reconnect to start focus."
                : focusState === "blocked"
                  ? "Another task has the focus session."
                  : undefined
            }
            onClick={() => actions.startFocus(task)}
          >
            <Play aria-hidden="true" />
            Start focus
          </Button>
        )}
        {task.parentId != null && (
          <Badge variant="outline">
            Child of {titleById.get(task.parentId) ?? "another task"}
          </Badge>
        )}
        {completed && <Badge variant="secondary">Completed</Badge>}
      </div>

      <section className="task-detail__section" aria-labelledby="detail-plan">
        <SectionHeading as="h2" id="detail-plan" title="Plan" />
        {onSubmitTaskPlanning !== undefined && (
          <TaskPlanningForm
            key={`${task.id}:${String(task.revision)}`}
            task={task}
            timeZone={timeZone}
            busy={busy}
            available={true}
            remindersAvailable={calendarActionsAvailable}
            onSubmit={onSubmitTaskPlanning}
          />
        )}
        <TimeBlockForm
          task={task}
          calendars={calendars}
          busy={busy}
          available={calendarActionsAvailable}
          onSubmit={actions.submitTimeBlock}
          onRemove={actions.removeTimeBlock}
        />
        <form
          className="task-edit"
          key={`edit:${task.id}:${String(task.revision)}`}
          onSubmit={(event) => void onSubmitTaskEdit(event, task)}
        >
          <input type="hidden" name="title" value={task.title} readOnly />
          <input type="hidden" name="notes" value={task.notes} readOnly />
          <label className="field">
            <span>Estimate minutes</span>
            <Input
              name="estimateMinutes"
              type="number"
              min="1"
              max="720"
              defaultValue={task.estimateMinutes ?? ""}
            />
          </label>
          <DeadlineFields
            key={JSON.stringify(task.deadline)}
            deadline={task.deadline}
          />
          <Button size="sm" disabled={busy}>
            Save estimate and deadline
          </Button>
        </form>
      </section>

      <section
        className="task-detail__section"
        aria-labelledby="detail-organize"
      >
        <SectionHeading as="h2" id="detail-organize" title="Organize" />
        <form
          className="task-edit"
          key={`org:${task.id}:${String(task.revision)}`}
          onSubmit={(event) => void onSubmitTaskOrganization(event, task)}
        >
          <label className="field">
            <span>Project</span>
            <NativeSelect name="projectId" defaultValue={task.projectId ?? ""}>
              <option value="">No project</option>
              {projects
                .filter((project) => project.archivedAt === null)
                .map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
            </NativeSelect>
          </label>
          <fieldset>
            <legend>Tags</legend>
            {tags
              .filter((tag) => tag.archivedAt === null)
              .map((tag) => (
                <label key={tag.id}>
                  <Checkbox
                    name="tagIds"
                    value={tag.id}
                    defaultChecked={task.tagIds?.includes(tag.id) === true}
                  />
                  {tag.displayName}
                </label>
              ))}
          </fieldset>
          <Button size="sm" disabled={busy}>
            Save organization
          </Button>
        </form>
        <TaskPlacementControls
          task={task}
          siblings={siblings}
          parents={parents}
          parentTitle={
            task.parentId == null
              ? null
              : (titleById.get(task.parentId) ?? null)
          }
          hasChildren={children.length > 0}
          busy={busy}
          onMoveTask={actions.moveTask}
        />
      </section>

      <section className="task-detail__section" aria-labelledby="detail-notes">
        <SectionHeading
          as="h2"
          id="detail-notes"
          title="Notes"
          actions={
            <Button
              type="button"
              variant="ghost"
              size="xs"
              aria-expanded={notesOpen}
              onClick={() => setNotesOpen((open) => !open)}
            >
              {notesOpen
                ? "Cancel"
                : task.notes === ""
                  ? "Add notes"
                  : "Edit notes"}
            </Button>
          }
        />
        {notesOpen ? (
          <form
            className="task-detail__notes-form"
            onSubmit={(event) => {
              event.preventDefault();
              const value = new FormData(event.currentTarget).get("notes");
              const notes = typeof value === "string" ? value : "";
              void actions
                .editTask(task, { notes })
                .then(() => setNotesOpen(false));
            }}
          >
            <Textarea
              name="notes"
              defaultValue={task.notes}
              aria-label="Task notes"
              autoFocus
            />
            <Button size="sm" disabled={busy}>
              Save notes
            </Button>
          </form>
        ) : task.notes === "" ? (
          <p className="hint">No notes.</p>
        ) : markdownInNotes ? (
          <NoteMarkdown content={task.notes} />
        ) : (
          <p className="task-detail__notes">{task.notes}</p>
        )}
      </section>

      {task.parentId == null && (
        <section
          className="task-detail__section"
          aria-labelledby="detail-children"
        >
          <SectionHeading as="h2" id="detail-children" title="Child tasks" />
          <TaskChildrenSection
            parent={task}
            items={children}
            busy={busy}
            renderChild={(child) => (
              <li key={child.id} className="task-detail__child">
                <Checkbox
                  checked={child.status === "completed"}
                  disabled={busy}
                  aria-label={`${child.status === "completed" ? "Reopen" : "Complete"} “${child.title}”`}
                  onCheckedChange={() =>
                    void actions.changeStatus(
                      child,
                      child.status === "completed" ? "reopen" : "complete",
                    )
                  }
                />
                <span>{child.title}</span>
              </li>
            )}
            onCreateChildTask={actions.createChildTask}
          />
        </section>
      )}

      <section
        className="task-detail__section"
        aria-labelledby="detail-checklist"
      >
        <SectionHeading as="h2" id="detail-checklist" title="Checklist" />
        <ul className="task-detail__checklist">
          {subtasks.map((subtask, index, items) => (
            <li key={subtask.id}>
              <Checkbox
                checked={subtask.completed}
                disabled={busy}
                aria-label={`${subtask.completed ? "Reopen" : "Complete"} “${subtask.title}”`}
                onCheckedChange={() => void onChangeSubtask(subtask, "toggle")}
              />
              <span>{subtask.title}</span>
              <span className="task-detail__checklist-actions">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={busy || index === 0}
                  onClick={() => void onChangeSubtask(subtask, "up")}
                >
                  Up
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={busy || index === items.length - 1}
                  onClick={() => void onChangeSubtask(subtask, "down")}
                >
                  Down
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={busy}
                  onClick={() => void onChangeSubtask(subtask, "delete")}
                >
                  Remove
                </Button>
              </span>
            </li>
          ))}
        </ul>
        <form
          className="task-detail__inline-form"
          onSubmit={(event) => void onSubmitSubtask(event, task)}
        >
          <Field label="New checklist item" name="title" autoComplete="off" />
          <Button size="sm" disabled={busy}>
            Add item
          </Button>
        </form>
      </section>

      {csrfToken !== undefined && (
        <section
          className="task-detail__section"
          aria-labelledby="detail-links"
        >
          <SectionHeading as="h2" id="detail-links" title="Links" />
          <TaskLinksPanel
            taskId={task.id}
            csrfToken={csrfToken}
            online={online}
          />
        </section>
      )}

      {csrfToken !== undefined && (
        <section
          className="task-detail__section"
          aria-labelledby="detail-recurrence"
        >
          <SectionHeading as="h2" id="detail-recurrence" title="Recurrence" />
          <TaskRecurrencePanel
            task={task}
            csrfToken={csrfToken}
            online={online}
            today={today}
            tags={tags}
          />
        </section>
      )}

      <footer className="task-detail__footer">
        <div className="task-actions">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void actions.saveAsTemplate(task)}
          >
            Save as template
          </Button>
          {actions.archive !== undefined && task.parentId == null && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || !online}
              title="Move this task and its children to History"
              onClick={() => void actions.archive?.(task)}
            >
              Archive
            </Button>
          )}
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={() => void actions.remove(task)}
          >
            Delete
          </Button>
        </div>
        <p className="task-detail__provenance">
          Revision {task.revision}
          {provenance !== undefined && " · Created from a reusable template."}
        </p>
      </footer>
    </aside>
  );
};
