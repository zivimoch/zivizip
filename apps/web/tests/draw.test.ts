import { describe, expect, it } from 'vitest';
import {
  bounds,
  center,
  erase,
  moveEndpoint,
  parseScene,
  resize,
  rotateGroup,
  turn,
  type Shape,
} from '../src/lib/draw/scene';
const shape = (overrides: Partial<Shape> = {}): Shape => ({
  id: 'shape-1',
  type: 'rect',
  points: [
    [10, 20],
    [110, 100],
  ],
  color: '#17c5d5',
  width: 4,
  angle: 0,
  text: '',
  fontSize: 24,
  erased: [],
  ...overrides,
});
describe('draw document boundaries', () => {
  it('rejects unsafe attributes, duplicate IDs and oversized geometry', () => {
    const s = shape();
    expect(
      parseScene(JSON.stringify({ version: 1, shapes: [s] })).shapes,
    ).toHaveLength(1);
    for (const shapes of [
      [s, s],
      [shape({ color: 'url(https://example.com)' })],
      [
        shape({
          points: [
            [Infinity, 0],
            [0, 0],
          ],
        }),
      ],
      [
        shape({
          type: 'text',
          points: [
            [0, 0],
            [1, 1],
          ],
        }),
      ],
    ])
      expect(() =>
        parseScene(JSON.stringify({ version: 1, shapes })),
      ).toThrow();
  });
  it('keeps the opposite rotated corner fixed during resizing', () => {
    const s = shape({ angle: 45 }),
      b = bounds(s),
      c = center(b),
      fixed = turn([b.x, b.y], c, s.angle);
    const next = resize(s, 3, turn([b.x + b.w * 2, b.y + b.h * 2], c, s.angle)),
      nb = bounds(next),
      anchor = turn([nb.x, nb.y], center(nb), next.angle);
    expect(anchor[0]).toBeCloseTo(fixed[0]);
    expect(anchor[1]).toBeCloseTo(fixed[1]);
    expect(nb.w).toBeCloseTo(b.w * 2);
  });
  it('moves an arrow endpoint without moving the other after rotation', () => {
    const s = shape({ type: 'arrow', angle: 72 }),
      fixed = turn(s.points[1], center(bounds(s)), s.angle),
      next = moveEndpoint(s, 0, [-100, 250]);
    expect(next.points[0]).toEqual([-100, 250]);
    expect(next.points[1]).toEqual(fixed);
    expect(next.angle).toBe(0);
  });
  it('erases in local coordinates and carries erasures through group rotation', () => {
    const s = shape({ angle: 90 });
    const p = turn([10, 40], center(bounds(s)), 90);
    erase(s, p, 8);
    expect(s.erased[0][0]).toBeCloseTo(10);
    expect(s.erased[0][1]).toBeCloseTo(40);
    const originalCenter = center(bounds(s));
    const next = rotateGroup([s], [0, 0], 90)[0];
    const expected = turn(originalCenter, [0, 0], 90);
    expect(center(bounds(next))[0]).toBeCloseTo(expected[0]);
    expect(next.angle).toBe(180);
    expect(next.erased).toHaveLength(1);
  });
});
