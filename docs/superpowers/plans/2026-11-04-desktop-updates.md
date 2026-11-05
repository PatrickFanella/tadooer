# Desktop in-app updates

## Goal and scope

Add a native Check for updates action, release discovery, download feedback
and restart-to-install for signed macOS releases. The existing portable Linux
archive gets a verified download flow and explicit installation guidance.
Keep desktop settings and the persistent owner session intact. All update
traffic uses the fixed publisher release host, independent of the selected
Tadooer server; no privileged update command is exposed to the remote page.

## Steps

1. Add tested release/version/metadata policy and the updater state machine.
2. Wire the native menu and restart path, including close-to-tray handling.
3. Propagate the release version and CI build number into staged packages;
   publish complete update metadata after artifacts. Implement requested Mac
   signing with existing approved entitlements and fail closed on errors.
4. Run focused and full checks, package/smoke tests and an isolated native Mac
   update exercise. Open a PR and follow exact-head required CI before merge.

## Decisions and constraints

- Keep the existing packager and Electron native macOS updater; do not add
  an update server or replace the desktop framework.
- Release updates need identity signatures. Soyuz has an existing Apple
  Development identity, and an isolated signing probe verified successfully.
  Test native update acceptance before claiming working automatic install.
  Public Developer ID/notarized distribution remains a separate credential
  requirement; never bypass signature validation or change keychain policy.
- An initial installation of the updater-enabled desktop is needed because
  the currently installed app has no updater. Preserve a rollback copy.
- Portable Linux archives cannot use Electron's built-in installer; do not
  claim automatic Linux installation. Do not execute or extract downloaded
  archives automatically.
- Use fixed HTTPS publisher URLs, bounded metadata/artifact sizes, semantic
  version comparison, checksum verification and matching platform assets.
  Reject partial releases and downgrades. No credentials in release files.

## Progress

- Inspected checkout and existing release pipeline; isolated worktree from
  f818001, canonical checkout's unrelated work preserved.
- Blacktower implementation workflow loaded. No subagents started.
- Implementation and package behavior checks completed; PR and hosted CI next.

## Implementation evidence

- Native menu and tray checks, consent before download and restart, fixed public
  publisher, SemVer channels and partial-release filtering implemented.
- Release stamping, final metadata assets, signed Mac ZIPs and verified portable
  Linux downloads implemented. No renderer update IPC or task-server credentials.
- Isolated Soyuz fixture: identity-signed Electron 43.3.0 apps updated from 1.0.0
  to 1.0.1 through the native Squirrel download/restart/install path. The replaced
  bundle passed strict codesign verification. Used a separate bundle identifier
  and profile; the installed Tadooer app was not changed.
- Focused desktop suite: 137 tests passed. Full verify passed, along with Linux release packaging and
  hidden-window smoke checks. Signed Mac arm64 and universal ZIP/DMG packaging,
  startup and hidden-window smoke checks passed on Soyuz.
- Development signing works with the existing Soyuz keychain identity. Public
  Developer ID signing/notarization has not been exercised without credentials.
