import { useCallback, useEffect, useState, type SyntheticEvent } from "react";
import type {
  BoardPanel,
  BoardProviderMapping,
  BoardProviderSyncResponse,
  BoardView,
  IssueConnection,
  ProviderProject,
} from "@suite/contracts";
import {
  clearBoardProvider,
  getBoardProvider,
  listIssueConnectionProjects,
  listIssueConnections,
  setBoardProvider,
  syncBoardProvider,
} from "../../api.ts";
import { Button } from "../ui/button.tsx";
import { Checkbox } from "../ui/checkbox.tsx";
import { NativeSelect } from "../ui/native-select.tsx";

interface BoardProviderSectionProps {
  readonly boardId: string;
  readonly panels: readonly BoardPanel[];
  readonly csrfToken: string | undefined;
  readonly online: boolean;
  /** Receives the refreshed view after a sync moved tasks. */
  readonly onView: (view: BoardView) => void;
  readonly taskTitle: (taskId: string) => string;
}

interface Draft {
  connectionId: string;
  projectId: number | null;
  columns: Record<string, number | null>;
  writeBack: boolean;
}

const failure = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message !== "" ? error.message : fallback;

const stateLabel: Record<BoardProviderMapping["state"], string> = {
  idle: "Not synced yet",
  synced: "In step with Gitea",
  conflict: "Needs a decision",
  unavailable: "Gitea unavailable",
  authentication_required: "Reconnect the Gitea connection",
};

/**
 * Issue #174 (ADR 0054): attach a board to one Gitea project, map panels to
 * columns, run an inbound sync and read its result. Closed until a mapping
 * exists so a board without Gitea shows one summary line.
 */
export const BoardProviderSection = ({
  boardId,
  panels,
  csrfToken,
  online,
  onView,
  taskTitle,
}: BoardProviderSectionProps) => {
  const [connections, setConnections] = useState<readonly IssueConnection[]>(
    [],
  );
  const [mapping, setMapping] = useState<BoardProviderMapping | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [projects, setProjects] = useState<readonly ProviderProject[]>([]);
  const [result, setResult] = useState<BoardProviderSyncResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!online) return;
    try {
      const [overview, current] = await Promise.all([
        listIssueConnections(),
        getBoardProvider(boardId),
      ]);
      setConnections(
        overview.connections.filter(
          (connection) => connection.provider === "gitea",
        ),
      );
      setMapping(current);
      setResult(null);
      setDraft(null);
    } catch (error) {
      setMessage(failure(error, "The Gitea mapping could not be loaded."));
    }
  }, [boardId, online]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadProjects = useCallback(async (connectionId: string) => {
    if (connectionId === "") {
      setProjects([]);
      return;
    }
    try {
      setProjects(await listIssueConnectionProjects(connectionId));
    } catch (error) {
      setProjects([]);
      setMessage(failure(error, "Gitea projects could not be listed."));
    }
  }, []);

  const startEdit = () => {
    const connectionId = mapping?.connectionId ?? connections[0]?.id ?? "";
    setDraft({
      connectionId,
      projectId: mapping?.projectId ?? null,
      columns: Object.fromEntries(
        panels.map((panel) => [
          panel.id,
          mapping?.columns.find((column) => column.panelId === panel.id)
            ?.columnId ?? null,
        ]),
      ),
      writeBack: mapping?.writeBack ?? false,
    });
    void loadProjects(connectionId);
  };

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft === null || csrfToken === undefined) return;
    const project = projects.find(({ id }) => id === draft.projectId);
    if (project === undefined) {
      setMessage("Choose a Gitea project.");
      return;
    }
    const columns = panels.flatMap((panel) => {
      const columnId = draft.columns[panel.id] ?? null;
      const column = project.columns.find(({ id }) => id === columnId);
      return column === undefined
        ? []
        : [
            {
              panelId: panel.id,
              columnId: column.id,
              columnTitle: column.title,
            },
          ];
    });
    setBusy(true);
    try {
      setMapping(
        await setBoardProvider(
          boardId,
          {
            connectionId: draft.connectionId,
            projectId: project.id,
            projectTitle: project.title,
            columns,
            writeBack: draft.writeBack,
          },
          csrfToken,
        ),
      );
      setDraft(null);
      setMessage(null);
    } catch (error) {
      setMessage(failure(error, "The mapping could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (csrfToken === undefined) return;
    setBusy(true);
    try {
      await clearBoardProvider(boardId, csrfToken);
      setMapping(null);
      setResult(null);
      setMessage(null);
    } catch (error) {
      setMessage(failure(error, "The mapping could not be removed."));
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    if (csrfToken === undefined) return;
    setBusy(true);
    try {
      const response = await syncBoardProvider(boardId, csrfToken);
      setMapping(response.mapping);
      setResult(response);
      setMessage(null);
      if (response.moved.length > 0) onView(response.view);
    } catch (error) {
      setMessage(failure(error, "The sync did not complete."));
      void load();
    } finally {
      setBusy(false);
    }
  };

  const panelTitle = (panelId: string) =>
    panels.find((panel) => panel.id === panelId)?.title ?? "panel";
  const connectionLabel = (connectionId: string) =>
    connections.find(({ id }) => id === connectionId)?.repository ??
    "Gitea connection";
  const selectedProject = projects.find(({ id }) => id === draft?.projectId);

  if (!online) return null;
  if (connections.length === 0 && mapping === null) return null;

  return (
    <details className="board-provider" open={mapping !== null}>
      <summary>
        Gitea project
        {mapping !== null && `: ${mapping.projectTitle}`}
      </summary>
      {message !== null && <p className="message message-error">{message}</p>}
      {mapping !== null && draft === null && (
        <div className="board-provider__summary">
          <p>
            <strong>{mapping.projectTitle}</strong> in{" "}
            {connectionLabel(mapping.connectionId)} · {mapping.columns.length}{" "}
            {mapping.columns.length === 1 ? "panel" : "panels"} mapped
            {mapping.writeBack && " · write-back on"}
          </p>
          <p className="hint">
            {stateLabel[mapping.state]}
            {mapping.lastSyncedAt !== null &&
              ` · last sync ${mapping.lastSyncedAt}`}
            {mapping.message !== null && ` · ${mapping.message}`}
          </p>
          <div className="task-actions">
            <Button type="button" disabled={busy} onClick={() => void sync()}>
              Sync from Gitea
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={startEdit}
            >
              Edit mapping
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void remove()}
            >
              Remove
            </Button>
          </div>
          {result !== null && (
            <div className="board-provider__result" role="status">
              <p>
                {result.moved.length} moved · {result.unchanged} already in
                place · {result.conflicts.length}{" "}
                {result.conflicts.length === 1 ? "conflict" : "conflicts"}
              </p>
              {result.moved.length > 0 && (
                <ul>
                  {result.moved.map((move) => (
                    <li key={move.taskId}>
                      {taskTitle(move.taskId)} → {panelTitle(move.panelId)}{" "}
                      (issue #{move.issueNumber}, column {move.columnTitle})
                    </li>
                  ))}
                </ul>
              )}
              {result.conflicts.length > 0 && (
                <ul className="board-provider__conflicts">
                  {result.conflicts.map((conflict) => (
                    <li key={conflict.taskId}>
                      {taskTitle(conflict.taskId)} stays put: issue #
                      {conflict.issueNumber} is in column {conflict.columnTitle}{" "}
                      ({panelTitle(conflict.panelId)}). {conflict.reason}.
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
      {mapping === null && draft === null && (
        <div className="task-actions">
          <Button type="button" variant="outline" onClick={startEdit}>
            Attach a Gitea project
          </Button>
        </div>
      )}
      {draft !== null && (
        <form
          className="board-provider__form"
          onSubmit={(event) => void submit(event)}
        >
          <label className="field">
            <span>Connection</span>
            <NativeSelect
              value={draft.connectionId}
              onChange={(event) => {
                const connectionId = event.currentTarget.value;
                setDraft({ ...draft, connectionId, projectId: null });
                void loadProjects(connectionId);
              }}
            >
              <option value="">Choose a repository</option>
              {connections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.repository}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="field">
            <span>Project</span>
            <NativeSelect
              value={draft.projectId === null ? "" : String(draft.projectId)}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  projectId:
                    event.currentTarget.value === ""
                      ? null
                      : Number(event.currentTarget.value),
                  columns: Object.fromEntries(
                    panels.map((panel) => [panel.id, null]),
                  ),
                })
              }
            >
              <option value="">
                {projects.length === 0
                  ? "No open projects"
                  : "Choose a project"}
              </option>
              {projects.map((project) => (
                <option key={project.id} value={String(project.id)}>
                  {project.title}
                </option>
              ))}
            </NativeSelect>
          </label>
          {selectedProject !== undefined && (
            <fieldset className="board-provider__columns">
              <legend>Panel columns</legend>
              {panels.map((panel) => (
                <label key={panel.id} className="field">
                  <span>{panel.title}</span>
                  <NativeSelect
                    value={
                      draft.columns[panel.id] == null
                        ? ""
                        : String(draft.columns[panel.id])
                    }
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        columns: {
                          ...draft.columns,
                          [panel.id]:
                            event.currentTarget.value === ""
                              ? null
                              : Number(event.currentTarget.value),
                        },
                      })
                    }
                  >
                    <option value="">Not mapped</option>
                    {selectedProject.columns.map((column) => (
                      <option key={column.id} value={String(column.id)}>
                        {column.title}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              ))}
            </fieldset>
          )}
          <label className="capture-option">
            <Checkbox
              checked={draft.writeBack}
              onCheckedChange={(checked) =>
                setDraft({ ...draft, writeBack: checked === true })
              }
            />
            Move the issue in Gitea when a task moves into a mapped panel
          </label>
          <div className="task-actions">
            <Button disabled={busy || csrfToken === undefined}>
              Save mapping
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDraft(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </details>
  );
};
