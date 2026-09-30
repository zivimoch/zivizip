#!/usr/bin/env python3
"""Verify note and session persistence across a local Notes container restart."""
import http.cookiejar
import json
import subprocess
import time
import uuid
from pathlib import Path
from urllib.error import URLError
from urllib.request import HTTPCookieProcessor, Request, build_opener

root = Path(__file__).resolve().parents[1]
base = 'http://127.0.0.1:4174'
jar = http.cookiejar.CookieJar()
client = build_opener(HTTPCookieProcessor(jar))


def request(path, method='GET', body=None):
    req = Request(
        base + '/api' + path,
        method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={
            'Content-Type': 'application/json',
            'Origin': base,
            'X-Zivizip': '1',
        },
    )
    with client.open(req, timeout=10) as response:
        payload = response.read()
        return json.loads(payload) if payload else None


request('/session', 'POST', json.loads((root / '.local/owner.json').read_text()))
stamp = int(time.time() * 1000)
created = request('/notes', 'POST', {
    'id': str(uuid.uuid4()),
    'name': 'Persistence acceptance check',
    'category': 'Test',
    'icon': 'note',
    'body': 'Temporary restart verification',
    'revision': 1,
    'createdAt': stamp,
    'updatedAt': stamp,
})
try:
    subprocess.run(['docker', 'compose', 'restart', 'notes'], cwd=root, check=True)
    for attempt in range(20):
        try:
            account = request('/session')
            notes = request('/notes')
            break
        except URLError:
            time.sleep(0.5)
    else:
        raise RuntimeError('Notes service did not recover')
    assert account['id'] == 'owner'
    assert any(n['id'] == created['id'] and n['body'] == created['body'] for n in notes)
    print('PASS: session and note survive Notes container restart.')
finally:
    request('/notes/' + created['id'], 'DELETE', created)
    request('/session', 'DELETE')
