import {
  bounds,
  center,
  turn,
  union,
  escape,
  type Shape,
  type Point,
} from './scene';
const textMeasure = document.createElement('canvas').getContext('2d');
function textMarkup(
  text: string,
  x: number,
  y: number,
  center = false,
  size = 24,
) {
  return `<text x="${x}" y="${y}" text-anchor="${center ? 'middle' : 'start'}" fill="currentColor" font-size="${size}" font-family="sans-serif">${String(
    text || '',
  )
    .split('\n')
    .map(
      (line, i) =>
        `<tspan x="${x}" dy="${i ? size * 1.2 : 0}">${escape(line) || ' '}</tspan>`,
    )
    .join('')}</text>`;
}
export function shapeMarkup(s: Shape) {
  const a = s.points[0],
    b = s.points.at(-1)!,
    r = bounds(s),
    common = `stroke="${s.color}" stroke-width="${s.width}" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  let body = '';
  if (s.type === 'pen')
    body = `<polyline points="${s.points.map((p) => p.join(',')).join(' ')}" ${common}/>`;
  if (s.type === 'rect')
    body = `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" ${common}/>`;
  if (s.type === 'ellipse')
    body = `<ellipse cx="${r.x + r.w / 2}" cy="${r.y + r.h / 2}" rx="${r.w / 2}" ry="${r.h / 2}" ${common}/>`;
  const vertices: Partial<Record<Shape['type'], Point[]>> = {
    parallelogram: [
      [r.x + r.w * 0.22, r.y],
      [r.x + r.w, r.y],
      [r.x + r.w * 0.78, r.y + r.h],
      [r.x, r.y + r.h],
    ],
    diamond: [
      [r.x + r.w / 2, r.y],
      [r.x + r.w, r.y + r.h / 2],
      [r.x + r.w / 2, r.y + r.h],
      [r.x, r.y + r.h / 2],
    ],
    triangle: [
      [r.x + r.w / 2, r.y],
      [r.x + r.w, r.y + r.h],
      [r.x, r.y + r.h],
    ],
  };
  if (vertices[s.type])
    body = `<polygon points="${vertices[s.type]!.map((p) => p.join(',')).join(' ')}" ${common}/>`;
  if (s.type === 'arrow') {
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]),
      head = [-0.5, 0.5].map((d) => [
        b[0] - 20 * Math.cos(angle + d),
        b[1] - 20 * Math.sin(angle + d),
      ]);
    body = `<path d="M${a} L${b} M${head[0]} L${b} L${head[1]}" ${common}/>`;
  }
  if (s.type === 'text')
    body = textMarkup(s.text, a[0], a[1], false, s.fontSize || 24);
  else if (s.text) {
    const lines = s.text.split('\n'),
      size = 24,
      cx = r.x + r.w / 2,
      baseline = r.y + r.h / 2 + 8 - (lines.length - 1) * size * 0.6;
    textMeasure!.font = '24px sans-serif';
    const holes = lines
      .map((line, i) => {
        const w = textMeasure!.measureText(line).width;
        return `<rect x="${cx - w / 2 - 7}" y="${baseline + i * size * 1.2 - size}" width="${w + 14}" height="${size * 1.2}" fill="black"/>`;
      })
      .join('');
    body = `<defs><mask id="label-${s.id}" maskUnits="userSpaceOnUse" x="${r.x - 100}" y="${r.y - 100}" width="${r.w + 200}" height="${r.h + 200}"><rect x="${r.x - 100}" y="${r.y - 100}" width="${r.w + 200}" height="${r.h + 200}" fill="white"/>${holes}</mask></defs><g mask="url(#label-${s.id})">${body}</g>${textMarkup(s.text, cx, baseline, true)}`;
  }
  let mask = '';
  if (s.erased?.length) {
    mask = `<defs><mask id="m${s.id}" maskUnits="userSpaceOnUse" x="${r.x - 100}" y="${r.y - 100}" width="${r.w + 200}" height="${r.h + 200}"><rect x="${r.x - 100}" y="${r.y - 100}" width="${r.w + 200}" height="${r.h + 200}" fill="white"/>${s.erased.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="${p[2]}" fill="black"/>`).join('')}</mask></defs>`;
  }
  return `${mask}<g data-shape="${s.id}" style="color:${s.color}" transform="rotate(${s.angle || 0} ${r.x + r.w / 2} ${r.y + r.h / 2})" ${mask ? `mask="url(#m${s.id})"` : ''}>${body}</g>`;
}

// Export bounds include labels that intentionally extend beyond their shape.
export function contentBounds(s: Shape) {
  const b = bounds(s);
  let area = b;
  if (s.text) {
    const size = s.type === 'text' ? s.fontSize : 24;
    textMeasure!.font = `${size}px sans-serif`;
    const lines = s.text.split('\n');
    const width = Math.max(
      ...lines.map((line) => textMeasure!.measureText(line).width),
    );
    const textBox =
      s.type === 'text'
        ? { x: b.x, y: b.y, w: width, h: lines.length * size * 1.2 }
        : {
            x: b.x + b.w / 2 - width / 2,
            y: b.y + b.h / 2 + 8 - (lines.length - 1) * size * 0.6 - size,
            w: width,
            h: lines.length * size * 1.2,
          };
    area = union([b, textBox]);
  }
  const ps: Point[] = [
    [area.x, area.y],
    [area.x + area.w, area.y],
    [area.x, area.y + area.h],
    [area.x + area.w, area.y + area.h],
  ];
  return union(
    ps.map((p) => {
      const q = turn(p, center(b), s.angle);
      return { x: q[0], y: q[1], w: 0, h: 0 };
    }),
  );
}
