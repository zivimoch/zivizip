import { expect, it } from 'vitest';
import { goalWorld, REGION_CAPACITY } from '../src/lib/goal-world';
import { readGoalState, remapGoals, validateGoals } from '../src/lib/goals';
it('generates stable, distinct geography and a visible step for every contribution', () => {
  expect(goalWorld('island-a', 65)).toEqual(goalWorld('island-a', 65));
  expect(goalWorld('island-a', 65)).not.toEqual(goalWorld('island-b', 65));
  expect(goalWorld('island-a', 1).active?.outline).toEqual(
    goalWorld('island-a', 31).active?.outline,
  );
  for (const count of [1, 32, REGION_CAPACITY, 1000, 1000000]) {
    const before = goalWorld('island-a', count),
      after = goalWorld('island-a', count + 1);
    expect(before).not.toEqual(after);
    expect(after.islands.length).toBeLessThanOrEqual(7);
    expect(
      after.islands.reduce((n, i) => n + i.objects.length, 0),
    ).toBeLessThanOrEqual(REGION_CAPACITY);
  }
  expect(goalWorld('island-a', 0).islands).toEqual([]);
  expect(goalWorld('island-a', 1000000, 0).islands).toEqual(
    goalWorld('island-a', REGION_CAPACITY).islands,
  );
});
it('preserves legacy geography and completion when importing under new IDs', () => {
  const legacy = {
    id: 'legacy',
    title: 'Explore',
    description: '',
    cover: '',
    tasks: [],
    expenses: [],
  };
  expect(readGoalState({ revision: 0, items: [legacy] }).items[0]).toEqual(
    legacy,
  );
  const imported = remapGoals(
    [{ ...legacy, completed: true }],
    new Map(),
    new Map(),
  )[0];
  expect(imported.seed).toBe(legacy.id);
  expect(imported.completed).toBe(true);
  expect(remapGoals([imported], new Map(), new Map())[0].seed).toBe(legacy.id);
  expect(() => validateGoals([{ ...legacy, seed: '<invalid>' }])).toThrow();
  expect(() =>
    validateGoals([{ ...legacy, completed: 'true' as unknown as boolean }]),
  ).toThrow();
});
