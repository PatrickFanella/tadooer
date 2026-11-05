# 0058: Desktop updates from the release publisher

Status: accepted

## Context

Desktop bundles previously needed manual replacement. The server address is
user-configurable and cannot be trusted to supply executable desktop updates.
The existing portable Linux package has no installer and Electron's native
updater supports macOS, not Linux.

## Decision

Keep the existing packager. Discover newer compatible releases from the fixed
public Tadooer Gitea repository in the main process. Require a final per-platform
metadata asset and matching archive. Check SemVer, channel, origin, size and hash;
never expose an update command or publisher override to the remote renderer.

Use Electron's native Squirrel updater on identity-signed Mac builds, with its
signature validation enabled. A per-release default-format feed avoids comparing
prerelease versions through Apple's numeric short bundle version. Stamp the full
release version and numeric CI build number before signing. Sign the finished
bundle, then archive it with ditto. Publish metadata last.

Ask before download and again before restart. Disable the close-to-tray guard
before native quit-and-install. Keep profiles, task-server sessions and settings
outside the replaced bundle. Ad hoc Mac builds open the release page. Linux
verifies and reveals a bounded archive for manual replacement.

## Consequences

Existing Mac installations need one manual bootstrap to a consistently signed
updater-enabled build. Apple Development signing supports the owner's machines;
public Gatekeeper acceptance still requires Developer ID and notarisation.
Portable Linux installation stays manual. This adds no update server or new
runtime dependency and changes no task, integration or task-server workflow.
