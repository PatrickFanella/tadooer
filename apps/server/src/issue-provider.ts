import {
  externalIssueSchema,
  issueProviderPayloadSchema,
  type ExternalIssue,
  type IssueConnectionInput,
} from "@suite/contracts";

export class IssueProviderError extends Error {
  constructor(
    readonly code:
      | "authentication_required"
      | "unavailable"
      | "not_found"
      | "invalid_response"
      | "too_many_issues",
  ) {
    super(code);
  }
}

export class IssueProvider {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async request(
    connection: IssueConnectionInput,
    path: string,
    state?: "open" | "closed",
  ): Promise<unknown> {
    const base =
      connection.provider === "github"
        ? "https://api.github.com"
        : `${connection.origin}/api/v1`;
    try {
      const response = await this.fetcher(`${base}${path}`, {
        method: state === undefined ? "GET" : "PATCH",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        headers: {
          Authorization: `${connection.provider === "github" ? "Bearer" : "token"} ${connection.token}`,
          Accept: "application/json",
          ...(connection.provider === "github"
            ? { "X-GitHub-Api-Version": "2022-11-28" }
            : {}),
          ...(state === undefined
            ? {}
            : { "Content-Type": "application/json" }),
        },
        ...(state === undefined ? {} : { body: JSON.stringify({ state }) }),
      });
      if (response.status === 401)
        throw new IssueProviderError("authentication_required");
      if (response.status === 404) throw new IssueProviderError("not_found");
      if (!response.ok) throw new IssueProviderError("unavailable");
      if (response.body === null)
        throw new IssueProviderError("invalid_response");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 2 * 1024 * 1024)
            throw new IssueProviderError("invalid_response");
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    } catch (error) {
      if (error instanceof IssueProviderError) throw error;
      throw new IssueProviderError("unavailable");
    }
  }

  private path(connection: IssueConnectionInput): string {
    return `/repos/${connection.repository.split("/").map(encodeURIComponent).join("/")}/issues`;
  }
  private parse(
    connection: IssueConnectionInput,
    value: unknown,
  ): ExternalIssue | null {
    const raw = issueProviderPayloadSchema.safeParse(value);
    if (!raw.success) throw new IssueProviderError("invalid_response");
    if (raw.data.pull_request != null) return null;
    const issue = externalIssueSchema.safeParse({
      number: raw.data.number,
      title: raw.data.title,
      notes: raw.data.body ?? "",
      state: raw.data.state,
      updatedAt: raw.data.updated_at,
      url: `${connection.origin}/${connection.repository}/issues/${String(raw.data.number)}`,
      labels: raw.data.labels.map((label) =>
        typeof label === "string" ? label : label.name,
      ),
      assignees: raw.data.assignees.map(({ login }) => login),
    });
    if (!issue.success) throw new IssueProviderError("invalid_response");
    return issue.data;
  }
  async list(connection: IssueConnectionInput): Promise<ExternalIssue[]> {
    const issues: ExternalIssue[] = [];
    const limit = connection.provider === "github" ? 100 : 50;
    for (let page = 1; page <= 20; page++) {
      const value = await this.request(
        connection,
        `${this.path(connection)}?state=all&type=issues&sort=updated&direction=desc&page=${String(page)}&${connection.provider === "github" ? "per_page" : "limit"}=${String(limit)}`,
      );
      if (!Array.isArray(value))
        throw new IssueProviderError("invalid_response");
      for (const item of value) {
        const issue = this.parse(connection, item);
        if (issue !== null) issues.push(issue);
      }
      if (value.length < limit) return issues;
    }
    throw new IssueProviderError("too_many_issues");
  }
  async get(
    connection: IssueConnectionInput,
    number: number,
  ): Promise<ExternalIssue> {
    const issue = this.parse(
      connection,
      await this.request(
        connection,
        `${this.path(connection)}/${String(number)}`,
      ),
    );
    if (issue?.number !== number)
      throw new IssueProviderError("invalid_response");
    return issue;
  }
  async setState(
    connection: IssueConnectionInput,
    number: number,
    state: "open" | "closed",
  ): Promise<ExternalIssue> {
    const issue = this.parse(
      connection,
      await this.request(
        connection,
        `${this.path(connection)}/${String(number)}`,
        state,
      ),
    );
    if (issue?.number !== number || issue.state !== state)
      throw new IssueProviderError("invalid_response");
    return issue;
  }
}
