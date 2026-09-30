export type Point = [number, number];
export type Erasure = [number, number, number];
export type ShapeType =
  | 'pen'
  | 'text'
  | 'rect'
  | 'ellipse'
  | 'parallelogram'
  | 'diamond'
  | 'triangle'
  | 'arrow';
export interface Shape {
  id: string;
  type: ShapeType;
  points: Point[];
  color: string;
  width: number;
  angle: number;
  text: string;
  fontSize: number;
  erased: Erasure[];
}
export interface Scene {
  version: 1;
  shapes: Shape[];
}
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const emptyScene = (): Scene => ({ version: 1, shapes: [] });
export const MAX_BYTES = 2_000_000;
export const shapeTypes = [
  'pen',
  'text',
  'rect',
  'ellipse',
  'parallelogram',
  'diamond',
  'triangle',
  'arrow',
] as const;
const finite = (n: unknown, max = 1_000_000): n is number =>
  typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= max;
export function parseScene(body: string): Scene {
  if (new TextEncoder().encode(body).length > MAX_BYTES)
    throw Error('Drawing exceeds the 2 MB limit');
  const scene = JSON.parse(body) as Scene;
  if (
    scene?.version !== 1 ||
    !Array.isArray(scene.shapes) ||
    scene.shapes.length > 2000
  )
    throw Error('Invalid drawing');
  const ids = new Set<string>();
  let points = 0;
  for (const s of scene.shapes) {
    if (
      !s ||
      typeof s.id !== 'string' ||
      !/^[a-zA-Z0-9-]{1,64}$/.test(s.id) ||
      ids.has(s.id) ||
      !shapeTypes.includes(s.type) ||
      !/^#[a-fA-F0-9]{6}$/.test(s.color) ||
      !finite(s.width, 32) ||
      s.width < 1 ||
      !finite(s.angle, 360000) ||
      !finite(s.fontSize, 1000) ||
      s.fontSize < 8 ||
      typeof s.text !== 'string' ||
      s.text.length > 10000 ||
      !Array.isArray(s.points) ||
      !s.points.length ||
      (s.type !== 'pen' && s.points.length !== (s.type === 'text' ? 1 : 2)) ||
      !s.points.every(
        (p) => Array.isArray(p) && p.length === 2 && p.every((n) => finite(n)),
      ) ||
      !Array.isArray(s.erased) ||
      !s.erased.every(
        (p) =>
          Array.isArray(p) &&
          p.length === 3 &&
          p.every((n) => finite(n)) &&
          p[2] > 0 &&
          p[2] <= 10000,
      )
    )
      throw Error('Invalid drawing object');
    points += s.points.length + s.erased.length;
    if (points > 100000) throw Error('Drawing exceeds the 100,000-point limit');
    ids.add(s.id);
  }
  return scene;
}
export function bounds(s: Shape): Box {
  const xs = s.points.map((p) => p[0]),
    ys = s.points.map((p) => p[1]);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  if (s.type === 'text')
    return {
      x,
      y: y - s.fontSize,
      w: Math.max(
        30,
        ...s.text.split('\n').map((t) => t.length * s.fontSize * 0.65),
      ),
      h: Math.max(28, s.text.split('\n').length * s.fontSize * 1.2),
    };
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
export const center = (b: Box): Point => [b.x + b.w / 2, b.y + b.h / 2];
export function turn(p: Point, c: Point, angle: number): Point {
  const a = (angle * Math.PI) / 180,
    dx = p[0] - c[0],
    dy = p[1] - c[1];
  return [
    c[0] + dx * Math.cos(a) - dy * Math.sin(a),
    c[1] + dx * Math.sin(a) + dy * Math.cos(a),
  ];
}
export function visualBounds(s: Shape): Box {
  const b = bounds(s),
    c = center(b);
  const ps: Point[] = [
    [b.x, b.y],
    [b.x + b.w, b.y],
    [b.x, b.y + b.h],
    [b.x + b.w, b.y + b.h],
  ];
  const transformed = ps.map((p) => turn(p, c, s.angle));
  return union(transformed.map((p) => ({ x: p[0], y: p[1], w: 0, h: 0 })));
}
export function union(boxes: Box[]): Box {
  if (!boxes.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...boxes.map((b) => b.x)),
    y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...boxes.map((b) => b.x + b.w)) - x,
    h: Math.max(...boxes.map((b) => b.y + b.h)) - y,
  };
}
export function translate(s: Shape, dx: number, dy: number): Shape {
  return {
    ...s,
    points: s.points.map((p) => [p[0] + dx, p[1] + dy]),
    erased: s.erased.map((p) => [p[0] + dx, p[1] + dy, p[2]]),
  };
}
export function rotateGroup(
  shapes: Shape[],
  origin: Point,
  degrees: number,
): Shape[] {
  return shapes.map((s) => {
    const c = center(bounds(s)),
      next = turn(c, origin, degrees);
    return {
      ...translate(s, next[0] - c[0], next[1] - c[1]),
      angle: (s.angle + degrees) % 360,
    };
  });
}
export function resize(s: Shape, corner: number, world: Point): Shape {
  const b = bounds(s),
    c = center(b),
    p = turn(world, c, -s.angle),
    left = corner % 2 === 0,
    top = corner < 2;
  const anchor: Point = [left ? b.x + b.w : b.x, top ? b.y + b.h : b.y];
  let sx = Math.max(
    0.05,
    (left ? anchor[0] - p[0] : p[0] - anchor[0]) / Math.max(1, b.w),
  );
  let sy = Math.max(
    0.05,
    (top ? anchor[1] - p[1] : p[1] - anchor[1]) / Math.max(1, b.h),
  );
  if (s.type === 'text')
    sx = sy = Math.min(1000 / s.fontSize, Math.max(sx, sy, 8 / s.fontSize));
  const scaled = (p: Point): Point => [
    anchor[0] + (p[0] - anchor[0]) * sx,
    anchor[1] + (p[1] - anchor[1]) * sy,
  ];
  const next: Shape = {
    ...s,
    points: s.points.map(scaled),
    fontSize: s.type === 'text' ? s.fontSize * sx : s.fontSize,
    erased: s.erased.map((p) => [
      ...scaled([p[0], p[1]]),
      p[2] * Math.sqrt(sx * sy),
    ]),
  };
  const nc = center(bounds(next)),
    wc = turn(nc, c, s.angle);
  return translate(next, wc[0] - nc[0], wc[1] - nc[1]);
}
export function moveEndpoint(s: Shape, index: number, p: Point): Shape {
  const c = center(bounds(s));
  const next: Shape = {
    ...s,
    angle: 0,
    points: s.points.map((q) => turn(q, c, s.angle)),
    erased: s.erased.map((q) => [...turn([q[0], q[1]], c, s.angle), q[2]]),
  };
  next.points[index] = p;
  return next;
}
export function erase(s: Shape, p: Point, radius: number): void {
  const b = bounds(s),
    q = turn(p, center(b), -s.angle);
  if (
    q[0] + radius >= b.x &&
    q[0] - radius <= b.x + b.w &&
    q[1] + radius >= b.y &&
    q[1] - radius <= b.y + b.h
  )
    s.erased.push([q[0], q[1], radius]);
}
export function escape(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
}
