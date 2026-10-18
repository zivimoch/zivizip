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
  goalKeys,
  validateGoals,
  readGoalState,
  validateSetAside,
  type Goal,
} from '../src/lib/goals';
const goal: Goal = {
  id: 'goal',
  title: 'Explore',
  description: 'Travel further',
  cover: 'lake',
  seed: 'stable-world',
  theme: 'garden',
  generatorVersion: 2,
  order: ['expense:expense', 'task:task'],
  completed: true,
  tasks: ['task'],
  expenses: ['expense'],
};
it('supports shared assignments and derives totals only from completed tasks and expenses', () => {
  expect(() => validateGoals([goal, { ...goal, id: 'other' }])).not.toThrow();
  expect(() => validateGoals([{ ...goal, tasks: ['task', 'task'] }])).toThrow();
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
    await repo.write(emptyGoals(), [goal], ['task:task', 'expense:expense']);
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
    await repo.write(await repo.list(), [goal, { ...goal, id: 'second' }]);
    const backup = await exportWorkspace(db);
    await importWorkspace(target, backup);
    const restored = await exportWorkspace(target);
    expect(restored.goalSetAside).toEqual([
      'task:' + restored.tasks?.[0].id,
      'expense:' + restored.transactions?.[0].id,
    ]);
    expect(restored.goals?.[0].theme).toBe('garden');
    expect(restored.goals?.[0].generatorVersion).toBe(2);
    expect(restored.goals?.[0].order).toEqual([
      'expense:' + restored.transactions?.[0].id,
      'task:' + restored.tasks?.[0].id,
    ]);
    expect(restored.goals?.[0].seed).toBe('stable-world');
    expect(restored.goals?.[0].completed).toBe(true);
    expect(restored.goals?.[0].id).not.toBe(goal.id);
    expect(restored.goals?.[0].tasks).toEqual([restored.tasks?.[0].id]);
    expect(restored.goals?.[0].expenses).toEqual([
      restored.transactions?.[0].id,
    ]);
    expect(restored.goals?.[1].tasks).toEqual(restored.goals?.[0].tasks);
    expect(restored.goals?.[1].expenses).toEqual(restored.goals?.[0].expenses);
    await importWorkspace(target, backup);
    expect((await exportWorkspace(target)).goals).toHaveLength(4);
    await repo.write(await repo.list(), [], ['task:task']);
    const trayOnly = await exportWorkspace(db);
    await importWorkspace(target, trayOnly);
    const withTray = await exportWorkspace(target);
    expect(withTray.goals).toHaveLength(4);
    expect(withTray.goalSetAside).toContain(
      'task:' + withTray.tasks?.at(-1)?.id,
    );
  } finally {
    await db.delete();
    await target.delete();
  }
});

it('validates theme and mixed contribution order', () => {
  expect(goalKeys(goal)).toEqual(['expense:expense', 'task:task']);
  expect(() => validateGoals([{ ...goal, order: ['task:missing'] }])).toThrow();
  expect(() =>
    validateGoals([{ ...goal, order: ['task:task', 'task:task'] }]),
  ).toThrow();
  expect(() =>
    validateGoals([{ ...goal, generatorVersion: 3 as 2 }]),
  ).toThrow();
  expect(() =>
    validateGoals([{ ...goal, theme: 'invalid' as 'garden' }]),
  ).toThrow();
});

it('validates the reversible tray and keeps it through unrelated goal writes', async () => {
  expect(readGoalState({ revision: 0, items: [] }).setAside).toBeUndefined();
  for (const keys of [['task:a', 'task:a'], ['note:a'], ['expense:'], [null]])
    expect(() => validateSetAside(keys)).toThrow();
  const db = new WorkspaceDB(crypto.randomUUID());
  try {
    const repo = new GoalsRepository(db, false);
    const old = emptyGoals();
    const saved = await repo.write(old, [], ['task:archived']);
    await expect(repo.write(old, [], [])).rejects.toThrow('another tab');
    await repo.write(saved, [goal]);
    expect((await repo.list()).setAside).toEqual(['task:archived']);
    await repo.merge([], ['expense:receipt']);
    expect((await repo.list()).setAside).toEqual([
      'task:archived',
      'expense:receipt',
    ]);
    await repo.write(await repo.list(), [], []);
    expect((await repo.list()).setAside).toEqual([]);
  } finally {
    await db.delete();
  }
});
