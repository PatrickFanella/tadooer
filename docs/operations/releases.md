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

| Job             | Runner                | Does                                                                                                                                                                                                   |
| --------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `verify`        | `ubuntu-24.04`        | `pnpm verify` on the tagged commit. Every other job waits for it.                                                                                                                                      |
| `server`        | `ubuntu-24.04`        | Builds the image with `SUITE_VERSION` and `SUITE_REVISION`, sends it to nuc over SSH, and runs the deploy there.                                                                                       |
| `desktop-linux` | `ubuntu-24.04`        | `pnpm package:desktop`; uploads the tar.gz and its checksum to the Gitea release.                                                                                                                      |
| `desktop-mac`   | `macos-arm64` (Soyuz) | `pnpm package:desktop:mac:universal`; uploads the zip, the disk image and their checksums. The app is signed ad hoc, not with a Developer ID; see [desktop.md](desktop.md#what-an-unsigned-app-means). |

The desktop jobs upload over plain HTTP to Almaz on the LAN
(`GITEA_ORIGIN_ADDRESS=10.0.0.200`, with `git.subcult.tv` as the host name)
instead of through Cloudflare, which refuses request bodies over 100 MB. The
token on that connection is the workflow's own, which expires with the job.

"Run workflow" on the release action, with an existing tag, runs the same
jobs for that tag. A tag that is already live is reported and left as it is,
so this rebuilds the desktop packages without a second deployment. It checks
out the tag, so it uses the tools as they were when the tag was made.

The desktop packages keep their own version (`apps/desktop/package.json`);
the release tag names the server version.

## The deploy on nuc

The `server` job holds one SSH key, stored as the repository secret
`NUC_DEPLOY_KEY` with nuc's host key in `NUC_KNOWN_HOSTS`. On nuc the key's
`authorized_keys` entry is
`restrict,from="10.0.0.50",command="/usr/local/sbin/tadooer-release-ssh"`: it
works only from Kvant (both CI runners leave through Kvant's address) and can
run only:

- `receive <version>`: loads the image from standard input, checks its version
  label and pushes it to nuc's registry `127.0.0.1:5000`;
- `deploy <version> <revision>`: the release itself;
- `status`: the public build and readiness.

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
`~/.local/share/act_runner`. It is registered to this repository only, with
the labels `macos` and `macos-arm64` and capacity 1, and runs jobs on the host
in your login session. Logs are in `~/Library/Logs/act-runner.log`. To stop
it: `launchctl bootout gui/$(id -u)/tv.subcult.act-runner`.
