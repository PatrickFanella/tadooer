import { boardProviderMappingSetRequestSchema } from "@suite/contracts";
import { readJson, sameOrigin, sendError, sendJson } from "../http-utils.ts";
import { BoardProviderError } from "../board-provider.ts";
import { IssueSyncError } from "../issue-connector.ts";
import { IssueProviderError } from "../issue-provider.ts";
import { boardClock } from "./boards.ts";
import type { RouteHandler } from "./shared.ts";

/**
 * Issue #174 (ADR 0054): Gitea project columns on boards.
 *
 * - GET    /api/issue-connections/{id}/projects  open projects and their columns
 * - GET    /api/boards/{id}/provider             the board's mapping, or null
 * - PUT    /api/boards/{id}/provider             set the mapping
 * - DELETE /api/boards/{id}/provider             remove the mapping
 * - POST   /api/boards/{id}/provider/sync        one inbound pass
 */
export const handleBoardProvider: RouteHandler = async (
  request,
  response,
  url,
  ctx,
) => {
  const projects = /^\/api\/issue-connections\/([0-9a-f-]{36})\/projects$/.exec(
    url.pathname,
  );
  const mapping = /^\/api\/boards\/([0-9a-f-]{36})\/provider(\/sync)?$/.exec(
    url.pathname,
  );
  if (projects === null && mapping === null) return false;
  const method = request.method ?? "GET";
  const unsafe = method !== "GET";
  if (unsafe && !sameOrigin(request)) {
    sendError(response, 403, "ORIGIN_REQUIRED", "Same-origin request required");
    return true;
  }
  const session = ctx.auth.authenticate(request, unsafe);
  if (session === undefined) {
    sendError(response, 401, "AUTH_REQUIRED", "Authentication required");
    return true;
  }
  if (
    unsafe &&
    !ctx.auth.csrfMatches(
      session,
      request.headers["x-csrf-token"] as string | undefined,
    )
  ) {
    sendError(response, 403, "CSRF_INVALID", "Valid CSRF token required");
    return true;
  }
  const ownerId = session.owner.id;
  const now = new Date();
  try {
    if (projects !== null) {
      if (method !== "GET") {
        sendError(response, 405, "METHOD_NOT_ALLOWED", "GET only");
        return true;
      }
      sendJson(response, 200, {
        projects: await ctx.boardProvider.listProjects(
          ownerId,
          projects[1] ?? "",
        ),
      });
      return true;
    }
    const boardId = mapping?.[1] ?? "";
    const sync = mapping?.[2] !== undefined;
    if (sync) {
      if (method !== "POST") {
        sendError(response, 405, "METHOD_NOT_ALLOWED", "POST only");
        return true;
      }
      sendJson(
        response,
        200,
        await ctx.boardProvider.sync(
          ownerId,
          boardId,
          boardClock(ctx.stores, ownerId, now),
          now.toISOString(),
        ),
      );
      return true;
    }
    if (method === "GET") {
      sendJson(response, 200, {
        mapping: ctx.boardProvider.getMapping(ownerId, boardId),
      });
      return true;
    }
    if (method === "PUT") {
      const parsed = boardProviderMappingSetRequestSchema.safeParse(
        await readJson(request),
      );
      if (!parsed.success) {
        sendError(
          response,
          400,
          "INVALID_BOARD_PROVIDER",
          "Provide the connection, the project and the panel columns",
        );
        return true;
      }
      sendJson(response, 200, {
        mapping: ctx.boardProvider.setMapping(
          ownerId,
          boardId,
          parsed.data,
          now.toISOString(),
        ),
      });
      return true;
    }
    if (method === "DELETE") {
      ctx.boardProvider.clearMapping(ownerId, boardId);
      sendJson(response, 200, { mapping: null });
      return true;
    }
    sendError(response, 405, "METHOD_NOT_ALLOWED", "Unsupported method");
    return true;
  } catch (error) {
    if (error instanceof BoardProviderError) {
      sendError(
        response,
        error.code === "not_found"
          ? 404
          : error.code === "unsupported"
            ? 409
            : 400,
        error.code === "not_found"
          ? "BOARD_NOT_FOUND"
          : error.code === "unsupported"
            ? "BOARD_PROVIDER_UNSUPPORTED"
            : "INVALID_BOARD_PROVIDER",
        error.message,
      );
      return true;
    }
    if (error instanceof IssueSyncError) {
      sendError(response, 409, "ISSUE_SYNC_REVIEW_REQUIRED", error.message);
      return true;
    }
    if (error instanceof IssueProviderError) {
      sendError(
        response,
        502,
        "ISSUE_PROVIDER_UNAVAILABLE",
        `The provider request failed: ${error.code.replace(/_/g, " ")}`,
      );
      return true;
    }
    throw error;
  }
};
