import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import {
  WorkspaceDB,
  exportWorkspace,
  importWorkspace,
} from '../src/lib/storage';
import {
  TasksRepository,
  moveTasks,
  readTaskState,
  visibleTasks,
  validateTasks,
  type Task,
} from '../src/lib/tasks';
const dbs: WorkspaceDB[] = [];
const task = (id: string, date = ''): Task => ({
  id,
  title: id,
  date,
  amount: 0,
  done: false,
  archived: false,
  createdAt: 1,
});
function setup(server = false) {
  const db = new WorkspaceDB(crypto.randomUUID());
  dbs.push(db);
  return new TasksRepository(db, server);
}
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const db of dbs) await db.delete();
  dbs.length = 0;
});
it('sorts dates ascending and moves selected groups without changing archived order', () => {
  const items = [
    task('a'),
    task('d1', '2026-10-30'),
    task('b'),
    task('d2', '2026-10-01'),
    task('c'),
    { ...task('archive'), archived: true },
  ];
  expect(visibleTasks(items).map((t) => t.id)).toEqual([
    'd2',
    'd1',
    'a',
    'b',
    'c',
  ]);
  const moved = moveTasks(items, new Set(['a', 'b']), 'c', true);
  expect(visibleTasks(moved).map((t) => t.id)).toEqual([
    'd2',
    'd1',
    'c',
    'a',
    'b',
  ]);
  const mixed = moveTasks(items, new Set(['d1', 'a']), 'c', true);
  expect(visibleTasks(mixed).map((t) => t.id)).toEqual([
    'd2',
    'd1',
    'b',
    'c',
    'a',
  ]);
  expect(visibleTasks(mixed, true).map((t) => t.id)).toEqual(['archive']);
});
it('migrates local tasks, persists archives and refuses stale writes', async () => {
  const repo = setup();
  await repo.db.meta.put({
    key: 'tasks',
    value: [{ id: 'old', title: 'Legacy', done: true, createdAt: 1 }],
  });
  const old = await repo.list();
  expect(old.items[0]).toMatchObject({ date: '', amount: 0, archived: false });
  await repo.write(old, [{ ...old.items[0], archived: true }]);
  await expect(repo.write(old, [])).rejects.toThrow('another tab');
  expect((await repo.list()).items[0].archived).toBe(true);
  const backup = await exportWorkspace(repo.db);
  const target = setup();
  await importWorkspace(target.db, backup);
  expect((await target.list()).items[0]).toMatchObject({
    title: 'Legacy',
    archived: true,
    done: true,
  });
  expect((await target.list()).items[0].id).not.toBe('old');
  await expect(
    importWorkspace(target.db, {
      ...backup,
      tasks: [{ ...task('bad'), date: '2026-02-29' }],
    }),
  ).rejects.toThrow();
  expect((await target.list()).items).toHaveLength(1);
});
it('validates dates, duplicate IDs, amounts and list limits', () => {
  expect(() => validateTasks([task('valid', '2028-02-29')])).not.toThrow();
  for (const items of [
    [task('x', '2026-02-29')],
    [task('x', '2026-13-01')],
    [task('x'), task('x')],
    [{ ...task('x'), amount: -1 }],
    [{ ...task('x'), amount: 1.2 }],
  ])
    expect(() => validateTasks(items)).toThrow();
  expect(() => readTaskState({ revision: -1, items: [] })).toThrow();
});
it('migrates account-local tasks only after server acceptance and preserves guest data', async () => {
  const guest = setup(),
    account = setup(true);
  await guest.write(await guest.list(), [task('private')]);
  await account.db.meta.put({ key: 'tasks', value: [task('existing')] });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ revision: 2, items: [] })),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Conflict' }), { status: 409 }),
    );
  vi.stubGlobal('fetch', fetcher);
  await expect(account.list()).rejects.toThrow('Conflict');
  expect(Array.isArray((await account.db.meta.get('tasks'))?.value)).toBe(true);
  fetcher
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ revision: 3, items: [] })),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ revision: 4, items: [task('existing')] })),
    );
  expect((await account.list()).revision).toBe(4);
  expect(JSON.stringify(fetcher.mock.calls)).not.toContain('private');
  await account.db.delete();
  expect((await guest.list()).items.map((t) => t.id)).toEqual(['private']);
});

it('keeps acknowledged task changes when an older background read arrives late', async () => {
  const repo = setup(true);
  const initial = { revision: 1, items: [task('first')] };
  const updated = { revision: 2, items: [task('first'), task('second')] };
  await repo.db.meta.put({ key: 'tasks', value: initial });
  let release!: (value: Response) => void;
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () => new Promise<Response>((resolve) => (release = resolve)),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify(updated)));
  vi.stubGlobal('fetch', fetcher);
  const refresh = repo.list();
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  await repo.write(initial, updated.items);
  release(new Response(JSON.stringify(initial)));
  expect((await refresh).revision).toBe(2);
  expect((await repo.list(false)).items.map((t) => t.id)).toEqual([
    'first',
    'second',
  ]);
});
