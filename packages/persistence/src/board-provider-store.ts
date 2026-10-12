import type { DatabaseSync } from "node:sqlite";
import {
  boardProviderMappingSchema,
  type BoardProviderMapping,
} from "@suite/contracts";

/**
 * Issue #174 (ADR 0054): one Gitea project mapping per board. The record is
 * stored as JSON beside its board and connection, so deleting either removes
 * the mapping.
 */
export const boardProviderMappingsMigration = {
  id: "0057_board_provider_mappings",
  sql: `CREATE TABLE board_provider_mappings (
      board_id TEXT PRIMARY KEY REFERENCES boards(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL REFERENCES owner_accounts(id) ON DELETE CASCADE,
      connection_id TEXT NOT NULL REFERENCES issue_connections(id) ON DELETE CASCADE,
      record_json TEXT NOT NULL
    ) STRICT;
    CREATE INDEX board_provider_mappings_by_connection
      ON board_provider_mappings(connection_id, board_id);`,
};

export class SqliteBoardProviderStore {
  constructor(private readonly db: DatabaseSync) {}

  get(ownerId: string, boardId: string): BoardProviderMapping | undefined {
    const row = this.db
      .prepare(
        "SELECT record_json FROM board_provider_mappings WHERE owner_id=? AND board_id=?",
      )
      .get(ownerId, boardId);
    if (row === undefined) return undefined;
    return boardProviderMappingSchema.parse(
      JSON.parse(String(row.record_json)),
    );
  }

  /** Mappings that read from one connection, in board order. */
  forConnection(
    ownerId: string,
    connectionId: string,
  ): readonly BoardProviderMapping[] {
    return this.db
      .prepare(
        "SELECT record_json FROM board_provider_mappings WHERE owner_id=? AND connection_id=? ORDER BY board_id",
      )
      .all(ownerId, connectionId)
      .map((row) =>
        boardProviderMappingSchema.parse(JSON.parse(String(row.record_json))),
      );
  }

  put(ownerId: string, mapping: BoardProviderMapping): void {
    const record = boardProviderMappingSchema.parse(mapping);
    this.db
      .prepare(
        `INSERT INTO board_provider_mappings (board_id, owner_id, connection_id, record_json)
         VALUES (?,?,?,?)
         ON CONFLICT(board_id) DO UPDATE SET
           connection_id = excluded.connection_id,
           record_json = excluded.record_json
         WHERE owner_id = excluded.owner_id`,
      )
      .run(
        record.boardId,
        ownerId,
        record.connectionId,
        JSON.stringify(record),
      );
  }

  delete(ownerId: string, boardId: string): boolean {
    return (
      Number(
        this.db
          .prepare(
            "DELETE FROM board_provider_mappings WHERE owner_id=? AND board_id=?",
          )
          .run(ownerId, boardId).changes,
      ) > 0
    );
  }
}
