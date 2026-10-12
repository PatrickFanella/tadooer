import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SuiteDatabase } from "@suite/persistence";
import { withTemporaryDirectory } from "@suite/test-support";
import type { BoardClock } from "@suite/domain";
import { BoardProviderError, BoardProviderService } from "./board-provider.ts";
import { IssueConnectorService } from "./issue-connector.ts";

// Issue #174 (ADR 0054): Gitea project columns on boards, against a fake
// Gitea that answers with the git.subcult.tv API 28 payload shapes.
const clock: BoardClock = { today: "2026-10-12", timeZone: "America/Chicago" };
const t0 = "2026-10-12T20:00:00.000Z";
const t1 = "2026-10-12T20:10:00.000Z";
const t2 = "2026-10-12T20:20:00.000Z";
const t3 = "2026-10-12T20:30:00.000Z";

const issue = (number: number, id: number) => ({
  id,
  number,
  title: `Issue ${String(number)}`,
  body: "",
  state: "open",
  updated_at: "2026-10-11T12:00:00Z",
  labels: [],
  assignees: [],
});

const gitea = () => {
  const issues = [issue(1, 101), issue(2, 102)];
  const columns = new Map<number, number[]>([
    [70, [102]],
    [71, [101]],
    [72, []],
  ]);
  const moves: { issueId: number; columnId: number }[] = [];
  let failMoves = false;
  const fetcher: typeof fetch = async (input, init) => {
    await Promise.resolve();
    const url =
      input instanceof URL
        ? input
        : new URL(typeof input === "string" ? input : input.url);
    const path = url.pathname.replace(/^\/api\/v1/, "");
    if (url.origin !== "https://git.subcult.tv")
      return new Response(null, { status: 404 });
    if (init?.method === "POST") {
      const match =
        /^\/repos\/org\/repo\/projects\/7\/issues\/(\d+)\/move$/.exec(path);
      if (match === null) return new Response(null, { status: 404 });
      if (failMoves) return new Response(null, { status: 500 });
      const { column_id } = JSON.parse(
        typeof init.body === "string" ? init.body : "",
      ) as { column_id: number };
      const issueId = Number(match[1]);
      for (const list of columns.values()) {
        const at = list.indexOf(issueId);
        if (at >= 0) list.splice(at, 1);
      }
      columns.get(column_id)?.push(issueId);
      moves.push({ issueId, columnId: column_id });
      return new Response(null, { status: 204 });
    }
    if (path === "/repos/org/repo")
      return Response.json({ full_name: "org/repo" });
    if (path === "/repos/org/repo/issues") return Response.json(issues);
    const single = /^\/repos\/org\/repo\/issues\/(\d+)$/.exec(path);
    if (single !== null) {
      const found = issues.find(({ number }) => number === Number(single[1]));
      return found === undefined
        ? new Response(null, { status: 404 })
        : Response.json(found);
    }
    if (path === "/repos/org/repo/projects")
      return Response.json([
        { id: 7, title: "Roadmap", is_closed: false },
        { id: 8, title: "Old", is_closed: true },
      ]);
    if (path === "/repos/org/repo/projects/7/columns")
      return Response.json([
        { id: 70, title: "Todo" },
        { id: 71, title: "Doing" },
        { id: 72, title: "Done" },
      ]);
    const column =
      /^\/repos\/org\/repo\/projects\/7\/columns\/(\d+)\/issues$/.exec(path);
    if (column !== null)
      return Response.json(
        (columns.get(Number(column[1])) ?? []).map((id) =>
          issues.find((entry) => entry.id === id),
        ),
      );
    return new Response(null, { status: 404 });
  };
  return {
    fetcher,
    moves,
    place: (issueId: number, columnId: number) => {
      for (const list of columns.values()) {
        const at = list.indexOf(issueId);
        if (at >= 0) list.splice(at, 1);
      }
      columns.get(columnId)?.push(issueId);
    },
    failMoves: (value: boolean) => {
      failMoves = value;
    },
  };
};

const applied = <T extends { kind: string }>(
  result: T,
): Extract<T, { kind: "applied" }> => {
  if (result.kind !== "applied")
    throw new Error(`expected applied, got ${result.kind}`);
  return result as Extract<T, { kind: "applied" }>;
};
const defined = <T>(value: T | undefined | null): T => {
  if (value == null) throw new Error("expected a value");
  return value;
};

const setup = async (directory: string, remote = gitea()) => {
  const db = SuiteDatabase.open(join(directory, "suite.sqlite"));
  const owner = {
    id: randomUUID(),
    username: "owner",
    displayName: "Owner",
    passwordHash: "test-only",
    createdAt: t0,
  };
  expect(db.createOwner(owner)).toBe(true);
  const issues = new IssueConnectorService(
    db,
    join(directory, "credential.key"),
    ["https://git.subcult.tv"],
    remote.fetcher,
  );
  const boards = new BoardProviderService(db, issues, remote.fetcher);
  await issues.connect(owner.id, {
    provider: "gitea",
    origin: "https://git.subcult.tv",
    repository: "org/repo",
    token: "synthetic-issue-token",
    writeBack: false,
  });
  const connection = defined(issues.overview(owner.id).connections[0]);
  await issues.import(owner.id, connection.id, [1, 2], null);
  const links = issues.overview(owner.id).links;
  const taskOf = (number: number) =>
    defined(links.find((link) => link.issue.number === number)).taskId;
  const board = applied(
    db.boards.createBoard(owner.id, { template: "kanban" }, randomUUID, t0),
  ).board;
  const [todo, doing, done] = board.panels.map(({ id }) => id) as [
    string,
    string,
    string,
  ];
  const membersOf = (panelId: string) =>
    defined(db.boards.viewBoard(owner.id, board.id, clock)).members.find(
      (entry) => entry.panelId === panelId,
    )?.taskIds ?? [];
  const localMove = (panelId: string, taskId: string, now: string) => {
    const plan = db.boards.planMove(owner.id, board.id, panelId, taskId, clock);
    if (plan.kind !== "planned") throw new Error("plan failed");
    applied(
      db.boards.moveTask(
        owner.id,
        board.id,
        panelId,
        {
          expectedRevision: defined(db.boards.getBoard(owner.id, board.id))
            .revision,
          taskId,
          taskRevision: plan.taskRevision,
        },
        clock,
        now,
      ),
    );
  };
  return {
    db,
    owner,
    issues,
    boards,
    remote,
    connection,
    board,
    todo,
    doing,
    done,
    taskOf,
    membersOf,
    localMove,
  };
};

describe("board provider (issue #174)", () => {
  it("lists open projects with columns and validates the mapping", async () => {
    await withTemporaryDirectory(async (directory) => {
      const s = await setup(directory);
      expect(await s.boards.listProjects(s.owner.id, s.connection.id)).toEqual([
        {
          id: 7,
          title: "Roadmap",
          columns: [
            { id: 70, title: "Todo" },
            { id: 71, title: "Doing" },
            { id: 72, title: "Done" },
          ],
        },
      ]);
      expect(s.boards.getMapping(s.owner.id, s.board.id)).toBeNull();
      expect(() =>
        s.boards.setMapping(
          s.owner.id,
          s.board.id,
          {
            connectionId: s.connection.id,
            projectId: 7,
            projectTitle: "Roadmap",
            columns: [
              { panelId: randomUUID(), columnId: 70, columnTitle: "Todo" },
            ],
            writeBack: false,
          },
          t0,
        ),
      ).toThrow(BoardProviderError);
      expect(() =>
        s.boards.setMapping(
          s.owner.id,
          s.board.id,
          {
            connectionId: s.connection.id,
            projectId: 7,
            projectTitle: "Roadmap",
            columns: [
              { panelId: s.todo, columnId: 70, columnTitle: "Todo" },
              { panelId: s.doing, columnId: 70, columnTitle: "Todo" },
            ],
            writeBack: false,
          },
          t0,
        ),
      ).toThrow("at most once");
      expect(() => s.boards.getMapping(s.owner.id, randomUUID())).toThrow(
        "Board not found",
      );
      s.db.close();
    });
  });

  it("moves linked tasks to their issue's column, reports local divergence and writes back", async () => {
    await withTemporaryDirectory(async (directory) => {
      const s = await setup(directory);
      const one = s.taskOf(1);
      const two = s.taskOf(2);
      expect(s.membersOf(s.todo)).toEqual(expect.arrayContaining([one, two]));
      const mapping = s.boards.setMapping(
        s.owner.id,
        s.board.id,
        {
          connectionId: s.connection.id,
          projectId: 7,
          projectTitle: "Roadmap",
          columns: [
            { panelId: s.todo, columnId: 70, columnTitle: "Todo" },
            { panelId: s.doing, columnId: 71, columnTitle: "Doing" },
            { panelId: s.done, columnId: 72, columnTitle: "Done" },
          ],
          writeBack: true,
        },
        t0,
      );
      expect(mapping.state).toBe("idle");

      // Issue 1 sits in Doing on Gitea: the first sync follows the provider.
      const first = await s.boards.sync(s.owner.id, s.board.id, clock, t1);
      expect(first.moved).toEqual([
        { taskId: one, issueNumber: 1, panelId: s.doing, columnTitle: "Doing" },
      ]);
      expect(first.conflicts).toEqual([]);
      expect(first.unchanged).toBe(1);
      expect(first.mapping.state).toBe("synced");
      expect(first.mapping.placements[one]?.panelId).toBe(s.doing);
      expect(s.membersOf(s.doing)).toEqual([one]);
      expect(
        s.issues.overview(s.owner.id).links.find((link) => link.taskId === one)
          ?.message,
      ).toContain("from Gitea column “Doing”");

      // A second pass with nothing changed moves nothing.
      const second = await s.boards.sync(s.owner.id, s.board.id, clock, t1);
      expect(second.moved).toEqual([]);
      expect(second.unchanged).toBe(2);

      // Moved back locally while Gitea still says Doing: a conflict, not a
      // silent move, and the task stays where the owner put it.
      s.localMove(s.todo, one, t2);
      const third = await s.boards.sync(s.owner.id, s.board.id, clock, t2);
      expect(third.moved).toEqual([]);
      expect(third.conflicts).toHaveLength(1);
      expect(third.conflicts[0]).toMatchObject({
        taskId: one,
        issueNumber: 1,
        panelId: s.doing,
        columnTitle: "Doing",
      });
      expect(third.conflicts[0]?.reason).toContain("after the last sync");
      expect(third.mapping.state).toBe("conflict");
      expect(s.membersOf(s.todo)).toEqual(expect.arrayContaining([one]));

      // Write-back: the preview names the issue and column; the applied move
      // posts the Gitea move and the next sync agrees.
      expect(
        await s.boards.writeBack(
          s.owner.id,
          s.board.id,
          s.doing,
          one,
          true,
          t3,
        ),
      ).toEqual({
        provider: "gitea",
        issueNumber: 1,
        columnTitle: "Doing",
        state: "planned",
        message: null,
      });
      expect(s.remote.moves).toEqual([]);
      s.localMove(s.doing, one, t3);
      expect(
        await s.boards.writeBack(
          s.owner.id,
          s.board.id,
          s.doing,
          one,
          false,
          t3,
        ),
      ).toMatchObject({ state: "applied", issueNumber: 1 });
      expect(s.remote.moves).toEqual([{ issueId: 101, columnId: 71 }]);
      const fourth = await s.boards.sync(s.owner.id, s.board.id, clock, t3);
      expect(fourth.conflicts).toEqual([]);
      expect(fourth.moved).toEqual([]);
      expect(fourth.mapping.state).toBe("synced");

      // An unlinked task or an unmapped panel has no provider effect.
      expect(
        await s.boards.writeBack(
          s.owner.id,
          s.board.id,
          s.doing,
          randomUUID(),
          false,
          t3,
        ),
      ).toBeUndefined();

      // Gitea moves issue 2 to Done; the local task follows on sync and the
      // panel's own change list (complete) applies.
      s.remote.place(102, 72);
      const fifth = await s.boards.sync(s.owner.id, s.board.id, clock, t3);
      expect(fifth.moved).toEqual([
        { taskId: two, issueNumber: 2, panelId: s.done, columnTitle: "Done" },
      ]);
      expect(s.db.getTask(s.owner.id, two)?.status).toBe("completed");

      // A failed provider write keeps the local move and records the failure.
      s.remote.failMoves(true);
      s.localMove(s.done, one, t3);
      const failed = await s.boards.writeBack(
        s.owner.id,
        s.board.id,
        s.done,
        one,
        false,
        t3,
      );
      expect(failed?.state).toBe("failed");
      expect(s.membersOf(s.done)).toEqual(expect.arrayContaining([one]));
      expect(s.boards.getMapping(s.owner.id, s.board.id)?.message).toContain(
        "local move was kept",
      );

      s.boards.clearMapping(s.owner.id, s.board.id);
      expect(s.boards.getMapping(s.owner.id, s.board.id)).toBeNull();
      s.db.close();
    });
  });

  it("refuses GitHub connections and reports provider failures on the mapping", async () => {
    await withTemporaryDirectory(async (directory) => {
      const remote = gitea();
      const s = await setup(directory, remote);
      const githubFetch: typeof fetch = async () => {
        await Promise.resolve();
        return Response.json({ full_name: "org/repo" });
      };
      const issues = new IssueConnectorService(
        s.db,
        join(directory, "credential.key"),
        ["https://git.subcult.tv"],
        githubFetch,
      );
      await issues.connect(s.owner.id, {
        provider: "github",
        origin: "https://github.com",
        repository: "org/repo",
        token: "synthetic-issue-token",
        writeBack: false,
      });
      const github = defined(
        issues
          .overview(s.owner.id)
          .connections.find((entry) => entry.provider === "github"),
      );
      const service = new BoardProviderService(s.db, issues, githubFetch);
      await expect(
        service.listProjects(s.owner.id, github.id),
      ).rejects.toMatchObject({ code: "unsupported" });

      s.boards.setMapping(
        s.owner.id,
        s.board.id,
        {
          connectionId: s.connection.id,
          projectId: 7,
          projectTitle: "Roadmap",
          columns: [{ panelId: s.doing, columnId: 71, columnTitle: "Doing" }],
          writeBack: false,
        },
        t0,
      );
      const broken = new BoardProviderService(s.db, s.issues, async () => {
        await Promise.resolve();
        return new Response(null, { status: 401 });
      });
      await expect(
        broken.sync(s.owner.id, s.board.id, clock, t1),
      ).rejects.toMatchObject({ code: "authentication_required" });
      expect(s.boards.getMapping(s.owner.id, s.board.id)?.state).toBe(
        "authentication_required",
      );
      s.db.close();
    });
  });
});
