import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import {
  WorkspaceDB,
  exportWorkspace,
  importWorkspace,
} from '../src/lib/storage';
import {
  GoalsRepository,
  emptyGoals,
  goalTotals,
  validateGoals,
  type Goal,
} from '../src/lib/goals';
const goal: Goal = {
  id: 'goal',
  title: 'Explore',
  description: 'Travel further',
  cover: 'lake',
  tasks: ['task'],
  expenses: ['expense'],
};
it('preserves exclusive assignments and derives totals only from completed tasks and expenses', () => {
  expect(() => validateGoals([goal, { ...goal, id: 'other' }])).toThrow();
  expect(() =>
    validateGoals([{ ...goal, cover: 'https://invalid.test' }]),
  ).toThrow();
  const task = {
    id: 'task',
    title: 'Book',
    done: true,
    archived: true,
    date: '',
    amount: 0,
    createdAt: 1,
  };
  const tx = {
    id: 'expense',
    title: 'Train',
    category: 'Travel',
    type: 'expense' as const,
    date: '2026-10-01',
    amount: 100,
    createdAt: 1,
  };
  expect(goalTotals(goal, [task], [tx])).toEqual({ tasks: 1, amount: 100 });
  expect(
    goalTotals(goal, [{ ...task, done: false }], [{ ...tx, type: 'income' }]),
  ).toEqual({ tasks: 0, amount: 0 });
  expect(goalTotals(goal, [], [])).toEqual({ tasks: 0, amount: 0 });
});
it('rejects stale goal writes and remaps links when importing backups', async () => {
  const db = new WorkspaceDB(crypto.randomUUID()),
    target = new WorkspaceDB(crypto.randomUUID());
  try {
    const repo = new GoalsRepository(db, false);
    await repo.write(emptyGoals(), [goal]);
    await expect(repo.write(emptyGoals(), [])).rejects.toThrow('another tab');
    await db.meta.put({
      key: 'tasks',
      value: {
        revision: 1,
        items: [
          {
            id: 'task',
            title: 'Book',
            done: true,
            archived: true,
            date: '',
            amount: 0,
            createdAt: 1,
          },
        ],
      },
    });
    await db.meta.put({
      key: 'finance',
      value: {
        revision: 1,
        items: [
          {
            id: 'expense',
            title: 'Train',
            category: 'Travel',
            type: 'expense',
            date: '2026-10-01',
            amount: 100,
            createdAt: 1,
          },
        ],
      },
    });
    const backup = await exportWorkspace(db);
    await importWorkspace(target, backup);
    const restored = await exportWorkspace(target);
    expect(restored.goals?.[0].id).not.toBe(goal.id);
    expect(restored.goals?.[0].tasks).toEqual([restored.tasks?.[0].id]);
    expect(restored.goals?.[0].expenses).toEqual([
      restored.transactions?.[0].id,
    ]);
    await importWorkspace(target, backup);
    expect((await exportWorkspace(target)).goals).toHaveLength(2);
  } finally {
    await db.delete();
    await target.delete();
  }
});
