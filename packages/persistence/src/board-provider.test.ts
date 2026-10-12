import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withTemporaryDirectory } from "@suite/test-support";
import type { BoardProviderMapping } from "@suite/contracts";
import { SuiteDatabase } from "./index.ts";

// Issue #174 (ADR 0054): one Gitea project mapping per board.
const now = "2026-10-12T22:00:00.000Z";
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
let counter = 0;
const uuid = () => {
  counter++;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
};

const setup = (path: string) => {
  const db = SuiteDatabase.open(path);
  for (const id of [owner, other])
    db.createOwner({
      id,
      username: id.slice(0, 8),
      displayName: id,
      passwordHash: "hash",
      createdAt: now,
    });
  const connectionId = uuid();
  db.issues.putConnection({
    id: connectionId,
    ownerId: owner,
    provider: "gitea",
    origin: "https://git.subcult.tv",
    repository: "org/repo",
    tokenScope: "repository",
    writeBack: false,
    state: "connected",
    lastSuccessfulSyncAt: null,
    credential: null,
  });
  const created = db.boards.createBoard(
    owner,
    { template: "kanban" },
    uuid,
    now,
  );
  if (created.kind !== "applied") throw new Error("board fixture failed");
  return { db, connectionId, board: created.board };
};

const mappingFor = (
  boardId: string,
  connectionId: string,
  panelId: string,
): BoardProviderMapping => ({
  boardId,
  connectionId,
  provider: "gitea",
  projectId: 7,
  projectTitle: "Roadmap",
  columns: [{ panelId, columnId: 70, columnTitle: "Doing" }],
  writeBack: true,
  state: "idle",
  message: null,
  lastSyncedAt: null,
  placements: {},
  updatedAt: now,
});

describe("board provider mappings (issue #174)", () => {
  it("stores one mapping per board, scoped to the owner", async () => {
    await withTemporaryDirectory((directory) => {
      const { db, connectionId, board } = setup(join(directory, "a.sqlite"));
      expect(db.state().appliedMigrationCount).toBe(52);
      const panel = board.panels[1];
      if (panel === undefined) throw new Error("kanban has three panels");
      const mapping = mappingFor(board.id, connectionId, panel.id);
      db.boardProviders.put(owner, mapping);
      expect(db.boardProviders.get(owner, board.id)).toEqual(mapping);
      expect(db.boardProviders.get(other, board.id)).toBeUndefined();
      expect(db.boardProviders.forConnection(owner, connectionId)).toEqual([
        mapping,
      ]);

      const updated = {
        ...mapping,
        writeBack: false,
        state: "synced" as const,
      };
      db.boardProviders.put(owner, updated);
      expect(db.boardProviders.get(owner, board.id)).toEqual(updated);
      // Another owner cannot overwrite it through the upsert.
      db.boardProviders.put(other, { ...mapping, projectTitle: "Hijack" });
      expect(db.boardProviders.get(owner, board.id)?.projectTitle).toBe(
        "Roadmap",
      );
      expect(db.boardProviders.delete(other, board.id)).toBe(false);
      expect(db.boardProviders.delete(owner, board.id)).toBe(true);
      expect(db.boardProviders.get(owner, board.id)).toBeUndefined();
      db.close();
    });
  });

  it("goes away with its board", async () => {
    await withTemporaryDirectory((directory) => {
      const { db, connectionId, board } = setup(join(directory, "b.sqlite"));
      const panel = board.panels[0];
      if (panel === undefined) throw new Error("kanban has three panels");
      db.boardProviders.put(
        owner,
        mappingFor(board.id, connectionId, panel.id),
      );
      const deleted = db.boards.deleteBoard(owner, board.id, board.revision);
      expect(deleted).toBe("applied");
      expect(db.boardProviders.get(owner, board.id)).toBeUndefined();
      db.close();
    });
  });
});
