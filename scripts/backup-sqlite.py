#!/usr/bin/env python3
"""Create a checked SQLite snapshot, including committed WAL data."""
import argparse
from contextlib import closing
import os
from pathlib import Path
import sqlite3
import tempfile


def backup(source: Path, destination: Path) -> None:
    if not source.is_file():
        raise FileNotFoundError(source)
    if destination.exists():
        raise FileExistsError(destination)
    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.sqlite-backup-', dir=destination.parent)
    os.close(fd)
    try:
        with closing(sqlite3.connect(source.resolve().as_uri() + '?mode=ro', uri=True)) as origin:
            target = sqlite3.connect(temporary)
            try:
                origin.backup(target, pages=128, sleep=0.05)
                if target.execute('PRAGMA quick_check').fetchall() != [('ok',)]:
                    raise RuntimeError('Backup integrity check failed')
            finally:
                target.close()
        with open(temporary, 'rb') as snapshot:
            os.fsync(snapshot.fileno())
        # Publish only a complete snapshot and never overwrite an existing backup.
        os.link(temporary, destination)
    finally:
        os.unlink(temporary)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    backup(args.source, args.destination)
    print(f'Checked backup saved: {args.destination}')
