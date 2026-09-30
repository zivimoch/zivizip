import {
  bounds,
  center,
  erase,
  moveEndpoint,
  parseScene,
  resize,
  rotateGroup,
  translate,
  turn,
  union,
  visualBounds,
  type Point,
  type Box,
  type Scene,
  type Shape,
  type ShapeType,
  type Viewport,
} from './scene';
import { shapeMarkup, contentBounds } from './render';
type Tool = ShapeType | 'select' | 'hand' | 'erase';
interface Options {
  body: string;
  name: string;
  writable: boolean;
  language: 'en' | 'id';
  view?: Viewport;
  change: (body: string) => void;
  viewport: (view: Viewport) => void;
  busy: (busy: boolean) => void;
  error: (error: unknown) => void;
}
interface Gesture {
  kind:
    | 'pan'
    | 'move'
    | 'resize'
    | 'endpoint'
    | 'rotate'
    | 'marquee'
    | 'erase'
    | 'draw';
  start: Point;
  last: Point;
  before: string;
  originals: Shape[];
  base: Set<string>;
  corner: number;
  origin: Point;
  angle: number;
  view: Viewport;
  frame: { box: Box; angle: number } | null;
}
const icons: Record<string, string> = {
  select: 'M4 3l15 9-7 1-3 7z',
  hand: 'M7 12V7m3 5V4m3 8V3m3 10V6M7 10c-4-4-5 0-3 3l5 8h8l3-9',
  pen: 'M4 20l2-6L17 3l4 4L10 18z',
  text: 'M4 4h16M12 4v17M8 21h8',
  erase: 'M3 14l11-11 8 8-11 11H9z',
  rect: 'M3 4h18v16H3z',
  ellipse: 'M22 12a10 8 0 1 1-20 0 10 8 0 1 1 20 0',
  parallelogram: 'M7 4h15l-5 16H2z',
  diamond: 'M12 2l10 10-10 10L2 12z',
  triangle: 'M12 3l10 18H2z',
  arrow: 'M3 20L21 3M10 3h11v11',
  undo: 'M9 5 3 11l6 6M3 11h11a6 6 0 0 1 6 6',
  redo: 'm15 5 6 6-6 6M21 11H10a6 6 0 0 0-6 6',
  delete: 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15',
  rotate: 'M4 9a8 8 0 1 1 0 6M4 3v6h6',
  copy: 'M8 8h13v13H8z M16 8V3H3v13h5',
  export: 'M12 3v12m-5-5 5 5 5-5M3 16v5h18v-5',
  fit: 'M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6',
};
const keys: Record<string, Tool> = {
  s: 'select',
  h: 'hand',
  p: 'pen',
  t: 'text',
  x: 'erase',
  r: 'rect',
  e: 'ellipse',
  a: 'arrow',
};
const icon = (name: string) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name] || icons.text}"/></svg>`;
export function mountEditor(host: HTMLElement, options: Options) {
  let opts = options;
  const t = (en: string, id: string) => (opts.language === 'id' ? id : en);
  let scene = parseScene(opts.body),
    accepted = opts.body;
  const view: Viewport = { x: 0, y: 0, zoom: 1, ...opts.view };
  let tool: Tool = 'select',
    selected = new Set<string>(),
    gesture: Gesture | null = null;
  let draft: Shape | null = null,
    space = false,
    dead = false,
    frame = 0;
  let groupFrame: { box: Box; angle: number } | null = null;
  let history: string[] = [],
    redo: string[] = [];
  let textEdit: {
    input: HTMLTextAreaElement;
    shape: Shape;
    before: string;
    done: HTMLButtonElement;
  } | null = null;
  let lastTap: { time: number; point: Point } | null = null;
  const touches = new Map<number, Point>();
  let pinch: { distance: number; zoom: number; world: Point } | null = null;
  const tools: [Tool, string, string][] = [
    ['select', 'Select', 'Pilih'],
    ['hand', 'Pan', 'Geser'],
    ['pen', 'Pen', 'Pena'],
    ['text', 'Text', 'Teks'],
    ['erase', 'Eraser', 'Penghapus'],
    ['rect', 'Rectangle', 'Kotak'],
    ['ellipse', 'Ellipse', 'Elips'],
    ['parallelogram', 'Parallelogram', 'Jajargenjang'],
    ['diamond', 'Diamond', 'Belah ketupat'],
    ['triangle', 'Triangle', 'Segitiga'],
    ['arrow', 'Arrow', 'Panah'],
  ];
  const button = (id: string, en: string, ind: string) =>
    `<button type="button" data-action="${id}" aria-label="${t(en, ind)}" title="${t(en, ind)}">${icon(id)}<span>${t(en, ind)}</span></button>`;
  host.innerHTML = `<div class="draw-toolbar"><div class="draw-tools" role="toolbar" aria-label="${t('Drawing tools', 'Alat gambar')}">${tools
    .map(
      ([id, en, ind]) =>
        `${id === 'rect' ? '<span class="draw-divider" role="separator" aria-orientation="vertical"></span>' : ''}<button type="button" data-tool="${id}" aria-label="${t(en, ind)}" aria-pressed="${id === 'select'}">${icon(id)}<span>${t(en, ind)}</span>${Object.entries(
          keys,
        )
          .filter(([, v]) => v === id)
          .map(([k]) => `<kbd>${k.toUpperCase()}</kbd>`)
          .join('')}</button>`,
    )
    .join(
      '',
    )}</div><div class="draw-options"><label>${t('Color', 'Warna')}<input type="color" data-color value="#17c5d5"></label><label>${t('Stroke', 'Tebal')}<select data-width><option>2</option><option selected>4</option><option>8</option><option>12</option></select></label><label>${t('Eraser', 'Penghapus')}<input data-eraser type="range" min="10" max="80" value="28"></label>${button('undo', 'Undo', 'Urungkan')}${button('redo', 'Redo', 'Ulangi')}${button('delete', 'Delete selection', 'Hapus pilihan')}<button type="button" data-action="out" aria-label="${t('Zoom out', 'Perkecil')}">−</button><button type="button" data-action="reset">100%</button><button type="button" data-action="in" aria-label="${t('Zoom in', 'Perbesar')}">+</button>${button('fit', 'Fit', 'Sesuaikan')}${button('text', 'Edit text', 'Edit teks')}${button('copy', 'Copy image', 'Salin gambar')}${button('export', 'Export PNG', 'Ekspor PNG')}</div></div><div class="draw-stage"><svg class="drawing" tabindex="0" role="application" aria-label="${t('Drawing canvas', 'Kanvas gambar')}"></svg><div class="eraser-cursor" hidden></div><button type="button" class="selection-rotate" aria-label="${t('Rotate selection', 'Putar pilihan')}" hidden>${icon('rotate')}</button><button type="button" class="selection-delete" aria-label="${t('Delete selected objects', 'Hapus objek terpilih')}" hidden>${icon('delete')}</button></div><p class="draw-caption">${t('Double-click to write · Shift to select more · Space + drag to pan', 'Klik dua kali untuk menulis · Shift untuk memilih banyak · Spasi + tarik untuk geser')}</p><div class="draw-message" role="status"></div>`;
  const q = <T extends Element>(s: string) => host.querySelector<T>(s)!;
  const svg = q<SVGSVGElement>('.drawing'),
    stage = q<HTMLDivElement>('.draw-stage');
  const rotation = q<HTMLButtonElement>('.selection-rotate'),
    deletion = q<HTMLButtonElement>('.selection-delete');
  const cursor = q<HTMLDivElement>('.eraser-cursor');
  const color = q<HTMLInputElement>('[data-color]'),
    width = q<HTMLSelectElement>('[data-width]'),
    eraserSize = q<HTMLInputElement>('[data-eraser]');
  const abort = new AbortController();
  const message = (s: string) => {
    q<HTMLElement>('.draw-message').textContent = s;
  };
  const chosen = () => scene.shapes.filter((s) => selected.has(s.id));
  const point = (e: { clientX: number; clientY: number }): Point => {
    const r = svg.getBoundingClientRect();
    return [
      (e.clientX - r.left) / view.zoom + view.x,
      (e.clientY - r.top) / view.zoom + view.y,
    ];
  };
  const pointerTarget = (e: Event) =>
    e.target instanceof Element ? e.target : svg;
  function hit(p: Point): Shape | undefined {
    return [...scene.shapes].reverse().find((s) => {
      const b = bounds(s),
        q = turn(p, center(b), -s.angle);
      return (
        q[0] >= b.x - 6 / view.zoom &&
        q[0] <= b.x + b.w + 6 / view.zoom &&
        q[1] >= b.y - 6 / view.zoom &&
        q[1] <= b.y + b.h + 6 / view.zoom
      );
    });
  }
  const snapshot = () => JSON.stringify(scene);
  function record(before: string) {
    const body = snapshot();
    if (before === body) return;
    try {
      parseScene(body);
    } catch (e) {
      scene = parseScene(before);
      opts.error(e);
      paint();
      return;
    }
    history.push(before);
    // Bound undo memory independently of the document size.
    while (
      history.length > 40 ||
      history.reduce((sum, s) => sum + s.length, 0) > 8_000_000
    )
      history.shift();
    redo = [];
    accepted = body;
    opts.change(body);
  }
  function paint() {
    if (!frame && !dead)
      frame = requestAnimationFrame(() => {
        frame = 0;
        render();
      });
  }
  function render() {
    const shapes = chosen(),
      single = shapes.length === 1 ? shapes[0] : null;
    const stroke = 1 / view.zoom;
    let controls = shapes
      .map((s) => {
        const b = bounds(s),
          c = center(b);
        return `<rect data-selection="${s.id}" transform="rotate(${s.angle} ${c})" x="${b.x - 7}" y="${b.y - 7}" width="${b.w + 14}" height="${b.h + 14}" fill="none" stroke="#00d8ec" stroke-width="${stroke}" stroke-dasharray="5 4" pointer-events="none"/>`;
      })
      .join('');
    if (single && opts.writable && !textEdit) {
      const b = bounds(single),
        c = center(b);
      const handles: Point[] =
        single.type === 'arrow'
          ? single.points
          : [
              [b.x, b.y],
              [b.x + b.w, b.y],
              [b.x, b.y + b.h],
              [b.x + b.w, b.y + b.h],
            ];
      controls += `<g transform="rotate(${single.angle} ${c})">${handles.map((p, i) => `<g data-${single.type === 'arrow' ? 'endpoint' : 'handle'}="${i}"><circle cx="${p[0]}" cy="${p[1]}" r="${19 / view.zoom}" fill="transparent"/><circle cx="${p[0]}" cy="${p[1]}" r="${6 / view.zoom}" fill="#101619" stroke="#00d8ec" stroke-width="${2 / view.zoom}"/></g>`).join('')}</g>`;
    }
    if (gesture?.kind === 'marquee') {
      const a = gesture.start,
        b = gesture.last;
      controls += `<rect x="${Math.min(a[0], b[0])}" y="${Math.min(a[1], b[1])}" width="${Math.abs(a[0] - b[0])}" height="${Math.abs(a[1] - b[1])}" fill="#00d8ec18" stroke="#00d8ec" stroke-width="${stroke}" pointer-events="none"/>`;
    }
    svg.innerHTML = `<g transform="translate(${-view.x * view.zoom} ${-view.y * view.zoom}) scale(${view.zoom})">${scene.shapes.map(shapeMarkup).join('')}${draft ? shapeMarkup(draft) : ''}${controls}</g>`;
    rotation.hidden = deletion.hidden =
      !shapes.length || !!textEdit || !opts.writable;
    if (shapes.length) {
      const b = single
          ? bounds(single)
          : groupFrame?.box || union(shapes.map(visualBounds)),
        c = center(b),
        angle = single ? single.angle : groupFrame?.angle || 0;
      for (const [control, y] of [
        [rotation, b.y - 32 / view.zoom],
        [deletion, b.y + b.h + 32 / view.zoom],
      ] as const) {
        const p = turn([c[0], y], c, angle);
        control.style.left = `${(p[0] - view.x) * view.zoom - 18}px`;
        control.style.top = `${(p[1] - view.y) * view.zoom - 18}px`;
        control.style.transform = `rotate(${angle}deg)`;
      }
    }
    q<HTMLButtonElement>('[data-action="reset"]').textContent =
      `${Math.round(view.zoom * 100)}%`;
    for (const [action, disabled] of [
      ['undo', !history.length],
      ['redo', !redo.length],
      ['delete', !shapes.length],
      ['text', false],
    ] as const)
      q<HTMLButtonElement>(`[data-action="${action}"]`).disabled =
        disabled || !opts.writable;
    host.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => {
      b.disabled =
        !opts.writable &&
        b.dataset.tool !== 'select' &&
        b.dataset.tool !== 'hand';
      b.setAttribute('aria-pressed', String(b.dataset.tool === tool));
    });
  }
  function setTool(next: Tool) {
    finishText();
    tool = next;
    svg.style.cursor =
      tool === 'erase'
        ? 'none'
        : tool === 'hand'
          ? 'grab'
          : tool === 'select'
            ? 'default'
            : 'crosshair';
    cursor.hidden = true;
    paint();
  }
  function finishText(cancel = false) {
    if (!textEdit) return;
    const { input, shape, before, done } = textEdit;
    textEdit = null;
    if (cancel) scene = parseScene(before);
    else {
      shape.text = input.value;
      if (shape.type === 'text' && !shape.text.trim())
        scene.shapes = scene.shapes.filter((s) => s.id !== shape.id);
      record(before);
    }
    input.remove();
    done.remove();
    opts.busy(false);
    paint();
  }
  function editText(shape: Shape | undefined, p: Point) {
    if (!opts.writable) return;
    finishText();
    const before = snapshot();
    if (!shape) {
      shape = {
        id: crypto.randomUUID(),
        type: 'text',
        points: [p],
        color: color.value,
        width: 4,
        angle: 0,
        text: '',
        fontSize: 24,
        erased: [],
      };
      scene.shapes.push(shape);
    }
    selected = new Set([shape.id]);
    opts.busy(true);
    const b = bounds(shape),
      input = document.createElement('textarea'),
      done = document.createElement('button');
    input.className = 'canvas-text-editor';
    input.setAttribute('aria-label', t('Canvas text', 'Teks kanvas'));
    input.maxLength = 10000;
    input.value = shape.text;
    const screenX = (b.x - view.x) * view.zoom,
      screenY = (b.y - view.y) * view.zoom;
    Object.assign(input.style, {
      left: `${Math.max(2, Math.min(stage.clientWidth - 190, screenX))}px`,
      top: `${Math.max(2, Math.min(stage.clientHeight - 100, screenY))}px`,
      fontSize: `${Math.min(64, shape.fontSize * view.zoom)}px`,
      color: shape.color,
    });
    done.type = 'button';
    done.className = 'canvas-text-done';
    done.textContent = t('Done', 'Selesai');
    textEdit = { input, shape, before, done };
    stage.append(input, done);
    done.onpointerdown = (e) => e.preventDefault();
    done.onclick = () => finishText();
    input.onblur = () => finishText();
    input.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') finishText(true);
      else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') finishText();
    };
    input.focus();
    paint();
  }
  function start(kind: Gesture['kind'], p: Point): Gesture {
    opts.busy(true);
    return (gesture = {
      kind,
      start: p,
      last: p,
      before: snapshot(),
      originals: structuredClone(chosen()),
      base: new Set(selected),
      corner: 0,
      origin: [0, 0],
      angle: 0,
      view: { ...view },
      frame: groupFrame ? structuredClone(groupFrame) : null,
    });
  }
  function cancelGesture() {
    if (gesture) {
      scene = parseScene(gesture.before);
      groupFrame = gesture.frame;
    }
    gesture = null;
    draft = null;
    opts.busy(false);
    paint();
  }
  function endGesture() {
    if (!gesture) return;
    const g = gesture;
    if (draft) {
      const a = draft.points[0],
        b = draft.points.at(-1)!;
      if (
        draft.type === 'pen' ||
        Math.hypot(b[0] - a[0], b[1] - a[1]) * view.zoom > 3
      ) {
        scene.shapes.push(draft);
        selected = new Set([draft.id]);
      }
      draft = null;
    }
    gesture = null;
    if (opts.writable) record(g.before);
    opts.viewport({ ...view });
    opts.busy(false);
    paint();
  }
  svg.onpointerdown = (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    finishText();
    svg.focus();
    e.preventDefault();
    const p = point(e);
    svg.setPointerCapture(e.pointerId);
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (touches.size === 2) {
        cancelGesture();
        lastTap = null;
        const [a, b] = [...touches.values()];
        pinch = {
          distance: Math.hypot(b[0] - a[0], b[1] - a[1]),
          zoom: view.zoom,
          world: point({
            clientX: (a[0] + b[0]) / 2,
            clientY: (a[1] + b[1]) / 2,
          }),
        };
        return;
      }
    }
    if (tool === 'hand' || space || e.button === 1) {
      lastTap = null;
      start('pan', p);
      return;
    }
    const target = pointerTarget(e),
      handle = target.closest<SVGGElement>('[data-handle]'),
      endpoint = target.closest<SVGGElement>('[data-endpoint]');
    if (opts.writable && (handle || endpoint) && selected.size === 1) {
      lastTap = null;
      const g = start(endpoint ? 'endpoint' : 'resize', p);
      g.corner = Number(endpoint?.dataset.endpoint ?? handle?.dataset.handle);
      return;
    }
    const now = performance.now();
    if (
      opts.writable &&
      tool !== 'erase' &&
      lastTap &&
      now - lastTap.time < 400 &&
      Math.hypot(p[0] - lastTap.point[0], p[1] - lastTap.point[1]) * view.zoom <
        8
    ) {
      lastTap = null;
      editText(hit(p), p);
      return;
    }
    lastTap = { time: now, point: p };
    if (tool === 'select' || tool === 'text' || !opts.writable) {
      const s = hit(p);
      if (s) {
        if (e.shiftKey) {
          groupFrame = null;
          if (selected.has(s.id)) selected.delete(s.id);
          else selected.add(s.id);
        } else if (!selected.has(s.id)) {
          selected = new Set([s.id]);
          groupFrame = null;
        }
        if (selected.has(s.id) && opts.writable) start('move', p);
      } else {
        if (!e.shiftKey) selected.clear();
        groupFrame = null;
        start('marquee', p);
      }
    } else if (tool === 'erase') {
      start('erase', p);
      scene.shapes.forEach((s) =>
        erase(s, p, Number(eraserSize.value) / 2 / view.zoom),
      );
    } else {
      selected.clear();
      groupFrame = null;
      start('draw', p);
      draft = {
        id: crypto.randomUUID(),
        type: tool,
        points: [p, p],
        color: color.value,
        width: Number(width.value),
        angle: 0,
        text: '',
        fontSize: 24,
        erased: [],
      };
    }
    paint();
  };
  function move(e: PointerEvent) {
    if (touches.has(e.pointerId))
      touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch) {
      if (touches.size === 2) {
        const [a, b] = [...touches.values()],
          r = svg.getBoundingClientRect();
        view.zoom = Math.max(
          0.1,
          Math.min(
            4,
            (pinch.zoom * Math.hypot(b[0] - a[0], b[1] - a[1])) /
              Math.max(1, pinch.distance),
          ),
        );
        view.x = pinch.world[0] - ((a[0] + b[0]) / 2 - r.left) / view.zoom;
        view.y = pinch.world[1] - ((a[1] + b[1]) / 2 - r.top) / view.zoom;
        paint();
      }
      return;
    }
    const p = point(e),
      g = gesture;
    if (tool === 'erase') {
      const r = stage.getBoundingClientRect();
      cursor.hidden = false;
      Object.assign(cursor.style, {
        left: `${e.clientX - r.left}px`,
        top: `${e.clientY - r.top}px`,
        width: `${eraserSize.value}px`,
        height: `${eraserSize.value}px`,
      });
    }
    if (!g) return;
    if (Math.hypot(p[0] - g.start[0], p[1] - g.start[1]) * view.zoom > 4)
      lastTap = null;
    const replace = (shapes: Shape[]) => {
      const map = new Map(shapes.map((s) => [s.id, s]));
      scene.shapes = scene.shapes.map((s) => map.get(s.id) || s);
    };
    if (g.kind === 'move')
      replace(
        g.originals.map((s) =>
          translate(s, p[0] - g.start[0], p[1] - g.start[1]),
        ),
      );
    if (g.kind === 'resize') replace([resize(g.originals[0], g.corner, p)]);
    if (g.kind === 'endpoint')
      replace([moveEndpoint(g.originals[0], g.corner, p)]);
    if (g.kind === 'rotate') {
      const delta =
        ((Math.atan2(p[1] - g.origin[1], p[0] - g.origin[0]) - g.angle) * 180) /
        Math.PI;
      replace(rotateGroup(g.originals, g.origin, delta));
      if (g.originals.length > 1)
        groupFrame = { box: g.frame!.box, angle: g.frame!.angle + delta };
    }
    if (g.kind === 'move' && g.frame)
      groupFrame = {
        angle: g.frame.angle,
        box: {
          ...g.frame.box,
          x: g.frame.box.x + p[0] - g.start[0],
          y: g.frame.box.y + p[1] - g.start[1],
        },
      };
    if (g.kind === 'pan') {
      view.x += g.start[0] - p[0];
      view.y += g.start[1] - p[1];
    }
    if (g.kind === 'marquee') {
      const x = Math.min(p[0], g.start[0]),
        y = Math.min(p[1], g.start[1]),
        w = Math.abs(p[0] - g.start[0]),
        h = Math.abs(p[1] - g.start[1]);
      selected = new Set(g.base);
      groupFrame = null;
      if (Math.hypot(w, h) * view.zoom > 3)
        scene.shapes.forEach((s) => {
          const b = visualBounds(s);
          if (b.x + b.w >= x && b.x <= x + w && b.y + b.h >= y && b.y <= y + h)
            selected.add(s.id);
        });
    }
    if (g.kind === 'erase') {
      const radius = Number(eraserSize.value) / 2 / view.zoom,
        d = Math.hypot(p[0] - g.last[0], p[1] - g.last[1]),
        steps = Math.min(1000, Math.max(1, Math.ceil(d / (radius / 2))));
      for (let i = 1; i <= steps; i++) {
        const q: Point = [
          g.last[0] + ((p[0] - g.last[0]) * i) / steps,
          g.last[1] + ((p[1] - g.last[1]) * i) / steps,
        ];
        scene.shapes.forEach((s) => erase(s, q, radius));
      }
    }
    if (draft) {
      if (draft.type === 'pen') {
        if (Math.hypot(p[0] - g.last[0], p[1] - g.last[1]) * view.zoom > 1)
          draft.points.push(p);
      } else draft.points[1] = p;
    }
    g.last = p;
    paint();
  }
  svg.onpointermove = move;
  svg.onpointerup = (e) => {
    touches.delete(e.pointerId);
    if (pinch) {
      if (!touches.size) pinch = null;
      opts.viewport({ ...view });
      return;
    }
    endGesture();
  };
  svg.onpointercancel = (e) => {
    touches.delete(e.pointerId);
    pinch = null;
    lastTap = null;
    cancelGesture();
  };
  svg.onpointerleave = () => (cursor.hidden = true);
  svg.ondblclick = (e) => e.preventDefault();
  rotation.onpointerdown = (e) => {
    if (!opts.writable) return;
    e.preventDefault();
    e.stopPropagation();
    if (selected.size > 1 && !groupFrame)
      groupFrame = { box: union(chosen().map(visualBounds)), angle: 0 };
    const g = start('rotate', point(e));
    g.origin = center(g.frame?.box || union(g.originals.map(visualBounds)));
    g.angle = Math.atan2(g.start[1] - g.origin[1], g.start[0] - g.origin[0]);
    rotation.setPointerCapture(e.pointerId);
  };
  rotation.onpointermove = move;
  rotation.onpointerup = endGesture;
  rotation.onpointercancel = cancelGesture;
  function remove() {
    finishText();
    if (!opts.writable || !selected.size) return;
    const before = snapshot();
    scene.shapes = scene.shapes.filter((s) => !selected.has(s.id));
    selected.clear();
    groupFrame = null;
    groupFrame = null;
    record(before);
    paint();
    svg.focus();
  }
  deletion.onclick = remove;
  function zoom(f: number) {
    finishText();
    const r = svg.getBoundingClientRect(),
      c: Point = [
        view.x + r.width / 2 / view.zoom,
        view.y + r.height / 2 / view.zoom,
      ];
    view.zoom = Math.max(0.1, Math.min(4, view.zoom * f));
    view.x = c[0] - r.width / 2 / view.zoom;
    view.y = c[1] - r.height / 2 / view.zoom;
    opts.viewport({ ...view });
    paint();
  }
  svg.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      finishText();
      if (e.ctrlKey || e.metaKey) {
        const before = point(e);
        view.zoom = Math.max(
          0.1,
          Math.min(4, view.zoom * Math.exp(-e.deltaY * 0.002)),
        );
        const after = point(e);
        view.x += before[0] - after[0];
        view.y += before[1] - after[1];
      } else {
        view.x += e.deltaX / view.zoom;
        view.y += e.deltaY / view.zoom;
      }
      opts.viewport({ ...view });
      paint();
    },
    { passive: false, signal: abort.signal },
  );
  async function png(): Promise<Blob> {
    finishText();
    const b = union(scene.shapes.map(contentBounds)),
      x = b.x - 40,
      y = b.y - 40,
      w = Math.max(1, b.w + 80),
      h = Math.max(1, b.h + 80),
      scale = Math.min(1, 2400 / Math.max(w, h));
    const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(w * scale)}" height="${Math.ceil(h * scale)}" viewBox="${x} ${y} ${w} ${h}">${scene.shapes.map(shapeMarkup).join('')}</svg>`,
      url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      return await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(Error('PNG export failed'))),
          'image/png',
        ),
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  async function action(id: string) {
    if (['undo', 'redo', 'delete', 'text'].includes(id) && !opts.writable)
      return;
    if (id === 'delete') {
      remove();
      return;
    }
    if (id === 'text') {
      const r = svg.getBoundingClientRect();
      editText(chosen()[0], [
        view.x + r.width / 2 / view.zoom,
        view.y + r.height / 2 / view.zoom,
      ]);
      return;
    }
    finishText();
    if (id === 'undo' || id === 'redo') {
      const from = id === 'undo' ? history : redo,
        to = id === 'undo' ? redo : history;
      if (from.length) {
        to.push(snapshot());
        scene = parseScene(from.pop()!);
        selected.clear();
        groupFrame = null;
        accepted = snapshot();
        opts.change(accepted);
      }
    }
    if (id === 'in') zoom(1.2);
    if (id === 'out') zoom(1 / 1.2);
    if (id === 'reset') Object.assign(view, { x: 0, y: 0, zoom: 1 });
    if (id === 'fit' && scene.shapes.length) {
      const b = union(scene.shapes.map(contentBounds)),
        r = svg.getBoundingClientRect();
      view.zoom = Math.max(
        0.1,
        Math.min(
          4,
          (r.width - 100) / Math.max(1, b.w),
          (r.height - 100) / Math.max(1, b.h),
        ),
      );
      view.x = b.x + b.w / 2 - r.width / 2 / view.zoom;
      view.y = b.y + b.h / 2 - r.height / 2 / view.zoom;
    }
    if (id === 'copy' || id === 'export')
      try {
        if (id === 'copy') {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': png() }),
          ]);
          message(t('Image copied.', 'Gambar disalin.'));
        } else {
          const blob = await png(),
            url = URL.createObjectURL(blob),
            a = document.createElement('a');
          a.href = url;
          a.download = opts.name + '.png';
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      } catch {
        message(
          t(
            'Clipboard unavailable? Use Export PNG to save your image.',
            'Clipboard tidak tersedia? Gunakan Ekspor PNG untuk menyimpan gambar.',
          ),
        );
      }
    opts.viewport({ ...view });
    paint();
  }
  host.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => {
    b.onclick = () => {
      setTool(b.dataset.tool as Tool);
      svg.focus();
    };
    const key = Object.entries(keys).find(([, v]) => v === b.dataset.tool)?.[0];
    if (key) b.setAttribute('aria-keyshortcuts', key.toUpperCase());
  });
  host
    .querySelectorAll<HTMLButtonElement>('[data-action]')
    .forEach((b) => (b.onclick = () => void action(b.dataset.action!)));
  host.addEventListener(
    'keydown',
    (e) => {
      if (pointerTarget(e).closest('input,textarea,select')) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'a') {
        e.preventDefault();
        selected = new Set(scene.shapes.map((s) => s.id));
        groupFrame = null;
        setTool('select');
        paint();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && k === 'z') {
        e.preventDefault();
        void action(e.shiftKey ? 'redo' : 'undo');
        return;
      }
      if (
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        keys[k] &&
        (opts.writable || ['select', 'hand'].includes(keys[k]))
      ) {
        e.preventDefault();
        setTool(keys[k]);
      }
      if (e.code === 'Space') {
        e.preventDefault();
        space = true;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        remove();
      }
      if (e.key === 'Escape') {
        selected.clear();
        groupFrame = null;
        cancelGesture();
        paint();
      }
    },
    { signal: abort.signal },
  );
  window.addEventListener(
    'keyup',
    (e) => {
      if (e.code === 'Space') space = false;
    },
    { signal: abort.signal },
  );
  window.addEventListener(
    'blur',
    () => {
      space = false;
      cancelGesture();
    },
    { signal: abort.signal },
  );
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!host.contains(e.target as Node)) {
        finishText();
        selected.clear();
        groupFrame = null;
        paint();
      }
    },
    { signal: abort.signal },
  );
  for (const input of [color, width])
    input.onchange = () => {
      if (!opts.writable || !selected.size) return;
      const before = snapshot();
      scene.shapes = scene.shapes.map((s) =>
        selected.has(s.id)
          ? { ...s, color: color.value, width: Number(width.value) }
          : s,
      );
      record(before);
      paint();
    };
  const observer = new ResizeObserver(paint);
  observer.observe(stage);
  paint();
  return {
    update(next: Options) {
      if (opts.writable && !next.writable) {
        finishText(true);
        cancelGesture();
        setTool('select');
      }
      opts = next;
      if (next.body !== accepted && !gesture && !textEdit) {
        scene = parseScene(next.body);
        accepted = next.body;
        history = [];
        redo = [];
        selected.clear();
        groupFrame = null;
        paint();
      }
      paint();
    },
    destroy() {
      finishText();
      if (gesture) cancelGesture();
      dead = true;
      abort.abort();
      observer.disconnect();
      cancelAnimationFrame(frame);
      host.innerHTML = '';
      opts.busy(false);
    },
  };
}
