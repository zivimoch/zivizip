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

import { dna, worldScene, WORLD_CHUNK } from '../src/lib/world-dna';
it('generates diverse DNA, stable addressable objects and bounded detail at high counts', () => {
  const seeds = Array.from({ length: 100 }, (_, i) => 'seed-' + i);
  expect(new Set(seeds.map((s) => dna(s).plant)).size).toBe(6);
  expect(new Set(seeds.map((s) => dna(s).climate)).size).toBe(4);
  for (const theme of ['island', 'garden', 'space'] as const) {
    const small = worldScene('dna', theme, 256, 0, 'card');
    const large = worldScene('dna', theme, 256, 0, 'detail', 1000);
    expect(small.objects.length).toBeLessThanOrEqual(24);
    expect(large.objects.length).toBeLessThanOrEqual(128);
    expect(large.objects.length).toBeGreaterThan(small.objects.length);
    for (const obj of small.objects)
      expect(large.objects.find((o) => o.id === obj.id)).toEqual(obj);
    expect(
      worldScene('dna', theme, 1000000, 0, 'detail', 1000).objects,
    ).toEqual(large.objects);
    for (const count of [
      1,
      23,
      24,
      25,
      255,
      256,
      257,
      1000000,
      Number.MAX_SAFE_INTEGER,
    ]) {
      const world = worldScene('dna', theme, count, undefined, 'card');
      expect(world.objects.length).toBeLessThanOrEqual(24);
      expect(world.objects.some((o) => o.id === world.steps - 1)).toBe(true);
      expect(world.genes).toEqual(dna('dna'));
      expect(worldScene('dna', theme, count, undefined, 'card')).toBe(world);
    }
    expect(
      worldScene('dna', theme, WORLD_CHUNK + 1, undefined, 'card').chunk,
    ).toBe(1);
  }
});
