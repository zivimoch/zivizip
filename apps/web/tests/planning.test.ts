import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import {
  WorkspaceDB,
  exportWorkspace,
  importWorkspace,
} from '../src/lib/storage';
import {
  PlanningRepository,
  copyMonth,
  monthBudgets,
  monthSummary,
  groupSummary,
  mergePlanning,
  moveBudgets,
  validatePlanning,
  type Budget,
  type PlanningData,
} from '../src/lib/planning';
import type { Transaction } from '../src/lib/finance';
const dbs: WorkspaceDB[] = [];
const budget = (
  id: string,
  group: Budget['group'],
  amount: number,
): Budget => ({
  id,
  category: id,
  group,
  amount,
  month: '2026-10',
  note: '',
  enabled: true,
  automatic: false,
});
const transaction = (
  category: string,
  type: Transaction['type'],
  amount: number,
): Transaction => ({
  id: crypto.randomUUID(),
  category,
  type,
  amount,
  title: category,
  date: '2026-10-02',
  createdAt: 1,
});
const data = (): PlanningData => ({
  months: [{ month: '2026-10', opening: 100 }],
  items: [
    budget('Salary', 'income', 1000),
    budget('Food', 'recurring', 300),
    budget('Travel', 'monthly', 200),
  ],
});
function setup(server = false) {
  const db = new WorkspaceDB(crypto.randomUUID());
  dbs.push(db);
  return new PlanningRepository(db, server);
}
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const db of dbs) await db.delete();
  dbs.length = 0;
});
it('matches monthly categories case-insensitively and accounts for partial, excess and unexpected expenses', () => {
  const plans = data(),
    tx = [
      transaction(' salary ', 'income', 1000),
      transaction('food', 'expense', 400),
      transaction('Travel', 'expense', 50),
      transaction('Health', 'expense', 75),
    ];
  const rows = monthBudgets(plans, tx, '2026-10');
  expect(rows).toHaveLength(4);
  expect(rows[3]).toMatchObject({
    category: 'Health',
    automatic: true,
    amount: 0,
    group: 'monthly',
  });
  expect(monthSummary(plans, tx, '2026-10')).toEqual({
    opening: 100,
    planned: 600,
    projected: 425,
    current: 575,
  });
  expect(
    groupSummary(
      rows.filter((row) => row.group === 'monthly'),
      tx,
    ),
  ).toMatchObject({ count: 2, realized: 1, used: 125, left: 75 });
  expect(monthBudgets(plans, [], '2026-11')).toEqual([]);
  plans.items[1].enabled = false;
  expect(monthSummary(plans, tx, '2026-10')).toEqual({
    opening: 100,
    planned: 900,
    projected: 825,
    current: 575,
  });
  expect(
    groupSummary(
      monthBudgets(plans, tx, '2026-10').filter(
        (row) => row.group === 'recurring',
      ),
      tx,
    ).count,
  ).toBe(0);
  expect(monthBudgets(plans, tx.slice(0, 3), '2026-10')).toHaveLength(3);
});
it('copies expected recurring and income values without monthly amounts, actuals, automatic entries or opening balance', () => {
  const plans = data();
  plans.items.push({ ...budget('Unexpected', 'monthly', 0), automatic: true });
  const copied = copyMonth(plans, '2026-10', '2026-11');
  expect(copied.months[1]).toEqual({ month: '2026-11', opening: 0 });
  expect(
    copied.items.filter((p) => p.month === '2026-11').map((p) => p.amount),
  ).toEqual([1000, 300, 0]);
  expect(copied.items[4].id).not.toBe(plans.items[0].id);
  expect(
    monthSummary(copied, [transaction('Food', 'expense', 400)], '2026-11')
      .current,
  ).toBe(0);
  expect(copyMonth(copied, '2026-10', '2026-11')).toEqual(copied);
  expect(
    copyMonth({ months: [], items: [] }, '', '2027-01').months,
  ).toHaveLength(1);
});
it('rejects duplicate expense categories across cards and reorders selected rows only within their group', () => {
  const plans = data();
  plans.items.push({
    ...budget('duplicate', 'monthly', 5),
    category: ' FOOD ',
  });
  expect(() => validatePlanning(plans)).toThrow('already');
  plans.items.pop();
  plans.items.push(
    budget('Rent', 'recurring', 500),
    budget('Utilities', 'recurring', 100),
  );
  const order = moveBudgets(
    plans.items,
    new Set(['Food', 'Rent']),
    'Utilities',
    true,
  );
  expect(order.map((p) => p.id)).toEqual([
    'Salary',
    'Utilities',
    'Travel',
    'Food',
    'Rent',
  ]);
  expect(mergePlanning(data(), data()).items).toHaveLength(3);
});
it('preserves plans in backups, merges without overwriting budgets and rejects stale guest writes', async () => {
  const source = setup(),
    target = setup(),
    initial = await source.list();
  await source.write(initial, data());
  await expect(source.write(initial, data())).rejects.toThrow('another tab');
  const backup = await exportWorkspace(source.db);
  expect(backup.version).toBe(6);
  expect(backup.planning?.items).toHaveLength(3);
  await importWorkspace(target.db, backup);
  expect((await target.list()).items[0].id).not.toBe('Salary');
  const first = await target.list();
  first.items[0].amount = 2000;
  first.months[0].opening = 600;
  await target.write(first, first);
  await importWorkspace(target.db, backup);
  const merged = await target.list();
  expect(merged.items).toHaveLength(3);
  expect(merged.items[0].amount).toBe(2000);
  expect(merged.months[0].opening).toBe(600);
  await expect(
    importWorkspace(target.db, {
      ...backup,
      planning: { ...data(), months: [{ month: '2026-13', opening: 0 }] },
    }),
  ).rejects.toThrow();
  expect((await target.list()).revision).toBe(merged.revision);
});
it('does not let delayed server reads replace newer acknowledged plans', async () => {
  const repo = setup(true),
    old = { ...data(), revision: 1 },
    saved = { ...data(), revision: 2 };
  saved.items[0].amount = 1500;
  await repo.db.meta.put({ key: 'planning', value: old });
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
  await repo.write(old, saved);
  release(new Response(JSON.stringify(old)));
  expect((await read).items[0].amount).toBe(1500);
  expect((await repo.list(false)).revision).toBe(2);
});
