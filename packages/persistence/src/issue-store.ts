import type { DatabaseSync } from "node:sqlite";
import type {
  ExternalIssue,
  IssueConnection,
  IssueLink,
} from "@suite/contracts";

export interface IssueConnectionRecord extends IssueConnection {
  ownerId: string;
  credential: string | null;
}
export interface IssueLinkRecord extends IssueLink {
  ownerId: string;
  baseline: { title: string; notes: string; status: "open" | "completed" };
  pendingState: "open" | "closed" | null;
}

export class SqliteIssueStore {
  constructor(private readonly db: DatabaseSync) {}

  connections(ownerId: string): IssueConnectionRecord[] {
    return this.db
      .prepare(
        "SELECT record_json FROM issue_connections WHERE owner_id=? ORDER BY rowid",
      )
      .all(ownerId)
      .map(
        (row) =>
          ({
            tokenScope: "repository",
            ...JSON.parse(String(row.record_json)),
          }) as IssueConnectionRecord,
      );
  }
  sharedTokens(
    ownerId: string,
  ): { provider: "github" | "gitea"; origin: string }[] {
    return this.db
      .prepare(
        "SELECT provider,origin FROM issue_shared_tokens WHERE owner_id=?",
      )
      .all(ownerId)
      .map((row) => ({
        provider: String(row.provider) as "github" | "gitea",
        origin: String(row.origin),
      }));
  }
  sharedToken(
    ownerId: string,
    provider: string,
    origin: string,
  ): string | undefined {
    const row = this.db
      .prepare(
        "SELECT credential FROM issue_shared_tokens WHERE owner_id=? AND provider=? AND origin=?",
      )
      .get(ownerId, provider, origin);
    return row === undefined ? undefined : String(row.credential);
  }
  putSharedToken(
    ownerId: string,
    provider: string,
    origin: string,
    credential: string,
  ): void {
    this.db
      .prepare(
        "INSERT INTO issue_shared_tokens(owner_id,provider,origin,credential) VALUES(?,?,?,?) ON CONFLICT(owner_id,provider,origin) DO UPDATE SET credential=excluded.credential",
      )
      .run(ownerId, provider, origin, credential);
  }
  deleteSharedToken(ownerId: string, provider: string, origin: string): void {
    this.db
      .prepare(
        "DELETE FROM issue_shared_tokens WHERE owner_id=? AND provider=? AND origin=?",
      )
      .run(ownerId, provider, origin);
  }
  connection(ownerId: string, id: string): IssueConnectionRecord | undefined {
    return this.connections(ownerId).find((record) => record.id === id);
  }
  putConnection(record: IssueConnectionRecord): void {
    this.db
      .prepare(
        `INSERT INTO issue_connections (id,owner_id,provider,origin,repository,record_json) VALUES (?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET record_json=excluded.record_json`,
      )
      .run(
        record.id,
        record.ownerId,
        record.provider,
        record.origin,
        record.repository,
        JSON.stringify(record),
      );
  }
  links(ownerId: string, connectionId?: string): IssueLinkRecord[] {
    return this.db
      .prepare(
        "SELECT record_json FROM issue_links WHERE owner_id=? ORDER BY rowid",
      )
      .all(ownerId)
      .map((row) => JSON.parse(String(row.record_json)) as IssueLinkRecord)
      .filter(
        (record) =>
          connectionId === undefined || record.connectionId === connectionId,
      );
  }
  putLink(record: IssueLinkRecord): void {
    this.db
      .prepare(
        `INSERT INTO issue_links (id,owner_id,connection_id,issue_number,task_id,record_json) VALUES (?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET record_json=excluded.record_json`,
      )
      .run(
        record.id,
        record.ownerId,
        record.connectionId,
        record.issue.number,
        record.taskId,
        JSON.stringify(record),
      );
  }
  atomic<T>(work: () => T): T {
    this.db.exec("SAVEPOINT issue_operation;");
    try {
      const result = work();
      this.db.exec("RELEASE SAVEPOINT issue_operation;");
      return result;
    } catch (error) {
      this.db.exec(
        "ROLLBACK TO SAVEPOINT issue_operation; RELEASE SAVEPOINT issue_operation;",
      );
      throw error;
    }
  }
}

export const issueTaskStatus = (issue: ExternalIssue): "open" | "completed" =>
  issue.state === "closed" ? "completed" : "open";
