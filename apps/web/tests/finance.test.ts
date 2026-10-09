import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import {
  WorkspaceDB,
  exportWorkspace,
  importWorkspace,
  validateBackup,
} from '../src/lib/storage';
import {
  FinanceRepository,
  validateTransactions,
  monthlyTransactions,
  totals,
  type Transaction,
} from '../src/lib/finance';
const dbs: WorkspaceDB[] = [];
const item = (
  id: string,
  type: Transaction['type'] = 'expense',
  amount = 35000,
  date = '2026-10-01',
): Transaction => ({
  id,
  type,
  title: id,
  category: 'Food',
  date,
  amount,
  createdAt: 1,
});
function setup(server = false) {
  const db = new WorkspaceDB(crypto.randomUUID());
  dbs.push(db);
  return new FinanceRepository(db, server);
}
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const db of dbs) await db.delete();
  dbs.length = 0;
});
it('calculates monthly actuals with explicit direction and date ordering', () => {
  const transactions = [
    item('food'),
    item('pay', 'income', 1000000, '2026-10-05'),
    item('old', 'expense', 50000, '2026-09-30'),
  ];
  const rows = monthlyTransactions(transactions, '2026-10');
  expect(rows.map((t) => t.id)).toEqual(['pay', 'food']);
  expect(totals(rows)).toEqual({
    income: 1000000,
    expense: 35000,
    balance: 965000,
  });
  expect(totals([item('x')]).balance).toBe(-35000);
  for (const invalid of [
    [{ ...item('x'), amount: 0 }],
    [{ ...item('x'), amount: 1.1 }],
    [{ ...item('x'), date: '2026-02-29' }],
    [{ ...item('x'), category: '  ' }],
    [item('x'), item('x')],
  ])
    expect(() => validateTransactions(invalid)).toThrow();
});
it('preserves guest transactions in backups and rejects stale or malformed imports atomically', async () => {
  const source = setup(),
    target = setup();
  const initial = await source.list();
  await source.write(initial, [item('source')]);
  await expect(source.write(initial, [])).rejects.toThrow('another tab');
  const backup = await exportWorkspace(source.db);
  expect(backup.version).toBe(6);
  await importWorkspace(target.db, backup);
  const imported = (await target.list()).items;
  expect(imported[0]).toMatchObject({ title: 'source', amount: 35000 });
  expect(imported[0].id).not.toBe('source');
  await expect(
    importWorkspace(target.db, {
      ...backup,
      transactions: [{ ...item('bad'), amount: -1 }],
    }),
  ).rejects.toThrow();
  expect((await target.list()).items).toHaveLength(1);
  expect(() =>
    validateBackup({ ...backup, version: 4, transactions: undefined }),
  ).not.toThrow();
  const account = setup();
  await account.db.delete();
  expect((await source.list()).items).toHaveLength(1);
});
it('retains newer acknowledged account transactions when a delayed read arrives', async () => {
  const repo = setup(true);
  const old = { revision: 1, items: [item('first')] },
    saved = { revision: 2, items: [item('first'), item('second')] };
  await repo.db.meta.put({ key: 'finance', value: old });
  let release!: (response: Response) => void;
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () => new Promise<Response>((resolve) => (release = resolve)),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify(saved)));
  vi.stubGlobal('fetch', fetcher);
  const read = repo.list();
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  await repo.write(old, saved.items);
  release(new Response(JSON.stringify(old)));
  expect((await read).revision).toBe(2);
  expect((await repo.list(false)).items).toHaveLength(2);
});

it('allows an omitted description while retaining required category and amount', () => {
  expect(() =>
    validateTransactions([
      {
        id: 'optional',
        type: 'expense',
        title: '',
        category: 'Food',
        date: '2026-10-09',
        amount: 12000,
        createdAt: 1,
      },
    ]),
  ).not.toThrow();
});
