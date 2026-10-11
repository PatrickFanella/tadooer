# GitHub and Gitea issue sync

Issue connections are configured under **Connections → GitHub and Gitea
issues**. Load connections, choose a provider, enter `owner/repository`, and
choose **This repository only** or **Shared across repositories on this
provider**. A repository token is stored for that connection. A shared token is
stored once per signed-in owner, provider, and server origin; connections opting
into it reuse that grant. GitHub and each configured Gitea server have separate
shared tokens.

When connecting with shared scope, enter a token to save or replace it, or leave
the token field blank to reuse the saved one. The server verifies access to the
selected repository before saving a replacement. Replacing a shared token changes
the grant used on subsequent requests by every connection using that shared
scope. Repository-specific tokens are unaffected. Reconnecting a repository can
switch its token scope without changing its task links or write-back setting.

**Remove shared token** deletes the saved shared grant and marks its active
connections as needing authentication. Disconnecting one repository keeps the
shared grant for the other repositories. Imported tasks and links remain in
both cases. Token removal does not revoke the token at GitHub or Gitea.

GitHub uses `https://github.com` and its REST API. Gitea uses HTTPS origins from
the server's `SUITE_GITEA_ISSUE_ORIGINS` setting, a comma-separated list that
defaults to `https://git.subcult.tv`. The server rejects browser-supplied origins
outside that list and does not follow provider redirects. Configure additional
trusted instances on the server before connecting them.

Tokens need repository and issue read access. Enabling write-back also requires
issue write access. Tokens are encrypted with the existing Suite credential key.
Repository grants are bound to the owner, connection, provider, origin, and
repository; shared grants are bound to the owner, provider, and origin. API responses
omit credentials. Preserve the SQLite database and credential key together using
the existing backup procedure. Disconnect removes a repository-specific grant and keeps
imported tasks and issue links; it does not revoke the token at the provider.

## Import and refresh

Browse issues, filter by title, state, exact label, or exact assignee, select up to
100 issues, and choose an active Tadooer project or the Inbox. Imports create
ordinary tasks with the issue title, description, and completion state. Pull
requests are excluded. An issue can have one linked task per repository
connection; repeating an import preserves that task, including across restart.
Task creation and link persistence commit together. Provider reads finish before
the import transaction begins, so a failed issue read does not partially import
the selection.

**Sync linked tasks** reads each linked issue directly, including closed issues.
Remote text changes update unchanged task fields. Concurrent local and remote
text edits require explicit resolution. **Use remote text and state** replaces
the task's title, notes, and completion state with the latest provider values.
**Keep task text** preserves local title and notes. With write-back enabled, that
action also explicitly retries the current task completion state remotely.
Resolution does not write task title or notes back to the provider.

Estimates, deadlines, project/tag assignments, planning, subtasks, and time
tracking remain Suite data. Existing task mutation methods record imported and
updated tasks in the normal client sync history. Local completion changes stay
local while write-back is disabled; a later remote state change can update them.
Deleted tasks are not recreated by refresh. Restore the task before syncing its
link again.

## Close and reopen write-back

Write-back is disabled by default and applies only when the owner runs Sync.
When enabled, local task completion closes the linked remote issue, and reopening
the task reopens it. The service re-reads the remote issue and checks the task
revision before sending a state-only PATCH. These reads detect observed changes;
they do not provide an atomic compare-and-swap guarantee at GitHub or Gitea.

A pending remote state intent is saved before PATCH. A timeout, crash, or lost
response leaves the link uncertain. The next Sync reads the remote state and
reconciles an already-applied intent without sending another PATCH. If the
observed state differs, the owner chooses remote state or an explicit retry.
Changing task completion during a pending write requires conflict resolution.
Authentication failures and unavailable issues retain tasks and show recovery
states.

## Current limits and verification

Sync is manual. There are no webhooks, automatic polling, comment/attachment
imports, remote issue creation, or remote title/description writes. GitHub
Enterprise hosts are not supported. Browsing reads at most 20 pages (100 entries
per GitHub page, 50 per Gitea page); a larger list fails explicitly rather than
being presented as complete. Individual linked issues still use direct reads.
Provider content exceeding task title/notes limits is rejected without truncation.

Deterministic provider and authenticated HTTP checks are in
`apps/server/src/issue-sync.test.ts`. They use synthetic tokens and provider
responses with real temporary Suite databases. They cover duplicate import,
restart recovery, normal task sync mutations, remote text/state changes,
preserved planning fields, conflict resolution, opt-in write-back, interrupted
write reconciliation, authentication/not-found failures, pagination, malformed
responses, owner authentication, CSRF, allowed origins, and failed-selection
import atomicity. Real provider acceptance and production deployment require
separate evidence.
