#!/usr/bin/env python3
"""Create the one local owner credential. Never overwrite an existing credential."""
import argparse
import json
import os
import secrets
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--username', default='owner', help='Username for a new owner account')
args = parser.parse_args()
if not args.username.strip() or len(args.username) > 150:
    parser.error('username must contain 1–150 characters')
root = Path(__file__).resolve().parents[1]
folder = root / '.local'
folder.mkdir(exist_ok=True, mode=0o700)
folder.chmod(0o700)
path = folder / 'owner.json'
if not path.exists():
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(
            {'username': args.username.strip(), 'password': secrets.token_urlsafe(24)},
            f,
        )
# The containing directory is private; Docker's non-root process reads this mounted file.
path.chmod(0o644)
print('Local owner credentials: .local/owner.json (keep private; never commit).')
