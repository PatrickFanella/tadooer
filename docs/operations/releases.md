# Releases

A version tag releases Tadooer. The owner chose on 2026-11-04 that a tag
deploys to production automatically, and that Soyuz builds the macOS app.

## Cut a release

Tag a commit on `main` whose `verify` run passed, then push the tag:

```sh
git tag -a v0.15.0-rc.7 -m "Tadooer 0.15.0-rc.7" origin/main
git push origin v0.15.0-rc.7
```

The tag is `v` plus a semantic version. A pre-release part (`-rc.7`) makes the
Gitea release a pre-release. A version can be released once: the stable
channel refuses a version it has already recorded.

`.gitea/workflows/release.yml` then runs:

| Job             | Runner                | Does                                                                                                                                                                                                            |
| --------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify`        | `ubuntu-24.04`        | `pnpm verify` on the tagged commit. Every other job waits for it.                                                                                                                                               |
| `server`        | `ubuntu-24.04`        | Builds the image with `SUITE_VERSION` and `SUITE_REVISION`, sends it to nuc over SSH, and runs the deploy there.                                                                                                |
| `desktop-linux` | `ubuntu-24.04`        | `pnpm package:desktop`; uploads the tar.gz, checksum and final update metadata to the Gitea release.                                                                                                            |
| `desktop-mac`   | `macos-arm64` (Soyuz) | `pnpm package:desktop:mac:universal`; uploads the zip, the disk image and their checksums. Signing follows the repository's Mac signing variables; see [desktop updates](desktop.md#desktop-updates).           |
| `android`       | `ubuntu-24.04`        | Installs JDK 21 and the Android SDK (pinned checksum), builds the release APK with the run number as `versionCode`, signs it with the release key and checks the certificate; uploads the APK and its checksum. |
| `ios`           | `macos-arm64` (Soyuz) | Checks the Swift policy against the shared policy, builds an unsigned iPhone app and uploads it as `tadooer-ios-<version>-unsigned.ipa` with its checksum. See [mobile.md](mobile.md#iphone).                   |

The desktop jobs upload over plain HTTP to Almaz on the LAN
(`GITEA_ORIGIN_ADDRESS=10.0.0.200`, with `git.subcult.tv` as the host name)
instead of through Cloudflare, which refuses request bodies over 100 MB. The
token on that connection is the workflow's own, which expires with the job.

"Run workflow" on the release action, with an existing tag, runs the same
jobs for that tag. A tag that is already live is reported and left as it is,
so this rebuilds the desktop packages without a second deployment. It checks
out the tag, so it uses the tools as they were when the tag was made.

Desktop release builds stamp the tag version and CI run number into the copied
application before signing. The source `apps/desktop/package.json` is not
rewritten. Each desktop job publishes its platform's update metadata after
all archives and checksums, so incomplete releases are not offered by the app.

For owner Mac builds, set repository variables `SUITE_MAC_SIGN=development`
and `SUITE_MAC_SIGN_IDENTITY` to an identity in the Soyuz runner's keychain.
The runner must be able to sign without an interactive prompt. Keep the same
signing requirement across updates. Developer ID distribution additionally
needs notarization credentials; see [signing](desktop.md#release-metadata-and-signing).

## The deploy on nuc

The `server` job holds one SSH key, stored base64-encoded on one line as the
repository secret `NUC_DEPLOY_KEY_B64`, with nuc's host key in
`NUC_KNOWN_HOSTS`. Keep every secret on one line: the runner prints each
step's environment, and Gitea masks a secret only where the printed text
matches it exactly. The first key was stored with its line breaks, appeared in
the `server` job logs of the public repository, and was replaced on
2026-11-04. On nuc the key's
`authorized_keys` entry is
`restrict,from="10.0.0.50",command="/usr/local/sbin/tadooer-release-ssh"`: it
works only from Kvant (both CI runners leave through Kvant's address) and can
run only:

- `receive <version>`: loads the image from standard input, checks its version
  label and pushes it to nuc's registry `127.0.0.1:5000`;
- `deploy <version> <revision>`: the release itself;
- `status`: the public build and readiness.

A version is "already live" when the running image carries the same version
and revision labels; a rebuild of the same tag gets a new digest.

`deploy` (`deploy/production/tadooer-release.sh`, installed as
`/usr/local/sbin/tadooer-release`) does what the per-release scripts did up to
0.15.0-rc.6, with the release values worked out instead of written in:

1. Checks the image's version and revision labels, and stops if that image is
   already running.
2. Takes the documented online backup and a Baikal copy into
   `/srv/apps/productivity/releases/<date>-<version>-<revision>/before/`.
3. Restores the backup into network-less containers. The running image must
   serve it unchanged; the new image must serve it with every row count kept,
   integrity ok and no foreign-key violations. The migration count and the
   tables whose content changed are taken from this rehearsal.
4. Stops the app, snapshots the database, switches `SUITE_IMAGE`, starts the
   app and checks the public build, readiness, migration count and instance
   ID. Only session and sync tables, plus the tables the rehearsal changed,
   may differ. It then promotes the stable channel, restarts once and checks
   again.
5. Takes a post-deploy backup and writes `final-verification.json` and
   `ROLLBACK.md`.

A failure before step 4 changes nothing in production; the release directory
is renamed `<name>.failed-<time>`. A failure during step 4 stops the app,
restores the stopped snapshot and the previous image, and keeps the failed
database in `failed/`. The desktop artifact recorded in the stable channel is
carried over from the previous release.

## Change the release tools

The tools on nuc are copies. After changing `tadooer-release.sh`,
`tadooer-release-ssh.sh`, `fingerprint.py` or `deploy/release-channel.mjs`,
install them on nuc from a checkout of the merged change:

```sh
sudo deploy/production/install-release-tools.sh
```

It prints the installed files' checksums.

## The macOS runner

Soyuz runs `act_runner` 0.6.1 as the LaunchAgent `tv.subcult.act-runner`
(`~/Library/LaunchAgents/tv.subcult.act-runner.plist`), from
`~/.local/opt/act_runner` with its registration and configuration in
`~/.local/share/act_runner`. It is registered to the `subculture-collective` organization, with
the labels `macos` and `macos-arm64` and capacity 1, and runs jobs on the host
in your login session. Logs are in `~/Library/Logs/act-runner.log`. To stop
it: `launchctl bootout gui/$(id -u)/tv.subcult.act-runner`.
