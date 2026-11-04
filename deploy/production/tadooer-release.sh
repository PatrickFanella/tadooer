#!/bin/bash
# Tadooer release on nuc (issue: automated tag deploys). Run as root.
#
#   tadooer-release receive <version>            image tar on stdin -> local registry
#   tadooer-release deploy <version> <revision>  back up, rehearse, cut over, verify
#   tadooer-release status                       public build and readiness
#
# `deploy` is the parameterised form of the per-release nuc-prepare,
# nuc-verify-backup and nuc-deploy scripts used up to 0.15.0-rc.6. It takes
# the previous image from the running container, the expected migration count
# from the rehearsal, and the tables a migration may change from the
# rehearsal. Any failed check stops it. A failure after the cutover starts
# restores the previous image and the stopped snapshot.
#
# Installed by deploy/production/install-release-tools.sh.
set -euo pipefail
umask 077

P=/srv/apps/productivity
LIB=/usr/local/lib/tadooer-release
REGISTRY=127.0.0.1:5000/subculture-collective/productivity-suite
ORIGIN=https://tadooer.subcult.tv
CONTAINER=tadooer-suite-1
C=(docker compose --env-file "$P/tadooer.env" -f "$P/tadooer-compose.yaml")
# Tables that change while the app runs (sessions, sync), whatever the release.
CHURN="web_sessions client_identities active_sessions active_session_intervals sync_owner_state sync_changes calendar_collections"

die() {
  echo "tadooer-release: $*" >&2
  exit 1
}
valid_version() { [[ $1 =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z]+(\.[0-9A-Za-z]+)*)?$ ]]; }
valid_revision() { [[ $1 =~ ^[0-9a-f]{40}$ ]]; }
label() { docker image inspect "$1" --format "{{index .Config.Labels \"$2\"}}"; }
container_label() { docker inspect "$CONTAINER" --format "{{index .Config.Labels \"$1\"}}"; }
fingerprint() { python3 "$LIB/fingerprint.py" "$1"; }
registry_digest() {
  docker image inspect "$1" --format '{{range .RepoDigests}}{{println .}}{{end}}' |
    grep "^$REGISTRY@sha256:" | head -1
}
json_field() { python3 -c 'import json,sys;print(json.load(sys.stdin)[sys.argv[1]])' "$1"; }

status() {
  curl -fsS "$ORIGIN/api/build"
  echo
  curl -fsS "$ORIGIN/api/ready"
  echo
}

receive() {
  local version=$1 loaded digest
  valid_version "$version" || die "invalid version: $version"
  loaded=$(docker load | sed -n 's/^Loaded image: //p' | tail -1)
  [ -n "$loaded" ] || die "no tagged image on stdin"
  [ "$(label "$loaded" org.opencontainers.image.version)" = "$version" ] ||
    die "image $loaded is not version $version"
  docker tag "$loaded" "$REGISTRY:$version"
  docker push -q "$REGISTRY:$version" >/dev/null
  digest=$(registry_digest "$REGISTRY:$version")
  [ -n "$digest" ] || die "push did not produce a registry digest"
  echo "$digest"
}

# --- deploy -----------------------------------------------------------------

R="" OLD="" NEW="" REHEARSAL="" WORK="" CUTOVER=0 PROMOTED=0 DEPLOYED=0

cleanup() {
  local status=$?
  if [ -n "$REHEARSAL" ]; then docker rm -f "$REHEARSAL" >/dev/null 2>&1 || true; fi
  if [ -n "$WORK" ]; then rm -rf -- "$WORK"; fi
  if [ "$CUTOVER" = 1 ]; then rollback || echo "tadooer-release: ROLLBACK FAILED; recovery set in $R/before" >&2; fi
  # Keep the evidence but free the name, so the same version can be retried.
  if [ "$status" != 0 ] && [ "$DEPLOYED" = 0 ] && [ -n "$R" ] && [ -e "$R" ]; then
    mv "$R" "$R.failed-$(date -u +%H%M%S)"
    echo "tadooer-release: failed; evidence in $R.failed-*" >&2
  fi
  exit "$status"
}

rollback() {
  echo "tadooer-release: cutover failed; restoring $OLD and the stopped snapshot" >&2
  CUTOVER=0
  "${C[@]}" stop suite || true
  mkdir -p "$R/failed"
  cp -a "$P/data/tadooer/suite.sqlite" "$R/failed/" 2>/dev/null || true
  rm -f "$P/data/tadooer/suite.sqlite-wal" "$P/data/tadooer/suite.sqlite-shm"
  tar -C "$P/data/tadooer" -xzf "$R/before/suite-stopped.tar.gz" suite.sqlite credential.key
  chown 1000:1000 "$P/data/tadooer/suite.sqlite" "$P/data/tadooer/credential.key"
  cp -a "$R/before/tadooer.env" "$P/tadooer.env"
  cp -a "$R/before/tadooer-release.json" "$P/tadooer-release.json"
  if [ "$PROMOTED" = 1 ]; then cp -a "$R/before/stable.json" "$P/releases/channels/stable.json"; fi
  "${C[@]}" up -d --no-deps --wait suite
  status
  echo "tadooer-release: rolled back to $OLD; the failed database is in $R/failed" >&2
}

prepare() {
  local pre backup out stamp
  pre=$(curl -fsS "$ORIGIN/api/ready")
  INSTANCE=$(json_field instanceId <<<"$pre")
  OLD_MIGRATIONS=$(json_field migrationCount <<<"$pre")
  {
    echo "{\"recordedAt\":\"$(date -u +%FT%TZ)\","
    echo "\"containerImage\":$(docker inspect "$CONTAINER" --format '{{json .Config.Image}}'),"
    echo "\"imageId\":$(docker inspect "$CONTAINER" --format '{{json .Image}}'),"
    echo "\"health\":$(docker inspect "$CONTAINER" --format '{{json .State.Health.Status}}'),"
    echo "\"build\":$(curl -fsS "$ORIGIN/api/build"),"
    echo "\"ready\":$pre}"
  } >"$R/pre-deploy.json"
  out=$(/usr/local/sbin/tadooer-backup.sh)
  echo "$out"
  backup=${out##* at }
  (cd "$backup" && sha256sum -c --quiet SHA256SUMS)
  echo "backup checksums OK: $backup"
  echo "$backup" >"$R/before/documented-backup-path"
  fingerprint "$backup/suite.sqlite" >"$R/before/fingerprints.json"
  # Baikal is not changed by a release; keep a consistent copy beside it.
  local S=/srv/server/productivity/data/baikal
  stamp=/tmp/baikal-release-$$.sqlite
  mkdir -p "$R/before/baikal/Specific/db" "$R/before/baikal/config"
  docker exec baikal test ! -e "$stamp"
  docker exec baikal php -r '$db = new PDO("sqlite:/var/www/baikal/Specific/db/db.sqlite"); $db->exec("VACUUM INTO '"'$stamp'"'");'
  docker cp "baikal:$stamp" "$R/before/baikal/Specific/db/db.sqlite" >/dev/null
  docker exec baikal rm -f "$stamp"
  cp -a "$S/config/." "$R/before/baikal/config/"
  for f in .htaccess INSTALL_DISABLED; do
    if [ -e "$S/Specific/$f" ]; then cp -a "$S/Specific/$f" "$R/before/baikal/Specific/$f"; fi
  done
  python3 -c "import sqlite3,sys;d=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True);r=d.execute('pragma integrity_check').fetchone()[0];assert r=='ok',r;print('baikal integrity',r,'calendarobjects',d.execute('select count(*) from calendarobjects').fetchone()[0])" "$R/before/baikal/Specific/db/db.sqlite"
  tar -C "$R/before/baikal" -czf "$R/before/baikal-specific.tar.gz" Specific
  tar -C "$R/before/baikal" -czf "$R/before/baikal-config.tar.gz" config
  rm -rf "$R/before/baikal"
  # shellcheck disable=SC2046
  tar -C "$backup" -czf "$R/before/suite.tar.gz" suite.sqlite credential.key $(cd "$backup" && ls google-oauth.json ntfy-publisher.json 2>/dev/null)
  cp -a "$P/tadooer-compose.yaml" "$P/tadooer.env" "$P/tadooer-release.json" "$R/before/"
  (cd "$R/before" && sha256sum baikal-config.tar.gz baikal-specific.tar.gz fingerprints.json suite.tar.gz tadooer-compose.yaml tadooer.env tadooer-release.json >SHA256SUMS)
}

rehearse_get() {
  docker exec "$REHEARSAL" node -e "require('node:http').get({host:'127.0.0.1',port:8080,path:'$1',headers:{Host:'127.0.0.1:8080'}},r=>{let s='';r.on('data',d=>s+=d).on('end',()=>console.log(r.statusCode,s))}).on('error',e=>console.log('ERR',e.message))"
}

rehearse_start() {
  local out=""
  docker rm -f "$REHEARSAL" >/dev/null 2>&1 || true
  docker run -d --name "$REHEARSAL" --network none --read-only --user 1000:1000 --cap-drop ALL \
    --security-opt no-new-privileges:true --tmpfs /tmp:size=128m,mode=1777 -v "$WORK/data:/data" \
    -e SUITE_PUBLIC_ORIGIN=http://127.0.0.1:8080 -e SUITE_CREDENTIAL_KEY_PATH=/data/credential.key \
    -e SUITE_CALENDAR_BRIDGE_WORKER=false "$1" >/dev/null
  for _ in $(seq 1 90); do
    out=$(rehearse_get /api/ready 2>/dev/null || true)
    case "$out" in 200*) break ;; esac
    sleep 1
  done
  case "$out" in 200*) ;; *)
    docker logs "$REHEARSAL" 2>&1 | tail -20
    die "$2 did not become ready"
    ;;
  esac
  echo "$2 ready: $out"
  READY=${out#200 }
}

rehearse() {
  REHEARSAL=tadooer-rehearsal-$$
  WORK=$(mktemp -d /tmp/tadooer-rehearsal.XXXXXX)
  mkdir "$WORK/data"
  (cd "$R/before" && sha256sum -c --quiet SHA256SUMS)
  tar -C "$WORK/data" -xzf "$R/before/suite.tar.gz" suite.sqlite credential.key
  chown -R 1000:1000 "$WORK/data"
  fingerprint "$WORK/data/suite.sqlite" >"$WORK/restored.json"
  cmp "$WORK/restored.json" "$R/before/fingerprints.json"
  echo "extracted database fingerprint matches"
  rehearse_start "$OLD" "previous image on the restored backup"
  docker stop "$REHEARSAL" >/dev/null
  fingerprint "$WORK/data/suite.sqlite" >"$WORK/after-old.json"
  python3 - "$R/before/fingerprints.json" "$WORK/after-old.json" <<'PY'
import json,sys
a,b=(json.load(open(p)) for p in sys.argv[1:])
diff=[k for k in a if a[k]!=b.get(k)]
assert not diff, f"previous image changed the restored backup: {diff}"
print("previous image left the restored backup unchanged")
PY
  rehearse_start "$NEW" "new image on the restored backup"
  NEW_MIGRATIONS=$(json_field migrationCount <<<"$READY")
  docker stop "$REHEARSAL" >/dev/null
  fingerprint "$WORK/data/suite.sqlite" >"$R/rehearsal-after-new-fingerprints.json"
  python3 - "$R/before/fingerprints.json" "$R/rehearsal-after-new-fingerprints.json" "$R/rehearsal-changed.json" "$NEW_MIGRATIONS" <<'PY'
import json,sys
a,b=(json.load(open(p)) for p in sys.argv[1:3])
assert b['_integrity']=='ok', b['_integrity']
assert b['_foreign_key_violations']==0, b['_foreign_key_violations']
assert b['schema_migrations']['count']==int(sys.argv[4]), b['schema_migrations']
changed,new=[],[]
for k in sorted(set(a)|set(b)):
    if k.startswith('_') or k=='schema_migrations': continue
    if k not in a: new.append(k); print('new table', k, b[k]['count']); continue
    assert k in b, f'table dropped: {k}'
    assert a[k]['count']==b[k]['count'], f'row count changed in {k}: {a[k]["count"]} -> {b[k]["count"]}'
    if a[k]['sha256']!=b[k]['sha256']: changed.append(k); print('content or shape changed', k, a[k]['count'])
json.dump({'changed':changed,'new':new},open(sys.argv[3],'w'),indent=1)
print('rehearsal kept every row count; integrity ok; no foreign-key violations')
PY
  docker rm -f "$REHEARSAL" >/dev/null
  REHEARSAL=""
  rm -rf -- "$WORK"
  WORK=""
}

cutover() {
  cmp "$P/tadooer.env" "$R/before/tadooer.env"
  [ "$(docker inspect "$CONTAINER" --format '{{.Config.Image}}')" = "$OLD" ] || die "running image changed"
  (cd "$R/before" && sha256sum -c --quiet SHA256SUMS)
  cp -a "$P/releases/channels/stable.json" "$R/before/stable.json"
  CUTOVER=1
  "${C[@]}" stop suite
  fingerprint "$P/data/tadooer/suite.sqlite" >"$R/before/fingerprints-stopped.json"
  mkdir "$R/before/final-snapshot"
  python3 - "$P/data/tadooer/suite.sqlite" "$R/before/final-snapshot/suite.sqlite" <<'PY'
import sqlite3,sys
src=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True);dst=sqlite3.connect(sys.argv[2]);src.backup(dst);dst.close();src.close()
PY
  cp -a "$P/data/tadooer/credential.key" "$R/before/final-snapshot/credential.key"
  fingerprint "$R/before/final-snapshot/suite.sqlite" >"$R/before/fingerprints-snapshot.json"
  cmp "$R/before/fingerprints-stopped.json" "$R/before/fingerprints-snapshot.json"
  tar -C "$R/before/final-snapshot" -czf "$R/before/suite-stopped.tar.gz" suite.sqlite credential.key
  rm -rf "$R/before/final-snapshot"
  (cd "$R/before" && sha256sum stable.json suite-stopped.tar.gz fingerprints-stopped.json fingerprints-snapshot.json >>SHA256SUMS && sha256sum -c --quiet SHA256SUMS)
  python3 - "$P/tadooer.env" "$NEW" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]);lines=p.read_text().splitlines();assert sum(x.startswith('SUITE_IMAGE=') for x in lines)==1
p.write_text('\n'.join('SUITE_IMAGE='+sys.argv[2] if x.startswith('SUITE_IMAGE=') else x for x in lines)+'\n')
PY
  chmod 600 "$P/tadooer.env"
  "${C[@]}" up -d --no-deps --wait suite
  verify_live
  fingerprint "$P/data/tadooer/suite.sqlite" >"$R/post-deploy-fingerprints.json"
  python3 - "$R/before/fingerprints-stopped.json" "$R/post-deploy-fingerprints.json" "$R/rehearsal-changed.json" "$CHURN" <<'PY'
import json,sys
a,b,r=(json.load(open(p)) for p in sys.argv[1:4])
churn=set(sys.argv[4].split())
assert b['_integrity']=='ok' and b['_foreign_key_violations']==0
changed=[k for k in a if a[k]!=b.get(k)]
print('changed existing tables:', changed)
allowed=churn|set(r['changed'])|{'schema_migrations'}
assert not set(changed)-allowed, sorted(set(changed)-allowed)
for k in a:
    if k.startswith('_') or k in churn or k=='schema_migrations': continue
    assert a[k]['count']==b[k]['count'], f'row count changed in {k}'
PY
  local desktop
  desktop=$(json_field desktopArtifact <"$P/releases/channels/stable.json")
  python3 - "$R/manifest.json" "$VERSION" "$REVISION" "${NEW#*@}" "$desktop" <<'PY'
import json,sys,datetime
path,version,revision,digest,desktop=sys.argv[1:]
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
json.dump({'schemaVersion':1,'version':version,'revision':revision,'imageDigest':digest,'desktopArtifact':desktop,'qualifiedAt':stamp},open(path,'w'),indent=2)
PY
  node "$LIB/release-channel.mjs" promote "$R/manifest.json" "$P/releases/channels"
  PROMOTED=1
  python3 - "$R" "$P/tadooer-release.json" "$NEW" "$NEW_MIGRATIONS" <<'PY'
import json,sys,datetime
from pathlib import Path
r=Path(sys.argv[1]);manifest=json.loads((r/'manifest.json').read_text())
stamp=datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z')
record={'schemaVersion':1,'channel':'stable','version':manifest['version'],'createdAt':manifest['qualifiedAt'],'deployedAt':stamp,'sourceCommit':manifest['revision'],'image':sys.argv[3],'publicOrigin':'https://tadooer.subcult.tv','status':'deployed','migrationCount':int(sys.argv[4]),'backup':str(r/'before'),'rollback':str(r/'ROLLBACK.md'),'desktopArtifact':manifest['desktopArtifact'],'desktopNote':'Carried over from the previous stable channel; desktop packages are published on the Gitea release','reason':'Tag deploy from the release workflow'}
(r/'deployment.json').write_text(json.dumps(record,indent=2)+'\n');Path(sys.argv[2]).write_text(json.dumps(record,indent=2)+'\n')
PY
  "${C[@]}" restart suite
  "${C[@]}" up -d --no-deps --wait suite
  verify_live
  CUTOVER=0
  DEPLOYED=1
}

verify_live() {
  python3 - "$VERSION" "$REVISION" "$NEW_MIGRATIONS" "$INSTANCE" "$R/post-deploy.json" <<'PY'
import json,subprocess,sys,time
version,revision,migrations,instance,out=sys.argv[1:]
for attempt in range(30):
    try:
        build=json.loads(subprocess.check_output(['curl','-fsS','https://tadooer.subcult.tv/api/build'],text=True))
        ready=json.loads(subprocess.check_output(['curl','-fsS','https://tadooer.subcult.tv/api/ready'],text=True))
        break
    except subprocess.CalledProcessError:
        time.sleep(2)
else:
    raise SystemExit('public endpoints did not answer')
assert build['version']==version and build['revision']==revision, build
assert ready['status']=='ok' and ready['migrationCount']==int(migrations) and ready['instanceId']==instance, ready
open(out,'w').write(json.dumps({'build':build,'ready':ready},indent=2)+'\n')
print(json.dumps({'build':build,'ready':ready}))
PY
}

finish() {
  local out backup
  out=$(/usr/local/sbin/tadooer-backup.sh)
  backup=${out##* at }
  (cd "$backup" && sha256sum -c --quiet SHA256SUMS)
  fingerprint "$backup/suite.sqlite" >"$R/post-backup-fingerprints.json"
  python3 - "$R" "$backup" "$NEW_MIGRATIONS" "$OLD" "$(docker inspect "$CONTAINER" --format '{{.RestartCount}}')" <<'PY'
import json,sys,datetime
from pathlib import Path
r,backup,migrations,old,restarts=sys.argv[1:]
r=Path(r);fp=json.loads((r/'post-backup-fingerprints.json').read_text())
assert fp['_integrity']=='ok' and fp['_foreign_key_violations']==0
assert fp['schema_migrations']['count']==int(migrations)
post=json.loads((r/'post-deploy.json').read_text())
record={'verifiedAt':datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),'postBackup':backup,'backupChecksums':'ok','sqliteIntegrity':fp['_integrity'],'foreignKeyViolations':fp['_foreign_key_violations'],'migrations':int(migrations),'publicBuild':f"{post['build']['version']} {post['build']['revision']}",'publicReady':post['ready']['status'],'previousImage':old,'containerRestarts':int(restarts),'rehearsalChanged':json.loads((r/'rehearsal-changed.json').read_text())}
(r/'final-verification.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record))
PY
  cat >"$R/ROLLBACK.md" <<EOF
# Rollback: Tadooer $VERSION to the previous image

The previous image (\`$OLD\`) expects $OLD_MIGRATIONS migrations; this release
runs $NEW_MIGRATIONS. Do not point the previous image at the upgraded database.
Preserve the current database and every write made since cutover before
restoring a reviewed recovery point. Trusted devices whose sessions rotated
after the snapshot may need to sign in again.

The pre-upgrade recovery set is \`before/suite-stopped.tar.gz\` with its paired
credential key, checksums and fingerprints. Baikal is not changed by a release.

\`\`\`sh
R=$R
P=$P
(cd "\$R/before" && sha256sum -c SHA256SUMS)
docker compose --env-file "\$P/tadooer.env" -f "\$P/tadooer-compose.yaml" stop suite
# Preserve the current data and review its changes before restoring the snapshot.
# Restore before/suite-stopped.tar.gz to P/data/tadooer, with uid/gid 1000.
# Restore before/tadooer.env and before/tadooer-release.json to P.
# Restore before/stable.json to P/releases/channels/stable.json.
docker compose --env-file "\$P/tadooer.env" -f "\$P/tadooer-compose.yaml" up -d --no-deps --wait suite
curl -fsS $ORIGIN/api/build
curl -fsS $ORIGIN/api/ready
\`\`\`
EOF
  chown -R 1000:1000 "$R"
}

deploy() {
  VERSION=$1 REVISION=$2
  valid_version "$VERSION" || die "invalid version: $VERSION"
  valid_revision "$REVISION" || die "invalid revision: $REVISION"
  exec 9>/run/lock/tadooer-deploy.lock
  flock -n 9 || die "another deploy is running"
  NEW=$(registry_digest "$REGISTRY:$VERSION")
  [ -n "$NEW" ] || die "version $VERSION has not been received"
  [ "$(label "$NEW" org.opencontainers.image.version)" = "$VERSION" ] || die "image version label mismatch"
  [ "$(label "$NEW" org.opencontainers.image.revision)" = "$REVISION" ] || die "image revision label mismatch"
  OLD=$(docker inspect "$CONTAINER" --format '{{.Config.Image}}')
  # A rebuilt image has a new digest; the labels say what it was built from.
  # The container's config holds its image's labels, even when that image's
  # registry name now points at a rebuild.
  if [ "$(container_label org.opencontainers.image.version)" = "$VERSION" ] &&
    [ "$(container_label org.opencontainers.image.revision)" = "$REVISION" ]; then
    echo "already deployed: $VERSION ($REVISION) as $OLD"
    status
    return 0
  fi
  R=$P/releases/$(date -u +%Y%m%d)-$VERSION-${REVISION:0:7}
  [ ! -e "$R" ] || die "$R already exists"
  mkdir -p "$R/before"
  chmod 700 "$R"
  trap cleanup EXIT
  echo "== $VERSION ($REVISION): $OLD -> $NEW in $R"
  prepare
  rehearse
  cutover
  finish
  trap - EXIT
  echo "== deployed $VERSION"
}

case "${1:-}" in
receive)
  [ $# -eq 2 ] || die "usage: receive <version>"
  receive "$2"
  ;;
deploy)
  [ $# -eq 3 ] || die "usage: deploy <version> <revision>"
  deploy "$2" "$3"
  ;;
status)
  [ $# -eq 1 ] || die "usage: status"
  status
  ;;
*) die "usage: tadooer-release <receive|deploy|status> ..." ;;
esac
