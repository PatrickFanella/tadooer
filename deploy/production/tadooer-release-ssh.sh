#!/bin/bash
# Forced command for the release workflow's deploy key on nuc. The key's
# authorized_keys entry is `restrict,command="/usr/local/sbin/tadooer-release-ssh"`,
# so this is all the key can run. Arguments are passed as words, never
# evaluated; tadooer-release validates them again.
set -euo pipefail
read -r -a words <<<"${SSH_ORIGINAL_COMMAND:-}"
case "${words[0]:-}:${#words[@]}" in
receive:2) exec sudo -n /usr/local/sbin/tadooer-release receive "${words[1]}" ;;
deploy:3) exec sudo -n /usr/local/sbin/tadooer-release deploy "${words[1]}" "${words[2]}" ;;
status:1) exec sudo -n /usr/local/sbin/tadooer-release status ;;
esac
echo "tadooer-release-ssh: refused" >&2
exit 64
