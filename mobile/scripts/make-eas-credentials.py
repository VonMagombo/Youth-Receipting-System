"""Writes mobile/credentials.json (gitignored) pointing EAS at the department release key, so
`eas credentials` can upload that key instead of EAS generating a new one. See docs/RELEASE_SIGNING.md.

    python3 scripts/make-eas-credentials.py [~/.youth-subs-signing]
"""
import json
import os
import sys

key_dir = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else '~/.youth-subs-signing')
password = open(os.path.join(key_dir, 'password.txt')).read().strip()
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'credentials.json')
fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, 'w') as f:
    json.dump({'android': {'keystore': {
        'keystorePath': os.path.join(key_dir, 'release.p12'),
        'keystorePassword': password,
        'keyAlias': 'youthsubs',
        'keyPassword': password,
    }}}, f, indent=2)
print('wrote', os.path.normpath(out))
