import 'fake-indexeddb/auto';
import { afterEach, expect, it } from 'vitest';
import {
  WorkspaceDB,
  LocalNotes,
  exportWorkspace,
  importWorkspace,
  validateBackup,
} from '../src/lib/storage';
const dbs: WorkspaceDB[] = [];
function setup() {
  const db = new WorkspaceDB(crypto.randomUUID());
  dbs.push(db);
  return { db, repo: new LocalNotes(db) };
}
afterEach(async () => {
  for (const db of dbs) await db.delete();
  dbs.length = 0;
});
it('persists content across repository instances', async () => {
  const { db, repo } = setup();
  const n = await repo.create('Note1', 'General', 'note');
  await repo.write({ ...n, body: 'Remember this' });
  expect((await new LocalNotes(db).list())[0].body).toBe('Remember this');
});
it('preserves both edits when revisions conflict', async () => {
  const { repo } = setup();
  const n = await repo.create('Note1', 'General', 'note');
  await repo.write({ ...n, body: 'First writer' });
  await repo.write({ ...n, body: 'Second writer' });
  expect((await repo.list()).map((n) => n.body).sort()).toEqual([
    'First writer',
    'Second writer',
  ]);
});
it('round-trips backups without overwriting existing notes', async () => {
  const { repo, db } = setup();
  await repo.create('Note1', 'General', 'note');
  const backup = await exportWorkspace(db);
  expect(await importWorkspace(db, backup)).toBe(1);
  const notes = await repo.list();
  expect(notes).toHaveLength(2);
  expect(notes[0].id).not.toBe(notes[1].id);
});
it('rejects malformed import without modifying data', async () => {
  const { db, repo } = setup();
  await repo.create('Keep', 'General', 'note');
  await expect(
    importWorkspace(db, { format: 'zivizip', version: 99, notes: [] }),
  ).rejects.toThrow();
  expect(await repo.list()).toHaveLength(1);
  expect(() =>
    validateBackup({ format: 'zivizip', version: 1, notes: [{ id: 'bad' }] }),
  ).toThrow();
});
it('keeps guest notes separate from the account cache', async () => {
  const guest = setup();
  const account = setup();
  await guest.repo.create('Guest private', 'General', 'note');
  await account.repo.create('Owner private', 'General', 'note');
  await account.db.delete();
  expect((await guest.repo.list()).map((n) => n.name)).toEqual([
    'Guest private',
  ]);
});
it('round-trips Draw backups and accepts legacy Text backups', async () => {
  const { repo, db } = setup();
  const n = await repo.create('Canvas', 'General', 'note', 'draw');
  const body = JSON.stringify({
    version: 1,
    shapes: [
      {
        id: 'shape-1',
        type: 'rect',
        points: [
          [0, 0],
          [100, 80],
        ],
        color: '#17c5d5',
        width: 4,
        angle: 45,
        text: 'Plan',
        fontSize: 24,
        erased: [],
      },
    ],
  });
  await repo.write({ ...n, body });
  const backup = await exportWorkspace(db);
  expect(backup.version).toBe(5);
  await importWorkspace(db, backup);
  expect(
    (await repo.list()).every((n) => n.kind === 'draw' && n.body === body),
  ).toBe(true);
  const legacy = {
    ...backup,
    version: 1,
    notes: backup.notes.map((n) => ({
      ...n,
      kind: undefined,
      body: 'Legacy text',
    })),
  };
  expect(validateBackup(legacy).notes[0].body).toBe('Legacy text');
  const bad = {
    ...backup,
    notes: backup.notes.map((n) => ({ ...n, body: '{}' })),
  };
  await expect(importWorkspace(db, bad)).rejects.toThrow();
  expect(await repo.list()).toHaveLength(2);
});
it('exports embedded attachments once and restores image placement', async () => {
  const { hashBlob } = await import('../src/lib/text/media');
  const { repo, db } = setup();
  const blob = new Blob([new TextEncoder().encode('RIFF0000WEBPtest')], {
    type: 'image/webp',
  });
  const asset = await hashBlob(blob);
  await db.media.put({ id: asset, blob });
  const note = await repo.create('With image', 'General', 'note');
  await repo.write({
    ...note,
    body: 'Caption',
    rich: {
      version: 1,
      blocks: [
        { type: 'paragraph', text: 'Caption' },
        { type: 'image', id: 'image-1' },
      ],
      images: [
        { id: 'image-1', asset, w: 120, h: 90, dx: 3, dy: -20, angle: 35 },
      ],
    },
  });
  const backup = await exportWorkspace(db);
  expect(backup.media).toHaveLength(1);
  const target = setup();
  await importWorkspace(target.db, backup);
  expect((await target.repo.list())[0].rich?.images[0].angle).toBe(35);
  expect((await target.db.media.get(asset))?.blob.size).toBe(blob.size);
  await expect(
    importWorkspace(target.db, {
      ...backup,
      media: [{ ...backup.media![0], data: 'bad' }],
    }),
  ).rejects.toThrow();
  expect(await target.repo.list()).toHaveLength(1);
});
