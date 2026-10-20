#!/usr/bin/env python3
"""Build a local country lookup DB from a DB-IP Lite CSV gzip file.

Download the current CSV from https://db-ip.com/db/download/ip-to-country-lite.
Usage: python3 scripts/prepare-geoip.py input.csv.gz /path/to/geoip.sqlite
No visitor IP addresses are sent to DB-IP. Attribution: https://db-ip.com
"""
import csv
import gzip
import ipaddress
import os
import sqlite3
import sys
from pathlib import Path


def key(value):
    ip = ipaddress.ip_address(value)
    if ip.version == 4:
        ip = ipaddress.IPv6Address('::ffff:' + str(ip))
    return format(int(ip), '032x')


def build(source, destination):
    target = Path(destination)
    temporary = target.with_suffix('.tmp')
    if temporary.exists():
        raise RuntimeError('Temporary database already exists')
    db = sqlite3.connect(temporary)
    try:
        db.execute('CREATE TABLE ranges(first TEXT PRIMARY KEY,last TEXT NOT NULL,country TEXT NOT NULL) WITHOUT ROWID')
        with gzip.open(source, 'rt', newline='') as stream:
            for row in csv.reader(stream):
                start, end, country = row
                if len(country) != 2 or not country.isalpha():
                    raise ValueError('Invalid country code')
                db.execute('INSERT INTO ranges VALUES(?,?,?)', (key(start), key(end), country.upper()))
        count = db.execute('SELECT COUNT(*) FROM ranges').fetchone()[0]
        if count < 1000:
            raise ValueError('Incomplete country database')
        db.commit()
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError('Database integrity check failed')
        db.close()
        os.replace(temporary, target)
        print(f'Country database ready: {count} ranges')
    except BaseException:
        db.close()
        temporary.unlink(missing_ok=True)
        raise


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2])
