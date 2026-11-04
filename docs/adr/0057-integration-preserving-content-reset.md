# ADR 0057: Integration-preserving content reset

Status: accepted. Issue #209.

## Context

Task deletion, archive and per-record edits cannot clear all historical evaluations, imported plugin payloads and recurrence state. Rebuilding a schedule needs a supported content reset that keeps the owner's connected services and access. A database edit outside the application would omit approval, audit, replay and device-cache behavior.

## Decision

Expose `data.reset` through the existing automation preview and confirmation protocol. It requires the new `data:reset` scope; issuing this release does not broaden existing tokens. The command is consequential and irreversible, rejects the ordinary execution shortcut, and binds approval to a fingerprint of the exact owner content. The preview returns bounded per-table counts, the total, preserved integration-board count and a summary of the effects. A content edit, addition, deletion or earlier reset invalidates the preview.

Confirmation removes working and historical records from the reviewed export inventory: tasks and children (including trash and archive), taxonomy and organization, notes, templates, habits, pools, recurrence, imported task provenance and payloads, work history, metrics, evaluations and obsolete deliveries. It clears runtime references before deleting their tasks. Imported plugin records are inert data, not live connector grants.

Keep accounts, password/session data, automation credentials, audit and replay receipts, hosted OAuth, encrypted connector grants, issue-provider credentials, calendar configuration, subscriptions, publication feeds and remote calendar records. Provider-mapped boards and their panels, projects and referenced tags remain as integration scaffolding; task membership is cleared. Keep owner preferences and delivery configuration, clearing a default-project reference only when its project was removed.

Refuse preview or confirmation while focus is active, task calendar blocks remain, or a notification is being sent. Those effects require their existing lifecycle workflows. Reset performs no provider network calls and sends no messages.

The mutation uses a savepoint within the automation confirmation transaction, so content, preview consumption, audit and replay receipt commit together. A failed delete rolls back every change. A replay, including after restart, returns the receipt without resetting content created afterward.

Migration `0059_content_reset_generation` records a new owner content generation during reset. It is installation state and is excluded from portable data export. Reset also starts a new sync epoch and broadcasts an all-resource invalidation. Snapshot responses carry the content generation. On its first new generation, a device clears its old outbox and conflicts rather than replaying them over the empty cache. Later snapshots of the same generation keep new unsent work. The retry path rereads the outbox. The server refuses a sync round with a missing or different generation after reset, so a cached older client must reload before writing. Ordinary retention recovery and restore keep their existing unsent-edit behavior.

## Operational sequence

Take a coherent operator backup and preserve the source schedule before previewing a production reset. The owner explicitly grants `data:reset` in Connections. Read the preview's content counts and preservation summary, obtain approval, then confirm its returned ID with a unique idempotency key. Confirmations expire after five minutes. If state changed, reread and obtain a new preview rather than bypassing the stale check.

Read back empty content, connected services and the new sync generation. Recreate the source schedule using task, hierarchy, recurrence, planning and calendar commands so their normal validation and delivery hooks run. Queueing a reminder is not proof of successful delivery.

## Validation

Regression tests cover complete content removal, encrypted Google/Baikal grant preservation, provider-bound organization, preferences and other-owner isolation; same-count edits; rollback; in-flight delivery and focus refusal; dedicated scope and explicit confirmation; restart-safe replay; clearing pre-reset offline queues; preserving new queues on subsequent snapshots; and the legacy-client write fence. Existing export inventory, MCP catalog and sync-retention checks remain required.
