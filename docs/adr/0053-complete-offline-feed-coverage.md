---
status: accepted
---

# Complete the remaining offline feed coverage

Issue #114, following ADRs 0050 and 0052. Decided 2026-10-12.

The remaining local owner records enter sync v2 as typed, read-only snapshots:
boards and panel order, stored task markers and backlog membership, sections,
saved task views, menu folders, application/planning/notification/capture
preferences, counters and stored day values, daily evaluations, task links and
attachments, archived task history with provenance, and recurring series with
exceptions and instance counts. Provider projections, credentials, connector
configuration, bridge state and automation tokens remain outside this feed.

Migration `0054_complete_readonly_feed_coverage` installs explicit SQLite table
triggers. Browser writes, assistant confirmations, imports and server ticks
therefore append changes in the same transaction as their records; a rollback
also rolls back the feed. Counter-day changes refresh the counter's derived
streak, and task lifecycle changes refresh dependent markers, links and series
counts. Deletions load as tombstones. Child membership changes address their
parent configuration, including both parents when membership moves.

Snapshots retain the existing 200-record page limit and build record payloads
only for the requested page. Owner-bound queries exclude deleted history and
unowned relations. Preference defaults travel even before the first save.
Composite keys are restricted to saved-view contexts and counter-day identities;
ordinary records retain UUID keys.

The migration resets the feed epoch so existing clients take a complete snapshot.
IndexedDB stays at version 2 and uses its existing entity store. Snapshot
replacement preserves and rebases the existing task, note, day-order and time
entry outbox. No new write operation or global mutable UI store is introduced.
The moved record routes and assistant operations become feed-only. Loaded
views refresh from per-kind IndexedDB feed marks after a round; older resource
hints remain readable for compatibility. Notification delivery status retains
its separate hint, as focus interval reports do. These new families stay
read-only offline: their established revisioned HTTP and
assistant write protocols remain authoritative until separate conflict rules
are accepted.

Cold offline startup exposes saved boards, counter history and archive search
through their existing pages, plus a saved-workspace view for preferences,
sections, views, folders, links and recurrence. Board membership is derived from
cached task facts with the same domain predicates and ordering as the server.
A failed network read may use the feed; successful error responses, including
authentication and provider refusals, remain errors. Offline pages explicitly
request cached reads even when the browser's connectivity flag is optimistic.
Provider calendar writes, archive/restore, attachment edits, recurrence generation
and counter stopwatch control never execute offline. Focus interval reports stay
server-owned; offline evaluation pages show unavailable focus time rather than a
fabricated total.

Verification covers every new family over HTTP, more than one snapshot page,
transaction rollback, deletion, derived changes, cold IndexedDB reopen, outbox
preservation, and refusal boundaries. A disposable native-browser dataset
qualifies the same cache and read-only pages. This is source qualification;
production rollout and multi-device latency qualification remain separate.
