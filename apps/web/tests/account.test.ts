import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { AccountNotes, api } from '../src/lib/account';
import { WorkspaceDB } from '../src/lib/storage';
const dbs: WorkspaceDB[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const db of dbs) await db.delete();
  dbs.length = 0;
});
it('does not restore private cache from a late response after logout', async () => {
  const db = new WorkspaceDB(crypto.randomUUID());
  dbs.push(db);
  const repo = new AccountNotes(db);
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>((resolve) => (finish = resolve))),
  );
  const pending = repo.list();
  repo.deactivate();
  await db.notes.clear();
  finish(
    new Response(
      JSON.stringify([
        {
          id: crypto.randomUUID(),
          name: 'Private',
          category: 'General',
          icon: 'note',
          body: 'Owner only',
          revision: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      ]),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
  );
  await expect(pending).rejects.toThrow('Workspace changed');
  expect(await db.notes.count()).toBe(0);
});

it('accepts a successful empty response from the interest form', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 201 })),
  );
  await expect(
    api('/registration-interest', 'POST', {
      email: 'test@example.invalid',
      message: 'Notes',
    }),
  ).resolves.toBeUndefined();
});
