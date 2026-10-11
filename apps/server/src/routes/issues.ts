import {
  issueConnectionInputSchema,
  issueImportRequestSchema,
  issueSyncRequestSchema,
  issueSharedTokenRequestSchema,
} from "@suite/contracts";
import { StructuredCaptureError } from "@suite/domain";
import { readJson, sameOrigin, sendError, sendJson } from "../http-utils.ts";
import { IssueSyncError } from "../issue-connector.ts";
import { IssueProviderError } from "../issue-provider.ts";
import type { RouteHandler } from "./shared.ts";

export const handleIssues: RouteHandler = async (
  request,
  response,
  url,
  ctx,
) => {
  const match =
    /^\/api\/issue-connections(?:\/(shared-token|[0-9a-f-]{36})(?:\/(browse|import|sync))?)?$/.exec(
      url.pathname,
    );
  if (match === null) return false;
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
  const id = match[1];
  const action = match[2];
  try {
    if (method === "GET" && id === undefined) {
      sendJson(response, 200, ctx.issues.overview(ownerId));
      return true;
    }
    if (method === "POST" && id === undefined) {
      const parsed = issueConnectionInputSchema.safeParse(
        await readJson(request, 16_384),
      );
      if (!parsed.success)
        throw new IssueSyncError("Issue connection input is invalid.");
      await ctx.issues.connect(ownerId, parsed.data);
    } else if (
      method === "DELETE" &&
      id === "shared-token" &&
      action === undefined
    ) {
      const parsed = issueSharedTokenRequestSchema.safeParse(
        await readJson(request, 16_384),
      );
      if (!parsed.success)
        throw new IssueSyncError("Shared token selection is invalid.");
      await ctx.issues.removeSharedToken(
        ownerId,
        parsed.data.provider,
        parsed.data.origin,
      );
    } else if (
      method === "DELETE" &&
      id !== undefined &&
      action === undefined
    ) {
      await ctx.issues.disconnect(ownerId, id);
    } else if (method === "GET" && id !== undefined && action === "browse") {
      sendJson(response, 200, { issues: await ctx.issues.browse(ownerId, id) });
      return true;
    } else if (method === "POST" && id !== undefined && action === "import") {
      const parsed = issueImportRequestSchema.safeParse(
        await readJson(request, 16_384),
      );
      if (!parsed.success)
        throw new IssueSyncError(
          "Select unique issue numbers and a valid destination project.",
        );
      await ctx.issues.import(
        ownerId,
        id,
        parsed.data.numbers,
        parsed.data.projectId,
      );
    } else if (method === "POST" && id !== undefined && action === "sync") {
      const parsed = issueSyncRequestSchema.safeParse(
        await readJson(request, 16_384),
      );
      if (!parsed.success)
        throw new IssueSyncError("Issue sync input is invalid.");
      await ctx.issues.synchronize(
        ownerId,
        id,
        parsed.data.resolution,
        parsed.data.linkId,
      );
    } else {
      sendError(
        response,
        405,
        "METHOD_NOT_ALLOWED",
        "Issue connection action is unsupported",
      );
      return true;
    }
    sendJson(response, 200, ctx.issues.overview(ownerId));
  } catch (error) {
    if (
      error instanceof IssueSyncError ||
      error instanceof StructuredCaptureError
    )
      sendError(response, 409, "ISSUE_SYNC_REVIEW_REQUIRED", error.message);
    else if (error instanceof IssueProviderError)
      sendError(
        response,
        502,
        "ISSUE_PROVIDER_UNAVAILABLE",
        `Issue provider request failed (${error.code}). Check access and refresh.`,
      );
    else throw error;
  }
  return true;
};
