# Integration-preserving content reset

The owner requested a full content reset before recreating the Super Productivity schedule through native commands.

- Add an owner-scoped, fingerprint-bound reset preview and an atomic reset.
- Remove active, deleted and archived tasks; recurrence; templates; organization; tracked history; metrics; evaluations; imported plugin payloads; obsolete reminders.
- Preserve accounts, sessions, automation credentials and audit, provider grants, calendar configuration and external calendar data. Preserve the board/project scaffolding required by issue-provider mappings and show it in the preview.
- Preserve app/planning/reminder preferences; clear a default project reference only if that project is removed.
- Refuse while focus, calendar task blocks or an in-flight notification need their own lifecycle operation.
- Require a dedicated `data:reset` grant and consequential preview/confirmation. A content edit after preview must invalidate approval. Replay must never erase newly created work.
- Reuse the supported sync epoch reset so devices reload the authoritative state.

Validation: persistence tests for removal, preservation, isolation, stale previews, rollback and guards; server tests for scope, confirmation, replay and fresh sync; contract and MCP discovery tests; full repository checks and hosted CI before production use.

Progress: reset store, dedicated-scope preview/confirmation, preservation guards and device generation fence implemented. Full `pnpm verify` passes (1,347 tests passed, 5 skipped), and the built MCP initializes with 103 tools including the consequential reset command. Hosted CI and live delivery remain. No production application data changed.
