import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { withTemporaryDirectory } from "@suite/test-support";
import { SuiteDatabase } from "./index.ts";
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  board = "00000000-0000-4000-8000-000000000003",
  now = "2026-10-02T12:00:00.000Z";
it("upgrades existing records with an epoch reset and keeps owner feed positions isolated", async () => {
  await withTemporaryDirectory((directory) => {
    const path = join(directory, "suite.sqlite");
    let db = SuiteDatabase.open(path);
    db.createOwner({
      id: owner,
      username: "fixture",
      displayName: "Fixture",
      passwordHash: "fixture-hash",
      createdAt: now,
    });
    db.getSyncState(owner);
    db.close();
    const legacy = new DatabaseSync(path);
    legacy.exec("PRAGMA foreign_keys=ON");
    for (const row of legacy
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'complete_feed_%'",
      )
      .all())
      legacy.exec(`DROP TRIGGER "${String(row.name)}"`);
    legacy
      .prepare("DELETE FROM schema_migrations WHERE id=?")
      .run("0054_complete_readonly_feed_coverage");
    legacy
      .prepare(
        "INSERT INTO boards(id,owner_id,title,columns,position,revision,created_at,updated_at) VALUES(?,?,?,3,0,1,?,?)",
      )
      .run(board, owner, "Before upgrade", now, now);
    const oldEpoch = (
      legacy
        .prepare("SELECT epoch FROM sync_owner_state WHERE owner_id=?")
        .get(owner) as { epoch: string }
    ).epoch;
    legacy.close();
    db = SuiteDatabase.open(path);
    try {
      expect(db.getSyncState(owner).epoch).not.toBe(oldEpoch);
      expect(db.readonlyFeed.keys(owner)).toContainEqual({
        kind: "board",
        id: board,
      });
      expect(db.boards.getBoard(owner, board)?.title).toBe("Before upgrade");
      const initial = db.getSyncState(owner);
      const raw = new DatabaseSync(path);
      raw.exec("PRAGMA foreign_keys=ON");
      raw
        .prepare(
          "INSERT INTO owner_accounts(id,username,display_name,password_hash,created_at,disabled_at) VALUES(?,?,?,?,?,?)",
        )
        .run(other, "other", "Other", "fixture-hash", now, now);
      raw
        .prepare(
          "INSERT INTO owner_capture_preferences(owner_id,url_behavior,revision,updated_at) VALUES(?,'extract',1,?)",
        )
        .run(other, now);
      expect(db.getSyncState(owner)).toEqual(initial);
      expect(db.getSyncState(other).cursor).toBeGreaterThan(0);
      expect(db.readonlyFeed.keys(other)).not.toContainEqual({
        kind: "board",
        id: board,
      });
      raw.prepare("DELETE FROM owner_accounts WHERE id=?").run(other);
      expect(
        raw
          .prepare("SELECT 1 FROM sync_owner_state WHERE owner_id=?")
          .get(other),
      ).toBeUndefined();
      raw.close();
    } finally {
      db.close();
    }
    return Promise.resolve();
  });
});
