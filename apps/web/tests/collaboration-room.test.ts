import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkspaceDB, type Note } from '../src/lib/storage';
import { Y, write, encode } from '../src/lib/collaboration/document';
import { Room } from '../src/lib/collaboration/room';
const api = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/account', () => ({
  api,
  ApiError: class extends Error {
    status = 500;
  },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  api.mockReset();
});
it('does not recreate the account cache after workspace invalidation during a poll', async () => {
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('navigator', { onLine: true });
  const db = new WorkspaceDB(`room-${crypto.randomUUID()}`);
  const note: Note = {
    id: 'n',
    name: 'Note',
    category: 'General',
    icon: 'note',
    body: 'Private',
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
  };
  const doc = new Y.Doc();
  write(doc, note);
  let release!: (value: unknown) => void;
  api.mockImplementation(() => new Promise((resolve) => (release = resolve)));
  let valid = true;
  const change = vi.fn();
  const room = new Room(
    note,
    '/notes/n/sync',
    db,
    change,
    () => {},
    () => {},
    () => valid,
  );
  await vi.waitFor(() => expect(api).toHaveBeenCalledOnce());
  valid = false;
  await db.delete();
  release({
    metadata: note,
    editable: true,
    state: encode(Y.encodeStateAsUpdate(doc)),
    vector: encode(Y.encodeStateVector(doc)),
  });
  await room.flush();
  expect(change).not.toHaveBeenCalled();
  expect(await WorkspaceDB.exists(db.name)).toBe(false);
  room.close();
  doc.destroy();
});
