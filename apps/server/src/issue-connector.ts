import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import type {
  ExternalIssue,
  IssueConnectionInput,
  IssueConnectionsResponse,
} from "@suite/contracts";
import type {
  SuiteDatabase,
  IssueConnectionRecord,
  IssueLinkRecord,
  TaskRecord,
} from "@suite/persistence";
import { loadOrCreateCredentialKey } from "./connector.ts";
import { IssueProvider, IssueProviderError } from "./issue-provider.ts";

export class IssueSyncError extends Error {}
const baseline = (task: TaskRecord) => ({
  title: task.title,
  notes: task.notes,
  status: task.status,
});
const status = (issue: ExternalIssue) =>
  issue.state === "closed" ? ("completed" as const) : ("open" as const);

export class IssueConnectorService {
  readonly #key: Buffer;
  readonly #provider: IssueProvider;
  readonly #busy = new Set<string>();
  constructor(
    private readonly db: SuiteDatabase,
    keyPath: string,
    readonly giteaOrigins: readonly string[],
    fetcher?: typeof fetch,
  ) {
    this.#key = loadOrCreateCredentialKey(keyPath);
    this.#provider = new IssueProvider(fetcher);
  }
  private aad(
    record: Pick<
      IssueConnectionRecord,
      "ownerId" | "id" | "origin" | "repository" | "provider"
    >,
  ): Buffer {
    return Buffer.from(
      JSON.stringify([
        "suite-issues-v1",
        record.ownerId,
        record.id,
        record.provider,
        record.origin,
        record.repository,
      ]),
    );
  }
  private encrypt(
    record: Pick<
      IssueConnectionRecord,
      "ownerId" | "id" | "provider" | "origin" | "repository"
    >,
    token: string,
  ): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, nonce);
    cipher.setAAD(this.aad(record));
    const ciphertext = Buffer.concat([
      cipher.update(token, "utf8"),
      cipher.final(),
    ]);
    return JSON.stringify([
      nonce.toString("base64"),
      ciphertext.toString("base64"),
      cipher.getAuthTag().toString("base64"),
    ]);
  }
  private input(record: IssueConnectionRecord): IssueConnectionInput {
    const repository = record.repository;
    if (
      record.provider === "gitea" &&
      !this.giteaOrigins.includes(record.origin)
    )
      throw new IssueSyncError(
        "This Gitea server is no longer allowed. Update the server configuration to reconnect.",
      );
    try {
      if (record.state === "disconnected") throw new Error();
      if (record.tokenScope === "global") {
        record = {
          ...record,
          id: "shared",
          repository: "",
          credential:
            this.db.issues.sharedToken(
              record.ownerId,
              record.provider,
              record.origin,
            ) ?? null,
        };
      }
      if (record.credential === null) throw new Error();
      const [nonce, ciphertext, tag] = JSON.parse(
        record.credential,
      ) as string[];
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.#key,
        Buffer.from(nonce ?? "", "base64"),
      );
      decipher.setAAD(this.aad(record));
      decipher.setAuthTag(Buffer.from(tag ?? "", "base64"));
      const token = Buffer.concat([
        decipher.update(Buffer.from(ciphertext ?? "", "base64")),
        decipher.final(),
      ]).toString("utf8");
      return {
        provider: record.provider,
        origin: record.origin,
        repository,
        writeBack: record.writeBack,
        token,
      };
    } catch {
      throw new IssueSyncError(
        "Reconnect this issue provider to restore access.",
      );
    }
  }
  private connection(ownerId: string, id: string): IssueConnectionRecord {
    const record = this.db.issues.connection(ownerId, id);
    if (record === undefined)
      throw new IssueSyncError("Issue connection not found.");
    return record;
  }
  private async exclusive<T>(id: string, work: () => Promise<T>): Promise<T> {
    if (this.#busy.has(id))
      throw new IssueSyncError(
        "This connection is busy. Refresh after the current operation finishes.",
      );
    this.#busy.add(id);
    try {
      return await work();
    } finally {
      this.#busy.delete(id);
    }
  }
  overview(ownerId: string): IssueConnectionsResponse {
    return {
      connections: this.db.issues.connections(ownerId).map((record) => ({
        id: record.id,
        provider: record.provider,
        origin: record.origin,
        repository: record.repository,
        tokenScope: record.tokenScope,
        writeBack: record.writeBack,
        state: record.state,
        lastSuccessfulSyncAt: record.lastSuccessfulSyncAt,
      })),
      links: this.db.issues.links(ownerId).map((record) => {
        const task = this.db.getTask(ownerId, record.taskId);
        return {
          id: record.id,
          connectionId: record.connectionId,
          taskId: record.taskId,
          issue: record.issue,
          lastSuccessfulSyncAt: record.lastSuccessfulSyncAt,
          message: record.message,
          state:
            task === undefined
              ? "task_deleted"
              : record.state === "synced" &&
                  JSON.stringify(baseline(task)) !==
                    JSON.stringify(record.baseline)
                ? "local_changes"
                : record.state,
        };
      }),
      giteaOrigins: [...this.giteaOrigins],
      sharedTokens: this.db.issues.sharedTokens(ownerId),
    };
  }
  async connect(ownerId: string, input: IssueConnectionInput): Promise<void> {
    const url = new URL(input.origin);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      (input.provider === "github"
        ? url.origin !== "https://github.com"
        : !this.giteaOrigins.includes(url.origin))
    )
      throw new IssueSyncError("Choose an allowed HTTPS provider origin.");
    input = { ...input, origin: url.origin };
    const existing = this.db.issues
      .connections(ownerId)
      .find(
        (record) =>
          record.provider === input.provider &&
          record.origin === input.origin &&
          record.repository.toLowerCase() === input.repository.toLowerCase(),
      );
    const id = existing?.id ?? randomUUID();
    await this.exclusive(
      `grant:${ownerId}:${input.provider}:${input.origin}`,
      () =>
        this.exclusive(id, async () => {
          const tokenScope = input.tokenScope ?? "repository";
          const shared = {
            ownerId,
            id: "shared",
            provider: input.provider,
            origin: input.origin,
            repository: "",
          };
          let token = input.token;
          if (tokenScope === "global" && token === "") {
            token = this.input({
              ...shared,
              repository: input.repository,
              tokenScope: "global",
              credential: null,
              state: "connected",
              writeBack: input.writeBack,
              lastSuccessfulSyncAt: null,
            }).token;
          }
          if (token === "")
            throw new IssueSyncError(
              "Provide a repository token or save a shared token first.",
            );
          // Verify repository access before saving a grant. No credential enters a response.
          await this.#provider.request(
            { ...input, token },
            `/repos/${input.repository.split("/").map(encodeURIComponent).join("/")}`,
          );
          const record: IssueConnectionRecord = {
            id,
            ownerId,
            provider: input.provider,
            origin: input.origin,
            repository: existing?.repository ?? input.repository,
            writeBack: input.writeBack,
            tokenScope,
            credential: null,
            state: "connected",
            lastSuccessfulSyncAt: existing?.lastSuccessfulSyncAt ?? null,
          };
          this.db.issues.atomic(() => {
            if (tokenScope === "global") {
              if (input.token !== "")
                this.db.issues.putSharedToken(
                  ownerId,
                  input.provider,
                  input.origin,
                  this.encrypt(shared, token),
                );
            } else record.credential = this.encrypt(record, token);
            this.db.issues.putConnection(record);
          });
        }),
    );
  }
  async removeSharedToken(
    ownerId: string,
    provider: "github" | "gitea",
    origin: string,
  ): Promise<void> {
    await this.exclusive(`grant:${ownerId}:${provider}:${origin}`, async () => {
      if (
        this.db.issues
          .connections(ownerId)
          .some(
            (record) =>
              record.provider === provider &&
              record.origin === origin &&
              record.tokenScope === "global" &&
              this.#busy.has(record.id),
          )
      )
        throw new IssueSyncError(
          "A repository is syncing. Remove the shared token after it finishes.",
        );
      this.db.issues.atomic(() => {
        this.db.issues.deleteSharedToken(ownerId, provider, origin);
        for (const record of this.db.issues.connections(ownerId)) {
          if (
            record.provider === provider &&
            record.origin === origin &&
            record.tokenScope === "global" &&
            record.state !== "disconnected"
          )
            this.db.issues.putConnection({
              ...record,
              state: "authentication_required",
            });
        }
      });
      await Promise.resolve();
    });
  }
  async disconnect(ownerId: string, id: string): Promise<void> {
    await this.exclusive(id, async () => {
      this.db.issues.putConnection({
        ...this.connection(ownerId, id),
        credential: null,
        state: "disconnected",
      });
      await Promise.resolve();
    });
  }
  async browse(ownerId: string, id: string): Promise<ExternalIssue[]> {
    const record = this.connection(ownerId, id);
    try {
      return await this.#provider.list(this.input(record));
    } catch (error) {
      this.failed(record, error);
      throw error;
    }
  }
  private failed(record: IssueConnectionRecord, error: unknown): void {
    record = this.db.issues.connection(record.ownerId, record.id) ?? record;
    if (record.state === "disconnected") return;
    this.db.issues.putConnection({
      ...record,
      state:
        error instanceof IssueProviderError &&
        error.code === "authentication_required"
          ? "authentication_required"
          : "unavailable",
    });
  }
  async import(
    ownerId: string,
    id: string,
    numbers: number[],
    projectId: string | null,
  ): Promise<void> {
    await this.exclusive(id, async () => {
      const record = this.connection(ownerId, id);
      const input = this.input(record);
      const issues: ExternalIssue[] = [];
      try {
        for (const number of numbers)
          issues.push(await this.#provider.get(input, number));
      } catch (error) {
        this.failed(record, error);
        throw error;
      }
      const now = new Date().toISOString();
      this.db.issues.atomic(() => {
        for (const issue of issues) {
          if (
            this.db.issues
              .links(ownerId, id)
              .some((link) => link.issue.number === issue.number)
          )
            continue;
          const taskId = randomUUID();
          const created = this.db.createTaskIdempotently(
            ownerId,
            `issue:${id}:${String(issue.number)}`,
            `${id}:${String(issue.number)}`,
            {
              id: taskId,
              title: issue.title,
              notes: issue.notes,
              status: "open",
              revision: 1,
              createdAt: now,
              updatedAt: now,
              projectId,
            },
          );
          if (created.kind !== "created")
            throw new IssueSyncError("Issue import could not be completed.");
          let task = created.task;
          if (issue.state === "closed") {
            const completed = this.db.setTaskCompleted(
              ownerId,
              taskId,
              task.revision,
              true,
              now,
            );
            if (completed.kind !== "updated")
              throw new IssueSyncError("Issue task changed during import.");
            task = completed.task;
          }
          this.db.issues.putLink({
            id: randomUUID(),
            ownerId,
            connectionId: id,
            taskId,
            issue,
            baseline: baseline(task),
            pendingState: null,
            state: "synced",
            message: null,
            lastSuccessfulSyncAt: now,
          });
        }
      });
    });
  }
  async synchronize(
    ownerId: string,
    id: string,
    resolution?: "accept_remote" | "retry_local",
    linkId?: string,
  ): Promise<void> {
    await this.exclusive(id, async () => {
      const record = this.connection(ownerId, id);
      const input = this.input(record);
      const links = this.db.issues.links(ownerId, id);
      if (linkId !== undefined && !links.some((link) => link.id === linkId))
        throw new IssueSyncError("Issue link not found.");
      let failed = false;
      for (const link of links.filter(
        (link) => linkId === undefined || link.id === linkId,
      )) {
        try {
          await this.syncLink(record, input, link, resolution);
        } catch (error) {
          failed = true;
          this.failed(record, error);
          const current =
            this.db.issues
              .links(ownerId, id)
              .find((item) => item.id === link.id) ?? link;
          this.db.issues.putLink({
            ...current,
            state: current.pendingState === null ? "unavailable" : "uncertain",
            message:
              current.pendingState === null
                ? "Issue unavailable. Check provider access and refresh."
                : "Remote write outcome is uncertain. Refresh to reconcile before retrying.",
          });
        }
      }
      if (!failed)
        this.db.issues.putConnection({
          ...record,
          state: "connected",
          lastSuccessfulSyncAt: new Date().toISOString(),
        });
    });
  }
  private async syncLink(
    record: IssueConnectionRecord,
    input: IssueConnectionInput,
    link: IssueLinkRecord,
    resolution?: "accept_remote" | "retry_local",
  ): Promise<void> {
    const ownerId = record.ownerId;
    const before = this.db.getTask(ownerId, link.taskId);
    if (before === undefined) {
      this.db.issues.putLink({
        ...link,
        state: "task_deleted",
        message: "Restore the task before syncing this link.",
      });
      return;
    }
    let remote = await this.#provider.get(input, link.issue.number);
    const task = this.db.getTask(ownerId, link.taskId);
    if (task?.revision !== before.revision) {
      this.db.issues.putLink({
        ...link,
        state: "conflict",
        message: "Task changed during refresh. Review and sync again.",
      });
      return;
    }
    if (link.state === "conflict" && resolution === undefined) return;
    if (
      link.pendingState !== null &&
      remote.state === link.pendingState &&
      resolution === undefined &&
      (task.status === "completed" ? "closed" : "open") !== link.pendingState
    ) {
      this.db.issues.putLink({
        ...link,
        state: "conflict",
        message:
          "Task completion changed while a remote write was pending. Choose which state to keep.",
      });
      return;
    }
    // A saved pending intent survives a crash or an ambiguous PATCH response.
    if (
      link.pendingState !== null &&
      resolution === undefined &&
      remote.state !== link.pendingState
    ) {
      this.db.issues.putLink({
        ...link,
        issue: remote,
        state: "uncertain",
        message:
          "Remote outcome differs from the pending change. Choose Use remote or Retry task state.",
      });
      return;
    }
    const titleConflict =
      task.title !== link.baseline.title &&
      remote.title !== link.issue.title &&
      task.title !== remote.title;
    const notesConflict =
      task.notes !== link.baseline.notes &&
      remote.notes !== link.issue.notes &&
      task.notes !== remote.notes;
    if ((titleConflict || notesConflict) && resolution === undefined) {
      // Retain the old baseline and remote snapshot until the owner resolves it.
      this.db.issues.putLink({
        ...link,
        state: "conflict",
        message:
          "Issue and task text both changed. Use remote replaces task text; Keep task text preserves your edits.",
      });
      return;
    }
    const desired = task.status === "completed" ? "closed" : "open";
    const localStateChanged = task.status !== status(link.issue);
    const remoteStateChanged = remote.state !== link.issue.state;
    if (
      record.writeBack &&
      resolution !== "accept_remote" &&
      desired !== remote.state &&
      ((localStateChanged && !remoteStateChanged) ||
        resolution === "retry_local")
    ) {
      this.db.issues.putLink({
        ...link,
        pendingState: desired,
        state: "uncertain",
        message: "Remote state change is pending reconciliation.",
      });
      // Re-read immediately before a write; reject any newly observed remote edit.
      const latest = await this.#provider.get(input, remote.number);
      if (
        latest.updatedAt !== remote.updatedAt ||
        latest.state !== remote.state ||
        latest.title !== remote.title ||
        latest.notes !== remote.notes
      )
        throw new IssueSyncError("Remote issue changed before write-back.");
      if (this.db.getTask(ownerId, task.id)?.revision !== task.revision)
        throw new IssueSyncError("Task changed before write-back.");
      remote = await this.#provider.setState(input, remote.number, desired);
    }
    const now = new Date().toISOString();
    this.db.issues.atomic(() => {
      let current = this.db.getTask(ownerId, task.id);
      if (current?.revision !== task.revision) {
        this.db.issues.putLink({
          ...link,
          pendingState: null,
          state: "conflict",
          message:
            "Task changed during provider sync. Refresh before resolving.",
        });
        return;
      }
      const title =
        resolution === "accept_remote" ||
        (resolution !== "retry_local" &&
          task.title === link.baseline.title &&
          remote.title !== link.issue.title)
          ? remote.title
          : task.title;
      const notes =
        resolution === "accept_remote" ||
        (resolution !== "retry_local" &&
          task.notes === link.baseline.notes &&
          remote.notes !== link.issue.notes)
          ? remote.notes
          : task.notes;
      if (title !== current.title || notes !== current.notes) {
        const updated = this.db.patchTask(
          ownerId,
          task.id,
          current.revision,
          { title, notes },
          now,
        );
        if (updated.kind !== "updated")
          throw new IssueSyncError("Task changed during sync.");
        current = updated.task;
      }
      const nextStatus =
        resolution === "accept_remote" ||
        remoteStateChanged ||
        (record.writeBack && desired === remote.state)
          ? status(remote)
          : current.status;
      if (current.status !== nextStatus) {
        const updated = this.db.setTaskCompleted(
          ownerId,
          task.id,
          current.revision,
          nextStatus === "completed",
          now,
        );
        if (updated.kind !== "updated")
          throw new IssueSyncError("Task changed during sync.");
      }
      this.db.issues.putLink({
        ...link,
        issue: remote,
        baseline: {
          title: remote.title,
          notes: remote.notes,
          status: status(remote),
        },
        pendingState: null,
        state: "synced",
        message: null,
        lastSuccessfulSyncAt: now,
      });
    });
  }
}
