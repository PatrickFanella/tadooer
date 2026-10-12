import { useState } from "react";
import type {
  ExternalIssue,
  IssueConnection,
  IssueConnectionsResponse,
  Project,
} from "@suite/contracts";
import {
  browseIssues,
  disconnectIssues,
  importIssues,
  listIssueConnections,
  getProjects,
  saveIssueConnection,
  saveSharedIssueToken,
  syncIssues,
  removeSharedIssueToken,
} from "../api.ts";

export const IssueConnections = ({
  getCsrfToken,
  onTaskChange,
}: {
  readonly getCsrfToken: () => Promise<string>;
  readonly onTaskChange: () => Promise<void>;
}) => {
  const [data, setData] = useState<IssueConnectionsResponse | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [provider, setProvider] = useState<"github" | "gitea">("gitea");
  const [origin, setOrigin] = useState("https://git.subcult.tv");
  const [repository, setRepository] = useState("");
  const [token, setToken] = useState("");
  const [tokenScope, setTokenScope] = useState<"repository" | "global">(
    "repository",
  );
  const [writeBack, setWriteBack] = useState(false);
  const [browse, setBrowse] = useState<{
    connection: IssueConnection;
    issues: ExternalIssue[];
  } | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [projectId, setProjectId] = useState("");
  const [text, setText] = useState("");
  const [stateFilter, setStateFilter] = useState("open");
  const [label, setLabel] = useState("");
  const [assignee, setAssignee] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await work();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Issue connection request failed.",
      );
    } finally {
      setBusy(false);
    }
  };
  const mutate = (work: (csrfToken: string) => Promise<void>) =>
    run(async () => work(await getCsrfToken()));
  const refresh = () =>
    run(async () => {
      const [connections, projectList] = await Promise.all([
        listIssueConnections(),
        getProjects(),
      ]);
      setData(connections);
      if (!connections.giteaOrigins.includes(origin))
        setOrigin(connections.giteaOrigins[0] ?? "");
      setProjects(projectList.filter((project) => project.archivedAt === null));
    });
  return (
    <section
      aria-labelledby="issue-connections-title"
      className="issue-connections"
    >
      <h3 id="issue-connections-title">GitHub and Gitea issues</h3>
      <p>
        Import selected issues as tasks. Sync updates linked tasks; estimates,
        planning, and time tracking stay in Tadooer.
      </p>
      <button type="button" disabled={busy} onClick={() => void refresh()}>
        Load issue connections
      </button>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {data !== null && (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void mutate(async (csrfToken) => {
                if (tokenScope === "global" && repository.trim() === "") {
                  setData(
                    await saveSharedIssueToken(
                      {
                        provider,
                        origin:
                          provider === "github" ? "https://github.com" : origin,
                        token,
                      },
                      csrfToken,
                    ),
                  );
                  setToken("");
                  setMessage(
                    "Shared token saved. Repository access is checked when you connect a repository.",
                  );
                  return;
                }
                const saved = await saveIssueConnection(
                  {
                    provider,
                    origin:
                      provider === "github" ? "https://github.com" : origin,
                    repository: repository.trim(),
                    token,
                    tokenScope,
                    writeBack,
                  },
                  csrfToken,
                );
                setData(saved);
                setToken("");
                setMessage(
                  "Repository connected. Browse issues to select tasks.",
                );
              });
            }}
          >
            <fieldset disabled={busy}>
              <legend>Connect or reconnect a repository</legend>
              <label>
                Issue provider
                <select
                  value={provider}
                  onChange={(event) =>
                    setProvider(event.target.value as "github" | "gitea")
                  }
                >
                  <option value="gitea">Gitea</option>
                  <option value="github">GitHub</option>
                </select>
              </label>
              {provider === "gitea" && (
                <label>
                  Gitea server
                  <select
                    value={origin}
                    onChange={(event) => setOrigin(event.target.value)}
                  >
                    {data.giteaOrigins.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Repository (owner/name)
                {tokenScope === "global"
                  ? " — optional when saving a shared token"
                  : ""}
                <input
                  type="text"
                  required={tokenScope === "repository"}
                  value={repository}
                  placeholder="subculture-collective/tadooer"
                  onChange={(event) => setRepository(event.target.value)}
                />
              </label>
              <label>
                Token scope
                <select
                  value={tokenScope}
                  onChange={(event) =>
                    setTokenScope(event.target.value as "repository" | "global")
                  }
                >
                  <option value="repository">This repository only</option>
                  <option value="global">
                    Shared across repositories on this provider
                  </option>
                </select>
              </label>
              <label>
                {tokenScope === "global"
                  ? "Shared access token"
                  : "Repository access token"}
                <input
                  required={
                    tokenScope === "repository" ||
                    repository.trim() === "" ||
                    !data.sharedTokens.some(
                      (item) =>
                        item.provider === provider &&
                        item.origin ===
                          (provider === "github"
                            ? "https://github.com"
                            : origin),
                    )
                  }
                  type="password"
                  autoComplete="off"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={writeBack}
                  onChange={(event) => setWriteBack(event.target.checked)}
                />
                Allow Sync to close or reopen remote issues when task completion
                changes
              </label>
              <p className="muted">
                Use a token with issue read access. Write-back also needs issue
                write access. With shared scope, leave Repository blank to save
                the token first; repository access is checked when you connect.
                A shared token applies to repositories using it on the selected
                provider and server. Leave it blank to reuse the saved token;
                entering a new one replaces it for those repositories. A
                repository token overrides the shared token for that connection.
              </p>
              <button
                type="submit"
                disabled={
                  provider === "gitea" && data.giteaOrigins.length === 0
                }
              >
                {tokenScope === "global" && repository.trim() === ""
                  ? "Save shared token"
                  : "Connect repository"}
              </button>
            </fieldset>
          </form>
          {data.sharedTokens.map((item) => (
            <div
              key={`${item.provider}:${item.origin}`}
              className="task-actions"
            >
              <span>
                Shared token saved ·{" "}
                {item.provider === "github" ? "GitHub" : item.origin}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void mutate(async (csrfToken) => {
                    setData(
                      await removeSharedIssueToken(
                        item.provider,
                        item.origin,
                        csrfToken,
                      ),
                    );
                    if (
                      browse?.connection.tokenScope === "global" &&
                      browse.connection.provider === item.provider &&
                      browse.connection.origin === item.origin
                    )
                      setBrowse(null);
                    setMessage(
                      "Shared token removed. Repositories using it need a token to reconnect; repository-specific tokens and imported tasks are preserved.",
                    );
                  })
                }
              >
                Remove shared token
              </button>
            </div>
          ))}
          {data.connections.map((connection) => (
            <article key={connection.id}>
              <h4>
                {connection.repository} ·{" "}
                {connection.provider === "github"
                  ? "GitHub"
                  : connection.origin}
              </h4>
              <p>
                {connection.state.replaceAll("_", " ")} ·{" "}
                {connection.tokenScope === "global"
                  ? "Shared token"
                  : "Repository token"}{" "}
                · Write-back {connection.writeBack ? "enabled" : "disabled"} ·
                Last sync:{" "}
                {connection.lastSuccessfulSyncAt === null
                  ? "never"
                  : new Date(connection.lastSuccessfulSyncAt).toLocaleString()}
              </p>
              <div className="task-actions">
                <button
                  type="button"
                  disabled={busy || connection.state === "disconnected"}
                  onClick={() =>
                    void run(async () => {
                      const result = await browseIssues(connection.id);
                      setBrowse({ connection, issues: result.issues });
                      setSelected([]);
                    })
                  }
                >
                  Browse issues
                </button>
                <button
                  type="button"
                  disabled={busy || connection.state === "disconnected"}
                  onClick={() =>
                    void mutate(async (csrfToken) => {
                      setData(await syncIssues(connection.id, csrfToken));
                      await onTaskChange();
                      setMessage(
                        "Sync finished. Review linked issue states below.",
                      );
                    })
                  }
                >
                  Sync linked tasks
                </button>
                <button
                  type="button"
                  disabled={busy || connection.state === "disconnected"}
                  onClick={() =>
                    void mutate(async (csrfToken) => {
                      setData(await disconnectIssues(connection.id, csrfToken));
                      if (browse?.connection.id === connection.id)
                        setBrowse(null);
                      setMessage(
                        "Disconnected. Imported tasks and issue links are preserved.",
                      );
                    })
                  }
                >
                  Disconnect
                </button>
              </div>
              {data.links
                .filter((link) => link.connectionId === connection.id)
                .map((link) => (
                  <div key={link.id} className="issue-link">
                    <a href={link.issue.url} target="_blank" rel="noreferrer">
                      #{link.issue.number} {link.issue.title}
                    </a>
                    {" · "}
                    <a href={`/tasks?task=${encodeURIComponent(link.taskId)}`}>
                      Open task
                    </a>
                    <p>
                      {link.state.replaceAll("_", " ")}
                      {link.message === null ? "" : ` · ${link.message}`}
                    </p>
                    {(link.state === "conflict" ||
                      link.state === "uncertain") && (
                      <div className="task-actions">
                        <button
                          type="button"
                          disabled={busy || connection.state === "disconnected"}
                          onClick={() =>
                            void mutate(async (csrfToken) => {
                              setData(
                                await syncIssues(
                                  connection.id,
                                  csrfToken,
                                  "accept_remote",
                                  link.id,
                                ),
                              );
                              await onTaskChange();
                            })
                          }
                        >
                          Use remote text and state
                        </button>
                        <button
                          type="button"
                          disabled={busy || connection.state === "disconnected"}
                          onClick={() =>
                            void mutate(async (csrfToken) => {
                              setData(
                                await syncIssues(
                                  connection.id,
                                  csrfToken,
                                  "retry_local",
                                  link.id,
                                ),
                              );
                              await onTaskChange();
                            })
                          }
                        >
                          {connection.writeBack
                            ? "Keep task text and retry task state"
                            : "Keep task text"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
            </article>
          ))}
          {browse !== null && (
            <div>
              <h4>Import from {browse.connection.repository}</h4>
              <label>
                Search issue titles
                <input
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
              </label>
              <label>
                Issue state
                <select
                  value={stateFilter}
                  onChange={(event) => setStateFilter(event.target.value)}
                >
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                  <option value="all">All</option>
                </select>
              </label>
              <label>
                Issue label
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                />
              </label>
              <label>
                Issue assignee
                <input
                  value={assignee}
                  onChange={(event) => setAssignee(event.target.value)}
                />
              </label>
              <label>
                Destination project
                <select
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                >
                  <option value="">Inbox (no project)</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </select>
              </label>
              <ul>
                {browse.issues
                  .filter(
                    (issue) =>
                      (stateFilter === "all" || issue.state === stateFilter) &&
                      issue.title.toLowerCase().includes(text.toLowerCase()) &&
                      (!label || issue.labels.includes(label)) &&
                      (!assignee || issue.assignees.includes(assignee)),
                  )
                  .map((issue) => {
                    const linked = data.links.some(
                      (link) =>
                        link.connectionId === browse.connection.id &&
                        link.issue.number === issue.number,
                    );
                    return (
                      <li key={issue.number}>
                        <label>
                          <input
                            type="checkbox"
                            disabled={busy || linked}
                            checked={selected.includes(issue.number)}
                            onChange={(event) =>
                              setSelected((current) =>
                                event.target.checked
                                  ? [...current, issue.number]
                                  : current.filter(
                                      (number) => number !== issue.number,
                                    ),
                              )
                            }
                          />
                          #{issue.number} {issue.title}
                          {linked ? " (already linked)" : ""}
                        </label>
                      </li>
                    );
                  })}
              </ul>
              <button
                type="button"
                disabled={
                  busy || selected.length === 0 || selected.length > 100
                }
                onClick={() =>
                  void mutate(async (csrfToken) => {
                    setData(
                      await importIssues(
                        browse.connection.id,
                        selected,
                        projectId || null,
                        csrfToken,
                      ),
                    );
                    setSelected([]);
                    await onTaskChange();
                    setMessage("Selected issues imported as linked tasks.");
                  })
                }
              >
                Import {selected.length} selected issues
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
};
