function mountNoteImages(n, editor) {
  const host = editor.parentElement;
  host.classList.add('text-surface');
  n.images ??= [];
  // Migrate previously pasted inline images while retaining the surrounding text.
  editor.querySelectorAll('img').forEach((img) => {
    n.images.push({
      id: uid(),
      src: img.src,
      x: 0,
      y: img.offsetTop,
      w: Math.min(500, host.clientWidth),
      h:
        (Math.min(500, host.clientWidth) * (img.naturalHeight || 2)) /
        (img.naturalWidth || 3),
    });
    img.remove();
  });
  Array.from(editor.childNodes)
    .filter((n) => n.nodeType === 3)
    .forEach((n) => {
      const span = document.createElement('span');
      n.replaceWith(span);
      span.append(n);
    });
  const layer = document.createElement('div');
  layer.className = 'note-image-layer';
  host.prepend(layer);
  let active = null,
    allSelected = false;
  host.tabIndex = -1;
  function persist() {
    n.body = editor.innerText;
    n.bodyHtml = cleanBody(editor.innerHTML);
    save();
  }
  function anchorFor(im) {
    return editor.querySelector(`[data-image-anchor="${im.id}"]`);
  }
  function syncAnchors() {
    const r = host.getBoundingClientRect();
    n.images.forEach((im) => {
      const anchor = anchorFor(im);
      if (anchor) {
        anchor.style.display = 'block';
        anchor.style.width = Math.min(im.w, host.clientWidth) + 'px';
        anchor.style.height = im.h + 20 + 'px';
        const a = anchor.getBoundingClientRect();
        im.x = a.left - r.left + (im.offsetX || 0);
        im.y = a.top - r.top + (im.offsetY || 0);
      }
    });
  }
  function paint() {
    syncAnchors();
    layer.innerHTML = n.images
      .map(
        (im) =>
          `<div class="placed-image ${allSelected || active === im.id ? 'selected' : ''}" data-image="${im.id}" style="left:${im.x}px;top:${im.y}px;width:${im.w}px;height:${im.h}px;transform:rotate(${im.angle || 0}deg)"><img src="${im.src}" alt="Note image" draggable="false">${allSelected || active === im.id ? `${[0, 1, 2, 3].map((c) => `<button class="image-resize corner-${c}" data-corner="${c}" aria-label="Resize image" title="Drag to resize"></button>`).join('')}<button class="image-rotate" aria-label="Rotate image" title="Drag to rotate">↻</button><div class="image-actions"><button data-delete-image="${im.id}" aria-label="Delete image" title="Delete image"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg></button></div>` : ''}</div>`,
      )
      .join('');
    host.style.minHeight =
      Math.max(400, ...n.images.map((i) => i.y + i.h + 60)) + 'px';
    layer.querySelectorAll('[data-image]').forEach((box) => {
      const im = n.images.find((i) => i.id === box.dataset.image);
      box.onpointerdown = (e) => {
        if (e.target.closest('[data-delete-image]')) return;
        e.preventDefault();
        e.stopPropagation();
        const rotating = !!e.target.closest('.image-rotate'),
          rect = host.getBoundingClientRect(),
          center = [rect.left + im.x + im.w / 2, rect.top + im.y + im.h / 2],
          initialAngle = Math.atan2(
            e.clientY - center[1],
            e.clientX - center[0],
          );
        const handle = e.target.closest('.image-resize'),
          resize = !!handle,
          corner = Number(handle?.dataset.corner ?? 3),
          start = { ...im, x: e.clientX, y: e.clientY };
        allSelected = false;
        active = im.id;
        host.focus({ preventScroll: true });
        getSelection().removeAllRanges();
        box.classList.add('selected');
        box.setPointerCapture(e.pointerId);
        box.onpointermove = (ev) => {
          const dx = ev.clientX - start.x,
            dy = ev.clientY - start.y;
          if (rotating) {
            im.angle =
              (start.angle || 0) +
              ((Math.atan2(ev.clientY - center[1], ev.clientX - center[0]) -
                initialAngle) *
                180) /
                Math.PI;
          } else if (resize) {
            const left = corner % 2 === 0,
              top = corner < 2;
            const horizontal = (left ? -dx : dx) / start.w,
              vertical = (top ? -dy : dy) / start.h;
            const factor = Math.max(
              0.1,
              1 +
                (Math.abs(horizontal) >= Math.abs(vertical)
                  ? horizontal
                  : vertical),
            );
            im.w = Math.max(
              40,
              Math.min(
                left ? start.imageX + start.w : host.clientWidth - start.imageX,
                start.w * factor,
              ),
            );
            im.h = (start.h * im.w) / start.w;
            im.x = left ? start.imageX + start.w - im.w : start.imageX;
            im.y = top
              ? Math.max(0, start.imageY + start.h - im.h)
              : start.imageY;
          } else {
            im.x = Math.max(
              0,
              Math.min(Math.max(0, host.clientWidth - im.w), start.imageX + dx),
            );
            im.y = Math.max(0, start.imageY + dy);
          }
          Object.assign(box.style, {
            left: im.x + 'px',
            top: im.y + 'px',
            width: im.w + 'px',
            height: im.h + 'px',
            transform: `rotate(${im.angle || 0}deg)`,
          });
        };
        start.imageX = im.x;
        start.imageY = im.y;
        box.onpointerup = () => {
          box.onpointermove = null;
          const anchor = anchorFor(im);
          if (anchor) {
            const a = anchor.getBoundingClientRect(),
              r = host.getBoundingClientRect();
            im.offsetX = im.x - (a.left - r.left);
            im.offsetY = im.y - (a.top - r.top);
          }
          paint();
          persist();
        };
        box.onpointercancel = () => {
          Object.assign(im, {
            x: start.imageX,
            y: start.imageY,
            w: start.w,
            h: start.h,
            angle: start.angle || 0,
          });
          paint();
        };
      };
      box
        .querySelector('[data-delete-image]')
        ?.addEventListener('click', () => {
          anchorFor(im)?.remove();
          n.images = n.images.filter((i) => i.id !== im.id);
          active = null;
          persist();
          paint();
        });
    });
  }
  // Preserve native editing, caret placement and text selection. Only blank image areas initiate dragging.
  host.onpointerdown = (e) => {
    if (e.target.closest('.placed-image')) return;
    if (editor.contains(e.target)) {
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let text,
        overText = false;
      while ((text = walker.nextNode())) {
        if (!text.textContent.trim()) continue;
        const r = document.createRange();
        r.selectNodeContents(text);
        if (
          [...r.getClientRects()].some(
            (b) =>
              e.clientX >= b.left &&
              e.clientX <= b.right &&
              e.clientY >= b.top &&
              e.clientY <= b.bottom,
          )
        ) {
          overText = true;
          break;
        }
      }
      if (!overText) {
        const r = host.getBoundingClientRect(),
          x = e.clientX - r.left,
          y = e.clientY - r.top;
        const image = [...n.images].reverse().find((i) => {
          const a = (-(i.angle || 0) * Math.PI) / 180,
            cx = i.x + i.w / 2,
            cy = i.y + i.h / 2,
            px = cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a),
            py = cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a);
          return px >= i.x && px <= i.x + i.w && py >= i.y && py <= i.y + i.h;
        });
        if (image) {
          layer.querySelector(`[data-image="${image.id}"]`).onpointerdown(e);
          return;
        }
      }
    }
    if (active || allSelected) {
      active = null;
      allSelected = false;
      paint();
    }
    if (e.target === host) {
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  };
  // Select all includes independent image objects as well as the native text selection.
  host.onkeydown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      allSelected = true;
      active = null;
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      paint();
      return;
    }
    if (e.key === 'Escape') {
      allSelected = false;
      active = null;
      paint();
      return;
    }
    if (
      (e.key === 'Delete' || e.key === 'Backspace') &&
      (allSelected || active)
    ) {
      e.preventDefault();
      if (allSelected) {
        n.images = [];
        editor.innerHTML = '';
      } else {
        const im = n.images.find((i) => i.id === active);
        if (im) anchorFor(im)?.remove();
        n.images = n.images.filter((i) => i.id !== active);
      }
      allSelected = false;
      active = null;
      persist();
      paint();
      editor.focus();
      return;
    }
    if (e.key.startsWith('Arrow')) {
      allSelected = false;
      active = null;
      paint();
    }
  };
  let protectedAnchors = [],
    stationaryImages = [];
  function captureImagePositions() {
    stationaryImages = [];
    const selection = getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0).cloneRange();
    if (!editor.contains(range.startContainer)) return;
    range.collapse(true);
    let rect = range.getClientRects()[0];
    if (!rect || !rect.height) {
      const node =
        range.startContainer.nodeType === 1
          ? range.startContainer
          : range.startContainer.parentElement;
      rect = node.getBoundingClientRect();
    }
    const top = rect.top - host.getBoundingClientRect().top;
    stationaryImages = n.images
      .filter((im) => anchorFor(im) && top > im.y + 2)
      .map((im) => ({ im, y: im.y }));
  }

  editor.addEventListener('beforeinput', (e) => {
    captureImagePositions();
    protectedAnchors =
      e.inputType.startsWith('delete') && !allSelected
        ? [...editor.querySelectorAll('[data-image-anchor]')].map((node) => ({
            node,
            parent: node.parentNode,
            next: node.nextSibling,
          }))
        : [];
    if (allSelected && e.inputType.startsWith('insert')) {
      n.images = [];
      allSelected = false;
      paint();
    }
  });
  editor.addEventListener('input', () => {
    allSelected = false;
    for (const a of protectedAnchors) {
      if (!editor.contains(a.node)) {
        const parent = editor.contains(a.parent) ? a.parent : editor;
        parent.insertBefore(
          a.node,
          a.next?.parentNode === parent ? a.next : null,
        );
      }
    }
    protectedAnchors = [];
    const hostTop = host.getBoundingClientRect().top;
    for (const { im, y } of stationaryImages) {
      const anchor = anchorFor(im);
      if (anchor)
        im.offsetY = y - (anchor.getBoundingClientRect().top - hostTop);
    }
    stationaryImages = [];
    paint();
    persist();
  });
  editor.addImage = (src, w, h) => {
    const selection = getSelection();
    let range = selection.rangeCount
      ? selection.getRangeAt(0).cloneRange()
      : null;
    let y = editor.scrollHeight;
    if (range && editor.contains(range.startContainer)) {
      const rect = range.getBoundingClientRect(),
        r = host.getBoundingClientRect();
      y = Math.max(0, rect.bottom - r.top);
    } else {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    const width = Math.min(w, host.clientWidth * 0.85, 650),
      height = (h * width) / w;
    const image = {
      id: uid(),
      src,
      x: 0,
      y,
      w: width,
      h: height,
      anchored: true,
      offsetX: 0,
      offsetY: 0,
    };
    n.images.push(image);
    active = null;
    // Reserve a normal-flow gap initially. Moving the image later leaves text independent.
    const spacer = document.createElement('span');
    spacer.dataset.imageAnchor = image.id;
    spacer.style.display = 'block';
    spacer.style.width = width + 'px';
    spacer.className = 'image-flow-gap';
    spacer.style.height = height + 20 + 'px';
    spacer.setAttribute('contenteditable', 'false');
    spacer.innerHTML = '&#8203;';
    const paragraph = document.createElement('div');
    paragraph.innerHTML = '<br>';
    range.deleteContents();
    range.insertNode(paragraph);
    range.insertNode(spacer);
    editor.focus();
    const caret = document.createRange();
    caret.setStart(paragraph, 0);
    caret.collapse(true);
    selection.removeAllRanges();
    selection.addRange(caret);
    paint();
    persist();
    paragraph.scrollIntoView({ block: 'nearest' });
  };
  const observer = new ResizeObserver(() => {
    if (!host.isConnected) {
      observer.disconnect();
      return;
    }
    syncAnchors();
    layer.querySelectorAll('[data-image]').forEach((box) => {
      const im = n.images.find((i) => i.id === box.dataset.image);
      if (im) Object.assign(box.style, { left: im.x + 'px', top: im.y + 'px' });
    });
  });
  observer.observe(editor);
  host.cleanupImages = () => observer.disconnect();
  paint();
  persist();
}
