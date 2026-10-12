import {
  giteaColumnIssuePayloadSchema,
  giteaIssueIdPayloadSchema,
  giteaProjectColumnPayloadSchema,
  giteaProjectPayloadSchema,
  type BoardMoveProviderEffect,
  type BoardProviderMapping,
  type BoardProviderMappingSetRequest,
  type BoardProviderSyncResponse,
  type IssueConnectionInput,
  type ProviderProject,
} from "@suite/contracts";
import type { BoardClock } from "@suite/domain";
import type { SuiteDatabase } from "@suite/persistence";
import type { IssueConnectorService } from "./issue-connector.ts";
import { IssueProvider, IssueProviderError } from "./issue-provider.ts";

/**
 * Issue #174 (ADR 0054): a board follows one Gitea project. Inbound sync
 * moves linked tasks into the panel mapped to their issue's column through
 * the ordinary previewed board move; write-back, when enabled on the
 * mapping, moves the issue after a local panel move has committed.
 */
export class BoardProviderError extends Error {
  constructor(
    readonly code: "not_found" | "invalid" | "unsupported",
    message: string,
  ) {
    super(message);
  }
}

interface Parser<T> {
  safeParse(value: unknown): { success: boolean; data?: T | undefined };
}

const pageLimit = 50;
const maxPages = 20;

export class BoardProviderService {
  readonly #provider: IssueProvider;

  constructor(
    private readonly db: SuiteDatabase,
    private readonly issues: IssueConnectorService,
    fetcher?: typeof fetch,
  ) {
    this.#provider = new IssueProvider(fetcher);
  }

  #repository(connection: IssueConnectionInput): string {
    return connection.repository.split("/").map(encodeURIComponent).join("/");
  }

  #gitea(ownerId: string, connectionId: string): IssueConnectionInput {
    const connection = this.issues.credentials(ownerId, connectionId);
    if (connection.provider !== "gitea")
      throw new BoardProviderError(
        "unsupported",
        "Only Gitea projects can be attached to a board in this version.",
      );
    return connection;
  }

  async #pages<T>(
    connection: IssueConnectionInput,
    path: string,
    schema: Parser<T>,
  ): Promise<T[]> {
    const items: T[] = [];
    const separator = path.includes("?") ? "&" : "?";
    for (let page = 1; page <= maxPages; page++) {
      const value = await this.#provider.send(
        connection,
        `${path}${separator}limit=${String(pageLimit)}&page=${String(page)}`,
        { method: "GET" },
      );
      if (!Array.isArray(value))
        throw new IssueProviderError("invalid_response");
      for (const item of value as unknown[]) {
        const row = schema.safeParse(item);
        if (!row.success || row.data === undefined)
          throw new IssueProviderError("invalid_response");
        items.push(row.data);
      }
      if (value.length < pageLimit) return items;
    }
    throw new IssueProviderError("too_many_issues");
  }

  /** Open projects of the connection's repository with their columns. */
  async listProjects(
    ownerId: string,
    connectionId: string,
  ): Promise<ProviderProject[]> {
    const connection = this.#gitea(ownerId, connectionId);
    const repository = this.#repository(connection);
    const projects = await this.#pages(
      connection,
      `/repos/${repository}/projects?state=open`,
      giteaProjectPayloadSchema,
    );
    const result: ProviderProject[] = [];
    for (const project of projects) {
      if (project.is_closed === true) continue;
      const columns = await this.#pages(
        connection,
        `/repos/${repository}/projects/${String(project.id)}/columns`,
        giteaProjectColumnPayloadSchema,
      );
      result.push({
        id: project.id,
        title: project.title,
        columns: columns.map(({ id, title }) => ({ id, title })),
      });
    }
    return result;
  }

  getMapping(ownerId: string, boardId: string): BoardProviderMapping | null {
    if (this.db.boards.getBoard(ownerId, boardId) === undefined)
      throw new BoardProviderError("not_found", "Board not found");
    return this.db.boardProviders.get(ownerId, boardId) ?? null;
  }

  setMapping(
    ownerId: string,
    boardId: string,
    input: BoardProviderMappingSetRequest,
    now: string,
  ): BoardProviderMapping {
    const board = this.db.boards.getBoard(ownerId, boardId);
    if (board === undefined)
      throw new BoardProviderError("not_found", "Board not found");
    // Validates ownership and provider; the token is not used here.
    this.#gitea(ownerId, input.connectionId);
    const panelIds = new Set(board.panels.map(({ id }) => id));
    const seenPanels = new Set<string>();
    const seenColumns = new Set<number>();
    for (const column of input.columns) {
      if (!panelIds.has(column.panelId))
        throw new BoardProviderError(
          "invalid",
          "Every mapped panel must belong to this board",
        );
      if (seenPanels.has(column.panelId) || seenColumns.has(column.columnId))
        throw new BoardProviderError(
          "invalid",
          "Map each panel and each column at most once",
        );
      seenPanels.add(column.panelId);
      seenColumns.add(column.columnId);
    }
    const previous = this.db.boardProviders.get(ownerId, boardId);
    const mapping: BoardProviderMapping = {
      boardId,
      connectionId: input.connectionId,
      provider: "gitea",
      projectId: input.projectId,
      projectTitle: input.projectTitle,
      columns: input.columns,
      writeBack: input.writeBack,
      state: "idle",
      message: null,
      lastSyncedAt:
        previous?.connectionId === input.connectionId &&
        previous.projectId === input.projectId
          ? previous.lastSyncedAt
          : null,
      placements:
        previous?.connectionId === input.connectionId &&
        previous.projectId === input.projectId
          ? previous.placements
          : {},
      updatedAt: now,
    };
    this.db.boardProviders.put(ownerId, mapping);
    return mapping;
  }

  clearMapping(ownerId: string, boardId: string): void {
    if (this.db.boards.getBoard(ownerId, boardId) === undefined)
      throw new BoardProviderError("not_found", "Board not found");
    this.db.boardProviders.delete(ownerId, boardId);
  }

  #record(
    ownerId: string,
    mapping: BoardProviderMapping,
    patch: Partial<BoardProviderMapping>,
  ): BoardProviderMapping {
    const next = { ...mapping, ...patch };
    this.db.boardProviders.put(ownerId, next);
    return next;
  }

  #failed(
    ownerId: string,
    mapping: BoardProviderMapping,
    error: unknown,
    now: string,
  ): never {
    if (error instanceof IssueProviderError) {
      this.#record(ownerId, mapping, {
        state:
          error.code === "authentication_required"
            ? "authentication_required"
            : "unavailable",
        message: `Gitea ${error.code.replace(/_/g, " ")} at ${now}`,
        updatedAt: now,
      });
    }
    throw error;
  }

  /**
   * One inbound pass: linked tasks move into the panel of their issue's
   * column. A task changed locally since the last sync that sits in another
   * mapped panel is reported, not moved (ADR 0054).
   */
  async sync(
    ownerId: string,
    boardId: string,
    clock: BoardClock,
    now: string,
  ): Promise<BoardProviderSyncResponse> {
    const board = this.db.boards.getBoard(ownerId, boardId);
    const mapping = this.db.boardProviders.get(ownerId, boardId);
    if (board === undefined || mapping === undefined)
      throw new BoardProviderError(
        "not_found",
        "This board has no Gitea project attached",
      );
    const connection = this.#gitea(ownerId, mapping.connectionId);
    const repository = this.#repository(connection);
    const panelsById = new Map(board.panels.map((panel) => [panel.id, panel]));
    const desired = new Map<
      number,
      { panelId: string; columnTitle: string; columnId: number }
    >();
    try {
      for (const column of mapping.columns) {
        if (!panelsById.has(column.panelId)) continue;
        const issues = await this.#pages(
          connection,
          `/repos/${repository}/projects/${String(mapping.projectId)}/columns/${String(column.columnId)}/issues`,
          giteaColumnIssuePayloadSchema,
        );
        for (const issue of issues) {
          if (issue.pull_request != null) continue;
          desired.set(issue.number, {
            panelId: column.panelId,
            columnTitle: column.columnTitle,
            columnId: column.columnId,
          });
        }
      }
    } catch (error) {
      this.#failed(ownerId, mapping, error, now);
    }

    const mappedPanels = new Set(mapping.columns.map(({ panelId }) => panelId));
    const currentPanel = new Map<string, string>();
    const before = this.db.boards.viewBoard(ownerId, boardId, clock);
    if (before === undefined)
      throw new BoardProviderError("not_found", "Board not found");
    for (const member of before.members) {
      if (!mappedPanels.has(member.panelId)) continue;
      for (const taskId of member.taskIds)
        if (!currentPanel.has(taskId)) currentPanel.set(taskId, member.panelId);
    }

    const moved: BoardProviderSyncResponse["moved"] = [];
    const conflicts: BoardProviderSyncResponse["conflicts"] = [];
    const placements = { ...mapping.placements };
    let unchanged = 0;
    for (const link of this.db.issues.links(ownerId, mapping.connectionId)) {
      const target = desired.get(link.issue.number);
      if (target === undefined) continue;
      const task = this.db.getTask(ownerId, link.taskId);
      if (task?.deletedAt !== null) continue;
      const current = currentPanel.get(link.taskId);
      const base = {
        taskId: link.taskId,
        issueNumber: link.issue.number,
        panelId: target.panelId,
        columnTitle: target.columnTitle,
      };
      if (current === target.panelId) {
        unchanged++;
        placements[link.taskId] = { panelId: current, at: now };
        continue;
      }
      // Three-way check: the task sits somewhere other than where the last
      // sync left it, and Gitea wants a third place. Neither side moves.
      const recorded = placements[link.taskId];
      if (current !== undefined && recorded !== undefined) {
        if (recorded.panelId !== current) {
          conflicts.push({
            ...base,
            reason: `Moved here to “${panelsById.get(current)?.title ?? "another panel"}” after the last sync; move it again to confirm either side`,
          });
          continue;
        }
      }
      const plan = this.db.boards.planMove(
        ownerId,
        boardId,
        target.panelId,
        link.taskId,
        clock,
      );
      if (plan.kind !== "planned") {
        conflicts.push({
          ...base,
          reason:
            plan.kind === "invalid" ? plan.detail : "Board or panel not found",
        });
        continue;
      }
      const revision =
        this.db.boards.getBoard(ownerId, boardId)?.revision ?? board.revision;
      const result = this.db.boards.moveTask(
        ownerId,
        boardId,
        target.panelId,
        {
          expectedRevision: revision,
          taskId: link.taskId,
          taskRevision: plan.taskRevision,
        },
        clock,
        now,
      );
      if (result.kind !== "applied") {
        conflicts.push({
          ...base,
          reason:
            result.kind === "invalid"
              ? result.detail
              : "The task or board changed while syncing; run the sync again",
        });
        continue;
      }
      moved.push(base);
      placements[link.taskId] = { panelId: target.panelId, at: now };
      this.db.issues.putLink({
        ...link,
        message: `Moved to “${panelsById.get(target.panelId)?.title ?? "panel"}” from Gitea column “${target.columnTitle}” at ${now}`,
      });
    }
    const next = this.#record(ownerId, mapping, {
      state: conflicts.length > 0 ? "conflict" : "synced",
      message:
        conflicts.length > 0
          ? `${String(conflicts.length)} ${conflicts.length === 1 ? "task was" : "tasks were"} not moved; see the sync result`
          : null,
      lastSyncedAt: now,
      placements,
      updatedAt: now,
    });
    const view = this.db.boards.viewBoard(ownerId, boardId, clock);
    if (view === undefined)
      throw new BoardProviderError("not_found", "Board not found");
    return { mapping: next, moved, conflicts, unchanged, view };
  }

  /**
   * The provider side of a panel move. Returns undefined when the board has
   * no mapping with write-back, the panel is unmapped or the task is not
   * linked to an issue of the mapped connection. A dry run only plans.
   * A failed write never fails the local move; it is reported and recorded.
   */
  async writeBack(
    ownerId: string,
    boardId: string,
    panelId: string,
    taskId: string,
    dryRun: boolean,
    now: string,
  ): Promise<BoardMoveProviderEffect | undefined> {
    const mapping = this.db.boardProviders.get(ownerId, boardId);
    if (!mapping?.writeBack) return undefined;
    const column = mapping.columns.find((entry) => entry.panelId === panelId);
    if (column === undefined) return undefined;
    const link = this.db.issues
      .links(ownerId, mapping.connectionId)
      .find((entry) => entry.taskId === taskId);
    if (link === undefined) return undefined;
    const effect = {
      provider: "gitea" as const,
      issueNumber: link.issue.number,
      columnTitle: column.columnTitle,
    };
    if (dryRun) return { ...effect, state: "planned", message: null };
    try {
      const connection = this.#gitea(ownerId, mapping.connectionId);
      const repository = this.#repository(connection);
      const issue = giteaIssueIdPayloadSchema.safeParse(
        await this.#provider.send(
          connection,
          `/repos/${repository}/issues/${String(link.issue.number)}`,
          { method: "GET" },
        ),
      );
      if (!issue.success) throw new IssueProviderError("invalid_response");
      await this.#provider.send(
        connection,
        `/repos/${repository}/projects/${String(mapping.projectId)}/issues/${String(issue.data.id)}/move`,
        { method: "POST", body: { column_id: column.columnId } },
      );
      this.db.issues.putLink({
        ...link,
        message: `Issue moved to Gitea column “${column.columnTitle}” at ${now}`,
      });
      this.#record(ownerId, mapping, {
        placements: {
          ...mapping.placements,
          [taskId]: { panelId, at: now },
        },
        updatedAt: now,
      });
      return { ...effect, state: "applied", message: null };
    } catch (error) {
      const detail =
        error instanceof IssueProviderError
          ? `Gitea ${error.code.replace(/_/g, " ")}`
          : error instanceof Error
            ? error.message
            : "Write-back failed";
      this.#record(ownerId, mapping, {
        message: `${detail} while moving issue #${String(link.issue.number)} at ${now}; the local move was kept`,
        updatedAt: now,
      });
      return { ...effect, state: "failed", message: detail };
    }
  }
}
