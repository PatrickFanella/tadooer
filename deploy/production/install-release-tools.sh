#!/bin/bash
# Install the release tools on nuc from a checkout of this repository. Run as
# root from the repository root: `sudo deploy/production/install-release-tools.sh`.
set -euo pipefail
test -f deploy/production/tadooer-release.sh
install -d -m 755 /usr/local/lib/tadooer-release
install -m 644 deploy/production/fingerprint.py /usr/local/lib/tadooer-release/fingerprint.py
install -m 644 deploy/release-channel.mjs /usr/local/lib/tadooer-release/release-channel.mjs
install -m 755 deploy/production/tadooer-release.sh /usr/local/sbin/tadooer-release
install -m 755 deploy/production/tadooer-release-ssh.sh /usr/local/sbin/tadooer-release-ssh
sha256sum /usr/local/sbin/tadooer-release /usr/local/sbin/tadooer-release-ssh \
  /usr/local/lib/tadooer-release/fingerprint.py /usr/local/lib/tadooer-release/release-channel.mjs
