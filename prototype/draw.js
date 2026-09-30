// World-coordinate drawing, with a viewport independent of document bounds.
function mountDrawing(note) {
  note.shapes ??= [];
  note.view ??= { x: 0, y: 0, zoom: 1 };
  const view = note.view;
  let tool = 'select',
    multi = new Set(),
    selected = null,
    draft = null,
    gesture = null,
    editor = null,
    redo = [],
    history = [],
    space = false;
  const touches = new Map();
  let pinch = null;
  const host = $('#note-article');
  host.innerHTML = `<div class="draw-toolbar"><div class="draw-tools">${[
    ['select', 'Select'],
    ['hand', 'Geser'],
    ['pen', 'Pena'],
    ['text', 'Text'],
    ['erase', 'Hapus'],
    ['rect', 'Kotak'],
    ['ellipse', 'Elips'],
    ['parallelogram', 'Jajargenjang'],
    ['diamond', 'Belah Ketupat'],
    ['triangle', 'Segitiga'],
    ['arrow', 'Panah'],
  ]
    .map(
      ([v, l]) =>
        `${v === 'rect' ? '<span class="draw-tool-divider" role="separator" aria-orientation="vertical"></span>' : ''}<button data-tool="${v}" aria-pressed="${v === 'select'}">${l}</button>`,
    )
    .join(
      '',
    )}</div><div class="draw-options"><label>Warna <input type="color" id="draw-color" value="#17c5d5"></label><label>Tebal <select id="draw-width"><option>2</option><option selected>4</option><option>8</option><option>12</option></select></label><label>Penghapus <input id="eraser-size" type="range" min="10" max="80" value="28" aria-label="Ukuran penghapus"></label><button id="draw-undo">Undo</button><button id="draw-redo">Redo</button><button id="draw-delete">Hapus Pilihan</button><button id="draw-zoom-out" aria-label="Zoom out">−</button><button id="draw-reset">100%</button><button id="draw-zoom-in" aria-label="Zoom in">+</button><button id="draw-fit">Fit</button><button id="draw-edit-text">Edit Text</button><button id="draw-copy">Salin Gambar</button><button id="draw-export">PNG ↓</button></div></div><div class="draw-stage infinite"><svg id="drawing" tabindex="0" aria-label="Kanvas gambar tak terbatas" role="img"></svg><div id="eraser-cursor"></div></div><div class="draw-caption">Double-click untuk menulis · Scroll untuk geser · Ctrl/⌘ + scroll untuk zoom · Space + drag untuk geser · Delete untuk hapus pilihan</div>`;
  const svg = $('#drawing'),
    stage = svg.parentElement,
    cursor = $('#eraser-cursor');
  const glyphs = {
    select: 'M4 3l15 9-7 1-3 7z',
    hand: 'M7 12V7m3 5V4m3 8V3m3 10V6M7 10c-4-4-5 0-3 3l5 8h8l3-9',
    pen: 'M4 20l2-6L17 3l4 4L10 18z',
    text: 'M4 4h16M12 4v17M8 21h8',
    rect: 'M3 4h18v16H3z',
    ellipse: 'M22 12a10 8 0 1 1-20 0 10 8 0 1 1 20 0',
    parallelogram: 'M7 4h15l-5 16H2z',
    diamond: 'M12 2l10 10-10 10L2 12z',
    triangle: 'M12 3l10 18H2z',
    arrow: 'M3 20L21 3M10 3h11v11',
    erase: 'M3 14l11-11 8 8-11 11H9z',
  };
  host
    .querySelectorAll('[data-tool]')
    .forEach((b) =>
      b.insertAdjacentHTML(
        'afterbegin',
        `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${glyphs[b.dataset.tool]}"/></svg>`,
      ),
    );
  const actionIcons = {
    'draw-undo': 'M9 5 3 11l6 6M3 11h11a6 6 0 0 1 6 6',
    'draw-redo': 'm15 5 6 6-6 6M21 11H10a6 6 0 0 0-6 6',
    'draw-delete': 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15',
    'draw-copy': 'M8 8h13v13H8z M16 8V3H3v13h5',
    'draw-export': 'M12 3v12m-5-5 5 5 5-5M3 16v5h18v-5',
    'draw-fit': 'M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6',
    'draw-edit-text': 'M4 4h16M12 4v17',
  };
  Object.entries(actionIcons).forEach(([id, path]) =>
    $('#' + id).insertAdjacentHTML(
      'afterbegin',
      `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`,
    ),
  );
  const shortcuts = {
    s: 'select',
    h: 'hand',
    p: 'pen',
    t: 'text',
    r: 'rect',
    e: 'ellipse',
    a: 'arrow',
    x: 'erase',
  };
  Object.entries(shortcuts).forEach(([key, tool]) => {
    const button = host.querySelector(`[data-tool="${tool}"]`);
    button.insertAdjacentHTML('beforeend', `<kbd>${key.toUpperCase()}</kbd>`);
    button.title = button.textContent.trim();
    button.setAttribute('aria-keyshortcuts', key.toUpperCase());
  });
  const selectionDelete = document.createElement('button');
  selectionDelete.className = 'selection-delete';
  selectionDelete.setAttribute('aria-label', 'Delete selected objects');
  selectionDelete.title = 'Delete selected objects';
  selectionDelete.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg>';
  selectionDelete.hidden = true;
  stage.append(selectionDelete);
  selectionDelete.onpointerdown = (e) => e.stopPropagation();
  selectionDelete.onclick = removeSelected;
  const rotateControl = document.createElement('button');
  rotateControl.className = 'selection-rotate';
  rotateControl.textContent = '↻';
  rotateControl.setAttribute('aria-label', 'Rotate selection');
  rotateControl.title = 'Drag to rotate';
  rotateControl.hidden = true;
  stage.append(rotateControl);
  rotateControl.onpointerdown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const ids = [...new Set([selected, ...multi])].filter(shapeById);
    if (!ids.length) return;
    checkpoint();
    const originals = ids.map((id) => structuredClone(shapeById(id))),
      boxes = originals.map(bounds),
      cx =
        (Math.min(...boxes.map((r) => r.x)) +
          Math.max(...boxes.map((r) => r.x + r.w))) /
        2,
      cy =
        (Math.min(...boxes.map((r) => r.y)) +
          Math.max(...boxes.map((r) => r.y + r.h))) /
        2,
      p = point(e),
      start = Math.atan2(p[1] - cy, p[0] - cx);
    rotateControl.setPointerCapture(e.pointerId);
    rotateControl.onpointermove = (ev) => {
      const q = point(ev),
        delta = Math.atan2(q[1] - cy, q[0] - cx) - start;
      for (const original of originals) {
        const s = shapeById(original.id),
          r = bounds(original),
          ox = r.x + r.w / 2,
          oy = r.y + r.h / 2,
          nx = cx + (ox - cx) * Math.cos(delta) - (oy - cy) * Math.sin(delta),
          ny = cy + (ox - cx) * Math.sin(delta) + (oy - cy) * Math.cos(delta);
        s.angle = (original.angle || 0) + (delta * 180) / Math.PI;
        s.points = original.points.map((p) => [p[0] + nx - ox, p[1] + ny - oy]);
        s.erased = original.erased?.map((p) => [
          p[0] + nx - ox,
          p[1] + ny - oy,
          p[2],
        ]);
      }
      paint();
    };
    rotateControl.onpointerup = () => {
      rotateControl.onpointermove = null;
      save();
    };
    rotateControl.onpointercancel = () => {
      originals.forEach((o) => Object.assign(shapeById(o.id), o));
      history.pop();
      paint();
    };
  };
  const shapeById = (id) => note.shapes.find((s) => s.id === id);
  function bounds(s) {
    const xs = s.points.map((p) => p[0]),
      ys = s.points.map((p) => p[1]);
    let x = Math.min(...xs),
      y = Math.min(...ys),
      w = Math.max(...xs) - x,
      h = Math.max(...ys) - y;
    if (s.type === 'text') {
      w = Math.max(
        30,
        ...(s.text || '')
          .split('\n')
          .map((t) => t.length * (s.fontSize || 24) * 0.58),
      );
      h = Math.max(
        28,
        (s.text || '').split('\n').length * (s.fontSize || 24) * 1.2,
      );
      y -= s.fontSize || 24;
    }
    return { x, y, w, h };
  }
  function turn(p, c, angle) {
    const a = (angle * Math.PI) / 180,
      dx = p[0] - c[0],
      dy = p[1] - c[1];
    return [
      c[0] + dx * Math.cos(a) - dy * Math.sin(a),
      c[1] + dx * Math.sin(a) + dy * Math.cos(a),
    ];
  }
  function visualBounds(s) {
    const r = bounds(s),
      c = [r.x + r.w / 2, r.y + r.h / 2],
      points = [
        [r.x, r.y],
        [r.x + r.w, r.y],
        [r.x, r.y + r.h],
        [r.x + r.w, r.y + r.h],
      ].map((p) => turn(p, c, s.angle || 0)),
      xs = points.map((p) => p[0]),
      ys = points.map((p) => p[1]);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };
  }
  const textMeasure = document.createElement('canvas').getContext('2d');
  function textMarkup(text, x, y, center = false, size = 24) {
    return `<text x="${x}" y="${y}" text-anchor="${center ? 'middle' : 'start'}" fill="currentColor" font-size="${size}" font-family="sans-serif">${String(
      text || '',
    )
      .split('\n')
      .map(
        (line, i) =>
          `<tspan x="${x}" dy="${i ? size * 1.2 : 0}">${esc(line) || ' '}</tspan>`,
      )
      .join('')}</text>`;
  }
  function shapeMarkup(s) {
    const a = s.points[0],
      b = s.points.at(-1),
      r = bounds(s),
      common = `stroke="${s.color}" stroke-width="${s.width}" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
    let body = '';
    if (s.type === 'pen')
      body = `<polyline points="${s.points.map((p) => p.join(',')).join(' ')}" ${common}/>`;
    if (s.type === 'rect')
      body = `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" ${common}/>`;
    if (s.type === 'ellipse')
      body = `<ellipse cx="${r.x + r.w / 2}" cy="${r.y + r.h / 2}" rx="${r.w / 2}" ry="${r.h / 2}" ${common}/>`;
    const vertices = {
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
      body = `<polygon points="${vertices[s.type].map((p) => p.join(',')).join(' ')}" ${common}/>`;
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
      textMeasure.font = '24px sans-serif';
      const holes = lines
        .map((line, i) => {
          const w = textMeasure.measureText(line).width;
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
  let paintPending = false;
  function paint() {
    if (paintPending) return;
    paintPending = true;
    requestAnimationFrame(() => {
      paintPending = false;
      paintNow();
    });
  }
  function paintNow() {
    const s = shapeById(selected),
      r = s ? bounds(s) : null;
    svg.innerHTML = `<g transform="translate(${-view.x * view.zoom} ${-view.y * view.zoom}) scale(${view.zoom})">${note.shapes.map(shapeMarkup).join('')}${draft ? shapeMarkup(draft) : ''}${[
      ...multi,
    ]
      .filter((id) => id !== selected)
      .map((id) => {
        const n = shapeById(id);
        if (!n) return '';
        const q = bounds(n);
        return `<rect transform="rotate(${n.angle || 0} ${q.x + q.w / 2} ${q.y + q.h / 2})" x="${q.x - 5}" y="${q.y - 5}" width="${q.w + 10}" height="${q.h + 10}" fill="none" stroke="#00d8ec" stroke-width="${1 / view.zoom}" stroke-dasharray="5 4" pointer-events="none"/>`;
      })
      .join(
        '',
      )}${gesture?.kind === 'marquee' ? `<rect x="${Math.min(gesture.start[0], gesture.end[0])}" y="${Math.min(gesture.start[1], gesture.end[1])}" width="${Math.abs(gesture.start[0] - gesture.end[0])}" height="${Math.abs(gesture.start[1] - gesture.end[1])}" fill="#00d8ec18" stroke="#00d8ec" stroke-width="${1 / view.zoom}" pointer-events="none"/>` : ''}${
      r
        ? `<g transform="rotate(${s.angle || 0} ${r.x + r.w / 2} ${r.y + r.h / 2})"><rect x="${r.x - 7}" y="${r.y - 7}" width="${r.w + 14}" height="${r.h + 14}" fill="none" stroke="#00d8ec" stroke-width="${1 / view.zoom}" stroke-dasharray="5 4" pointer-events="none"/>${
            s.type === 'arrow'
              ? s.points
                  .map(
                    (p, i) =>
                      `<circle data-endpoint="${i}" cx="${p[0]}" cy="${p[1]}" r="${18 / view.zoom}" fill="transparent" style="cursor:move"/><circle data-endpoint="${i}" cx="${p[0]}" cy="${p[1]}" r="${7 / view.zoom}" fill="#080f12" stroke="#00d8ec" stroke-width="${2 / view.zoom}" style="cursor:move"/>`,
                  )
                  .join('')
              : [
                  [0, 0],
                  [1, 0],
                  [0, 1],
                  [1, 1],
                ]
                  .map(
                    ([hx, hy], i) =>
                      `<circle data-handle="${i}" cx="${r.x + hx * r.w}" cy="${r.y + hy * r.h}" r="${16 / view.zoom}" fill="transparent" stroke="none"/><circle data-handle="${i}" cx="${r.x + hx * r.w}" cy="${r.y + hy * r.h}" r="${7 / view.zoom}" fill="#080f12" stroke="#00d8ec" stroke-width="${2 / view.zoom}" style="cursor:${i === 0 || i === 3 ? 'nwse' : 'nesw'}-resize"/>`,
                  )
                  .join('')
          }</g>`
        : ''
    }</g>`;
    $('#draw-undo').disabled = !history.length;
    $('#draw-redo').disabled = !redo.length;
    $('#draw-delete').disabled = !s;
    $('#draw-reset').textContent = Math.round(view.zoom * 100) + '%';
    const boxes = [...new Set([selected, ...multi])]
      .map(shapeById)
      .filter(Boolean)
      .map(visualBounds);
    selectionDelete.hidden = !boxes.length || !!editor;
    rotateControl.hidden = selectionDelete.hidden;
    if (boxes.length) {
      const left = Math.min(...boxes.map((b) => b.x)),
        right = Math.max(...boxes.map((b) => b.x + b.w)),
        bottom = Math.max(...boxes.map((b) => b.y + b.h));
      rotateControl.style.left =
        Math.max(
          4,
          Math.min(
            stage.clientWidth - 40,
            ((left + right) / 2 - view.x) * view.zoom - 18,
          ),
        ) + 'px';
      rotateControl.style.top =
        Math.max(
          4,
          (Math.min(...boxes.map((b) => b.y)) - view.y) * view.zoom - 48,
        ) + 'px';
      selectionDelete.style.left =
        Math.max(
          4,
          Math.min(
            stage.clientWidth - 40,
            ((left + right) / 2 - view.x) * view.zoom - 18,
          ),
        ) + 'px';
      selectionDelete.style.top =
        Math.max(
          4,
          Math.min(stage.clientHeight - 40, (bottom - view.y) * view.zoom + 18),
        ) + 'px';
      if (boxes.length === 1 && s) {
        const b = bounds(s),
          c = [b.x + b.w / 2, b.y + b.h / 2];
        for (const [control, y, size] of [
          [rotateControl, b.y - 32 / view.zoom, 32],
          [selectionDelete, b.y + b.h + 36 / view.zoom, 36],
        ]) {
          const p = turn([c[0], y], c, s.angle || 0);
          control.style.left = (p[0] - view.x) * view.zoom - size / 2 + 'px';
          control.style.top = (p[1] - view.y) * view.zoom - size / 2 + 'px';
          control.style.transform = `rotate(${s.angle || 0}deg)`;
        }
      } else {
        rotateControl.style.transform = '';
        selectionDelete.style.transform = '';
      }
    }
  }
  function checkpoint() {
    history.push(JSON.stringify(note.shapes));
    if (history.length > 40) history.shift();
    redo = [];
  }
  function point(e) {
    const r = svg.getBoundingClientRect();
    return [
      (e.clientX - r.left) / view.zoom + view.x,
      (e.clientY - r.top) / view.zoom + view.y,
    ];
  }
  function hit(e, p) {
    const direct = e.target.closest('[data-shape]')?.dataset.shape;
    if (direct) return direct;
    return [...note.shapes].reverse().find((s) => {
      const r = bounds(s),
        q = turn(p, [r.x + r.w / 2, r.y + r.h / 2], -(s.angle || 0));
      return (
        q[0] >= r.x - 6 &&
        q[0] <= r.x + r.w + 6 &&
        q[1] >= r.y - 6 &&
        q[1] <= r.y + r.h + 6
      );
    })?.id;
  }
  function finishText(cancel = false) {
    if (!editor) return;
    const { input, n, previous, isNew } = editor;
    editor = null;
    if (cancel) {
      if (isNew) note.shapes = note.shapes.filter((s) => s !== n);
      else n.text = previous;
      history.pop();
    } else {
      n.text = input.value;
      if (isNew && !n.text.trim()) {
        note.shapes = note.shapes.filter((s) => s !== n);
        history.pop();
      }
    }
    input.remove();
    stage.querySelector('.canvas-text-done')?.remove();
    save();
    paint();
  }
  function editText(id, p) {
    finishText();
    checkpoint();
    let n = shapeById(id),
      isNew = !n;
    if (!n) {
      n = {
        id: uid(),
        type: 'text',
        points: [p],
        text: '',
        color: $('#draw-color').value,
        width: 4,
      };
      note.shapes.push(n);
    }
    multi.clear();
    selected = n.id;
    const r = bounds(n),
      input = document.createElement('textarea');
    input.className = 'canvas-text-editor';
    input.setAttribute('aria-label', 'Teks di kanvas');
    input.value = n.text || '';
    input.style.left =
      Math.max(
        4,
        Math.min(stage.clientWidth - 190, (r.x - view.x) * view.zoom),
      ) + 'px';
    input.style.top =
      Math.max(
        4,
        Math.min(stage.clientHeight - 100, (r.y - view.y) * view.zoom),
      ) + 'px';
    input.style.width = Math.max(180, Math.min(420, r.w * view.zoom)) + 'px';
    input.style.fontSize = (n.fontSize || 24) * view.zoom + 'px';
    input.style.color = n.color;
    stage.append(input);
    const done = document.createElement('button');
    done.className = 'canvas-text-done';
    done.textContent = 'Done';
    done.onpointerdown = (e) => e.preventDefault();
    done.onclick = () => finishText();
    stage.append(done);
    editor = { input, n, previous: n.text, isNew };
    input.onblur = () => finishText();
    input.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') finishText(true);
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) finishText();
    };
    input.focus();
    paint();
  }
  function setTool(v) {
    finishText();
    tool = v;
    host
      .querySelectorAll('[data-tool]')
      .forEach((b) => b.setAttribute('aria-pressed', b.dataset.tool === v));
    svg.style.cursor =
      v === 'erase'
        ? 'none'
        : v === 'hand'
          ? 'grab'
          : v === 'select'
            ? 'default'
            : v === 'text'
              ? 'text'
              : 'crosshair';
    cursor.hidden = true;
  }
  host
    .querySelectorAll('[data-tool]')
    .forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
  function eraseAt(p) {
    const radius = Number($('#eraser-size').value) / 2 / view.zoom;
    note.shapes.forEach((s) => {
      const r = bounds(s);
      if (
        p[0] + radius >= r.x &&
        p[0] - radius <= r.x + r.w &&
        p[1] + radius >= r.y &&
        p[1] - radius <= r.y + r.h
      )
        (s.erased ??= []).push([...p, radius]);
    });
  }
  let lastPress = null;
  svg.onpointerdown = (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    finishText();
    svg.focus();
    e.preventDefault();
    const p = point(e),
      now = performance.now();
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (touches.size === 2) {
        if (gesture?.changed) {
          for (const original of gesture.originals || [gesture.original])
            Object.assign(shapeById(original.id), original);
          history.pop();
        }
        draft = null;
        gesture = null;
        lastPress = null;
        const [a, b] = [...touches.values()];
        pinch = {
          distance: Math.hypot(b[0] - a[0], b[1] - a[1]),
          zoom: view.zoom,
          world: point({
            clientX: (a[0] + b[0]) / 2,
            clientY: (a[1] + b[1]) / 2,
          }),
        };
        svg.setPointerCapture(e.pointerId);
        return;
      }
    }
    const endpoint = e.target.dataset.endpoint;
    if (endpoint !== undefined && selected) {
      const shape = shapeById(selected);
      checkpoint();
      const original = structuredClone(shape),
        r = bounds(shape),
        c = [r.x + r.w / 2, r.y + r.h / 2];
      shape.points = shape.points.map((q) => turn(q, c, shape.angle || 0));
      shape.erased = shape.erased?.map((q) => [
        ...turn(q, c, shape.angle || 0),
        q[2],
      ]);
      shape.angle = 0;
      gesture = {
        kind: 'endpoint',
        index: Number(endpoint),
        original,
        changed: true,
      };
      lastPress = null;
      svg.setPointerCapture(e.pointerId);
      paint();
      return;
    }
    const handle = e.target.dataset.handle;
    if (handle !== undefined && selected) {
      checkpoint();
      gesture = {
        kind: 'resize',
        corner: Number(handle),
        original: structuredClone(shapeById(selected)),
        box: bounds(shapeById(selected)),
      };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    if (
      e.button === 0 &&
      !space &&
      tool !== 'hand' &&
      tool !== 'erase' &&
      lastPress &&
      now - lastPress.time < 450 &&
      Math.hypot(e.clientX - lastPress.x, e.clientY - lastPress.y) < 8
    ) {
      lastPress = null;
      gesture = null;
      draft = null;
      editText(hit(e, p), p);
      return;
    }
    lastPress = { time: now, x: e.clientX, y: e.clientY };
    svg.setPointerCapture(e.pointerId);
    if (tool === 'hand' || space || e.button === 1) {
      gesture = {
        kind: 'pan',
        x: e.clientX,
        y: e.clientY,
        vx: view.x,
        vy: view.y,
      };
      return;
    }
    if (tool === 'erase') {
      checkpoint();
      gesture = { kind: 'erase', last: p };
      eraseAt(p);
      paint();
      return;
    }
    if (tool === 'select' || tool === 'text') {
      const id = hit(e, p);
      if (id) {
        if (e.shiftKey) {
          if (multi.has(id)) multi.delete(id);
          else multi.add(id);
        } else if (!multi.has(id)) multi = new Set([id]);
        selected = id;
        gesture = {
          kind: 'move',
          start: p,
          original: structuredClone(shapeById(selected)),
          originals: [...multi]
            .map((id) => structuredClone(shapeById(id)))
            .filter(Boolean),
          changed: false,
        };
      } else {
        if (!e.shiftKey) multi.clear();
        selected = null;
        gesture = { kind: 'marquee', start: p, end: p, base: new Set(multi) };
      }
      paint();
      return;
    }
    multi.clear();
    selected = null;
    draft = {
      id: uid(),
      type: tool,
      points: [p, p],
      color: $('#draw-color').value,
      width: Number($('#draw-width').value),
    };
    paint();
  };
  svg.onpointermove = (e) => {
    if (touches.has(e.pointerId))
      touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && touches.size === 2) {
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
      return;
    }
    const p = point(e);
    if (tool === 'erase') {
      const r = stage.getBoundingClientRect(),
        size = Number($('#eraser-size').value);
      cursor.hidden = false;
      Object.assign(cursor.style, {
        width: size + 'px',
        height: size + 'px',
        left: e.clientX - r.left + 'px',
        top: e.clientY - r.top + 'px',
      });
    }
    if (gesture?.kind === 'marquee') {
      gesture.end = p;
      const x = Math.min(p[0], gesture.start[0]),
        y = Math.min(p[1], gesture.start[1]),
        w = Math.abs(p[0] - gesture.start[0]),
        h = Math.abs(p[1] - gesture.start[1]);
      multi = new Set(gesture.base);
      note.shapes.forEach((s) => {
        const r = visualBounds(s);
        if (r.x + r.w >= x && r.x <= x + w && r.y + r.h >= y && r.y <= y + h)
          multi.add(s.id);
      });
      selected = [...multi][0] || null;
      paint();
    }
    if (gesture?.kind === 'endpoint') {
      shapeById(selected).points[gesture.index] = p;
      paint();
    }
    if (gesture?.kind === 'resize') {
      const g = gesture,
        r = g.box,
        local = turn(
          p,
          [r.x + r.w / 2, r.y + r.h / 2],
          -(g.original.angle || 0),
        ),
        left = g.corner % 2 === 0,
        top = g.corner < 2,
        anchor = [left ? r.x + r.w : r.x, top ? r.y + r.h : r.y],
        sx = Math.max(
          0.05,
          (left ? anchor[0] - local[0] : local[0] - anchor[0]) /
            Math.max(1, r.w),
        ),
        sy = Math.max(
          0.05,
          (top ? anchor[1] - local[1] : local[1] - anchor[1]) /
            Math.max(1, r.h),
        ),
        s = shapeById(selected);
      s.points = g.original.points.map((q) => [
        anchor[0] + (q[0] - anchor[0]) * sx,
        anchor[1] + (q[1] - anchor[1]) * sy,
      ]);
      s.erased = g.original.erased?.map((q) => [
        anchor[0] + (q[0] - anchor[0]) * sx,
        anchor[1] + (q[1] - anchor[1]) * sy,
        q[2] * Math.sqrt(sx * sy),
      ]);
      if (s.type === 'text')
        s.fontSize = Math.max(
          8,
          (g.original.fontSize || 24) * Math.max(sx, sy),
        );
      const next = bounds(s),
        center = [next.x + next.w / 2, next.y + next.h / 2],
        worldCenter = turn(
          center,
          [r.x + r.w / 2, r.y + r.h / 2],
          g.original.angle || 0,
        ),
        dx = worldCenter[0] - center[0],
        dy = worldCenter[1] - center[1];
      s.points = s.points.map((q) => [q[0] + dx, q[1] + dy]);
      s.erased = s.erased?.map((q) => [q[0] + dx, q[1] + dy, q[2]]);
      paint();
    }
    if (gesture?.kind === 'pan') {
      view.x = gesture.vx - (e.clientX - gesture.x) / view.zoom;
      view.y = gesture.vy - (e.clientY - gesture.y) / view.zoom;
      paint();
    }
    if (gesture?.kind === 'erase') {
      const a = gesture.last,
        d = Math.hypot(p[0] - a[0], p[1] - a[1]),
        steps = Math.max(
          1,
          Math.ceil(d / (Number($('#eraser-size').value) / 4 / view.zoom)),
        );
      for (let i = 1; i <= steps; i++)
        eraseAt([
          a[0] + ((p[0] - a[0]) * i) / steps,
          a[1] + ((p[1] - a[1]) * i) / steps,
        ]);
      gesture.last = p;
      paint();
    }
    if (gesture?.kind === 'move') {
      const dx = p[0] - gesture.start[0],
        dy = p[1] - gesture.start[1];
      if (!gesture.changed && Math.hypot(dx, dy) * view.zoom < 3) return;
      if (!gesture.changed) {
        checkpoint();
        gesture.changed = true;
      }
      for (const original of gesture.originals || [gesture.original]) {
        const s = shapeById(original.id);
        s.points = original.points.map((q) => [q[0] + dx, q[1] + dy]);
        s.erased = original.erased?.map((q) => [q[0] + dx, q[1] + dy, q[2]]);
      }
      paint();
    }
    if (draft) {
      if (draft.type === 'pen') draft.points.push(p);
      else draft.points[1] = p;
      paint();
    }
  };
  svg.onpointerup = (e) => {
    touches.delete(e.pointerId);
    if (pinch) {
      if (touches.size < 2) pinch = null;
      gesture = null;
      save();
      return;
    }
    if (draft) {
      const a = draft.points[0],
        b = draft.points.at(-1);
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) * view.zoom > 3) {
        checkpoint();
        note.shapes.push(draft);
        selected = draft.id;
      }
      draft = null;
    }
    gesture = null;
    save();
    paint();
  };
  svg.onpointercancel = (e) => {
    touches.delete(e.pointerId);
    pinch = null;
    draft = null;
    if (gesture?.kind === 'move' && gesture.changed) {
      for (const original of gesture.originals || [gesture.original])
        Object.assign(shapeById(original.id), original);
      history.pop();
    }
    gesture = null;
    save();
    paint();
  };
  svg.onpointerleave = () => (cursor.hidden = true);
  svg.ondblclick = (e) => e.preventDefault();
  let wheelSave;
  svg.onwheel = (e) => {
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
    paint();
    clearTimeout(wheelSave);
    wheelSave = setTimeout(save, 200);
  };
  function removeSelected() {
    const ids = new Set([selected, ...multi].filter((id) => shapeById(id)));
    if (!ids.size || $('#dialog').open) return;
    openForm(
      'Delete selected objects?',
      `<p class="dialog-copy">${ids.size} object(s) will be deleted. You can undo this action.</p>`,
      () => {
        checkpoint();
        note.shapes = note.shapes.filter((s) => !ids.has(s.id));
        multi.clear();
        selected = null;
        save();
        paint();
        svg.focus();
      },
    );
    $('.dialog-footer .primary').textContent = 'Delete';
  }

  function zoomBy(f) {
    finishText();
    const r = svg.getBoundingClientRect(),
      cx = view.x + r.width / 2 / view.zoom,
      cy = view.y + r.height / 2 / view.zoom;
    view.zoom = Math.max(0.1, Math.min(4, view.zoom * f));
    view.x = cx - r.width / 2 / view.zoom;
    view.y = cy - r.height / 2 / view.zoom;
    save();
    paint();
  }
  $('#draw-fit').onclick = () => {
    finishText();
    const rs = note.shapes.map(visualBounds);
    if (!rs.length) return;
    const r = svg.getBoundingClientRect(),
      x = Math.min(...rs.map((b) => b.x)),
      y = Math.min(...rs.map((b) => b.y)),
      w = Math.max(...rs.map((b) => b.x + b.w)) - x,
      h = Math.max(...rs.map((b) => b.y + b.h)) - y;
    view.zoom = Math.max(
      0.1,
      Math.min(
        4,
        (r.width - 60) / Math.max(1, w),
        (r.height - 60) / Math.max(1, h),
      ),
    );
    view.x = x + w / 2 - r.width / 2 / view.zoom;
    view.y = y + h / 2 - r.height / 2 / view.zoom;
    save();
    paint();
  };
  $('#draw-zoom-in').onclick = () => zoomBy(1.2);
  $('#draw-zoom-out').onclick = () => zoomBy(1 / 1.2);
  $('#draw-edit-text').onclick = () => {
    const r = svg.getBoundingClientRect();
    editText(selected, [
      view.x + r.width / 2 / view.zoom,
      view.y + r.height / 2 / view.zoom,
    ]);
  };
  $('#draw-delete').onclick = removeSelected;
  $('#draw-reset').onclick = () => {
    finishText();
    Object.assign(view, { x: 0, y: 0, zoom: 1 });
    save();
    paint();
  };
  $('#draw-undo').onclick = () => {
    finishText();
    if (!history.length) return;
    redo.push(JSON.stringify(note.shapes));
    note.shapes = JSON.parse(history.pop());
    multi.clear();
    selected = null;
    save();
    paint();
  };
  $('#draw-redo').onclick = () => {
    if (!redo.length) return;
    history.push(JSON.stringify(note.shapes));
    note.shapes = JSON.parse(redo.pop());
    save();
    paint();
  };
  host.onkeydown = (e) => {
    if (
      e.target.closest('input,textarea,select,[contenteditable=true]') ||
      $('#dialog').open
    )
      return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      multi = new Set(note.shapes.map((s) => s.id));
      selected = note.shapes[0]?.id || null;
      setTool('select');
      paint();
      svg.focus();
      return;
    }
    if (
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      shortcuts[e.key.toLowerCase()]
    ) {
      e.preventDefault();
      setTool(shortcuts[e.key.toLowerCase()]);
      svg.focus();
      return;
    }
    if (e.code === 'Space') {
      space = true;
      e.preventDefault();
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeSelected();
    }
    if (e.key === 'Escape') {
      multi.clear();
      selected = null;
      paint();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      $(e.shiftKey ? '#draw-redo' : '#draw-undo').click();
    }
  };
  svg.onkeyup = (e) => {
    if (e.code === 'Space') space = false;
  };
  svg.onblur = () => (space = false);
  async function png() {
    finishText();
    const rs = note.shapes.map(visualBounds);
    const x = rs.length ? Math.min(...rs.map((r) => r.x)) - 30 : 0,
      y = rs.length ? Math.min(...rs.map((r) => r.y)) - 30 : 0,
      w = rs.length ? Math.max(...rs.map((r) => r.x + r.w)) - x + 30 : 1200,
      h = rs.length ? Math.max(...rs.map((r) => r.y + r.h)) - y + 30 : 800,
      scale = Math.min(1, 2400 / Math.max(w, h));
    const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(w * scale)}" height="${Math.ceil(h * scale)}" viewBox="${x} ${y} ${w} ${h}">${note.shapes.map(shapeMarkup).join('')}</svg>`,
      url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      return await new Promise((resolve) => c.toBlob(resolve, 'image/png'));
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  $('#draw-export').onclick = async () => {
    try {
      const blob = await png(),
        url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = note.name + '.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast('Gambar belum dapat diekspor.');
    }
  };
  $('#draw-copy').onclick = async () => {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': png() }),
      ]);
      toast('Gambar disalin. Paste di note Text.');
    } catch {
      toast('Clipboard tidak tersedia. Gunakan PNG atau screenshot.');
    }
  };
  paint();
  setTool('select');
}
async function pasteNoteImage(event, n, editor) {
  event.preventDefault();
  const file = Array.from(event.clipboardData.items)
    .find((x) => x.type.startsWith('image/'))
    ?.getAsFile();
  if (!file) {
    document.execCommand(
      'insertText',
      false,
      event.clipboardData.getData('text/plain'),
    );
    return;
  }
  const selection = window.getSelection(),
    range = selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  try {
    if (file.size > 15 * 1024 * 1024)
      throw Error('Gambar terlalu besar (maksimal 15 MB).');
    const url = URL.createObjectURL(file);
    let image;
    try {
      image = new Image();
      image.src = url;
      await image.decode();
    } finally {
      URL.revokeObjectURL(url);
    }
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height)),
      c = document.createElement('canvas');
    c.width = Math.round(image.width * scale);
    c.height = Math.round(image.height * scale);
    c.getContext('2d').drawImage(image, 0, 0, c.width, c.height);
    const src = c.toDataURL('image/webp', 0.86);
    if (!editor.isConnected) {
      toast('Kembali ke note tujuan lalu paste lagi.');
      return;
    }
    editor.focus();
    if (range && editor.contains(range.commonAncestorContainer)) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
    editor.addImage(src, c.width, c.height);
  } catch (error) {
    toast(error.message || 'Gambar tidak dapat dibaca.');
  }
}
