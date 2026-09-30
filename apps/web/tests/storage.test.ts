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
