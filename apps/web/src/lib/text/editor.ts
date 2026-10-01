import {
  fromText,
  plainText,
  validateDocument,
  type TextDocument,
  type TextImage,
  type Block,
} from './document';
import { listItem, listPrefix, nestedPrefix } from './lists';
import { prepareImage } from './media';
import { turn, type Point } from '../draw/scene';
interface Options {
  body: string;
  rich?: TextDocument;
  writable: boolean;
  language: 'en' | 'id';
  change: (body: string, rich?: TextDocument) => void;
  put: (blob: Blob) => Promise<string>;
  get: (id: string) => Promise<Blob>;
  busy: (value: boolean) => void;
  error: (error: unknown) => void;
  toolbar?: HTMLElement;
}
export function mountText(host: HTMLElement, options: Options) {
  let opts = options,
    doc = structuredClone(opts.rich || fromText(opts.body));
  validateDocument(doc);
  let accepted = JSON.stringify(doc),
    active: string | null = null,
    all = false,
    dead = false,
    uploading = false;
  let history: string[] = [],
    redo: string[] = [],
    before = accepted,
    stationary: { id: string; y: number }[] = [];
  let gesture: {
    id: string;
    kind: 'move' | 'resize' | 'rotate';
    corner: number;
    start: Point;
    image: TextImage;
    x: number;
    y: number;
    angle: number;
    before: string;
  } | null = null;
  const t = (en: string, id: string) => (opts.language === 'id' ? id : en);
  const abort = new AbortController(),
    urls = new Map<string, string>(),
    loading = new Set<string>();
  const editor = document.createElement('div'),
    layer = document.createElement('div'),
    controls = document.createElement('div'),
    tools = document.createElement('div'),
    status = document.createElement('div');
  host.classList.add('text-surface');
  host.tabIndex = -1;
  editor.className = 'text-content';
  editor.role = 'textbox';
  editor.setAttribute('aria-multiline', 'true');
  editor.setAttribute('aria-label', t('Note content', 'Isi catatan'));
  editor.spellcheck = true;
  layer.className = 'text-image-layer';
  controls.className = 'text-image-controls';
  tools.className = 'text-image-tools';
  status.className = 'text-image-status';
  status.role = 'status';
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'image/*';
  file.hidden = true;
  const add = document.createElement('button');
  add.type = 'button';
  add.textContent = t('Add image', 'Tambah gambar');
  add.setAttribute('aria-label', t('Add image', 'Tambah gambar'));
  add.onpointerdown = (e) => e.preventDefault();
  add.onclick = () => {
    savedRange = range();
    file.click();
  };
  tools.append(add, file);
  (opts.toolbar || host).append(tools);
  host.append(layer, editor, controls, status);
  const positions = new Map<string, { x: number; y: number }>();
  let savedRange: Range | null = null;
  const anchor = (id: string) =>
    editor.querySelector<HTMLElement>(`[data-image-anchor="${id}"]`);
  function range(): Range | null {
    const sel = getSelection();
    return sel?.rangeCount && editor.contains(sel.anchorNode)
      ? sel.getRangeAt(0).cloneRange()
      : null;
  }
  function paragraph(text = '', height?: number) {
    const p = document.createElement('div');
    p.className = 'text-paragraph';
    if (height !== undefined) {
      p.dataset.height = String(height);
      if (!text) {
        p.style.minHeight = p.style.lineHeight = height + 'px';
      }
    }
    if (text) p.textContent = text;
    else p.append(document.createElement('br'));
    return p;
  }
  function spacer(id: string) {
    const p = document.createElement('div');
    p.dataset.imageAnchor = id;
    p.contentEditable = 'false';
    p.className = 'text-image-anchor';
    p.setAttribute('aria-label', t('Image', 'Gambar'));
    return p;
  }
  function render() {
    editor.replaceChildren(
      ...doc.blocks.map((b) =>
        b.type === 'paragraph' ? paragraph(b.text, b.height) : spacer(b.id),
      ),
    );
    if (!editor.childNodes.length) editor.append(paragraph());
    markLists();
    paint();
  }
  function markLists() {
    for (const child of editor.children) {
      if (child instanceof HTMLElement)
        child.draggable = !!listItem(child.textContent || '');
    }
  }
  editor.addEventListener('dragstart', (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const selection = range();
    const paragraphs = [...editor.children].filter(
      (el) => el instanceof HTMLElement && el.draggable,
    );
    const rows =
      selection && !selection.collapsed
        ? paragraphs.filter((el) => selection.intersectsNode(el))
        : paragraphs.filter((el) => el === target || el.contains(target));
    const titles = rows
      .map((el) => listItem(el.textContent || '')?.content.trim())
      .filter((title): title is string => !!title);
    if (!event.dataTransfer || !titles.length) return;
    event.dataTransfer.setData(
      'application/x-zivizip-list',
      JSON.stringify(titles),
    );
    event.dataTransfer.setData('text/plain', titles.join('\n'));
    event.dataTransfer.effectAllowed = 'copy';
  });
  function read() {
    const blocks: Block[] = [];
    editor.childNodes.forEach((node) => {
      if (node instanceof HTMLElement && node.dataset.imageAnchor) {
        blocks.push({ type: 'image', id: node.dataset.imageAnchor });
        return;
      }
      const text =
        node instanceof HTMLElement ? node.innerText : node.textContent || '';
      const lines = text === '\n' ? [''] : text.split('\n');
      for (const text of lines)
        blocks.push({
          type: 'paragraph',
          text,
          ...(node instanceof HTMLElement && node.dataset.height && !text
            ? { height: Number(node.dataset.height) }
            : {}),
        });
    });
    doc.blocks = blocks.length ? blocks : [{ type: 'paragraph', text: '' }];
  }
  function persist(previous = accepted) {
    read();
    markLists();
    validateDocument(doc);
    const next = JSON.stringify(doc);
    if (next === previous) return;
    history.push(previous);
    while (
      history.length > 80 ||
      history.reduce((a, b) => a + b.length, 0) > 4_000_000
    )
      history.shift();
    redo = [];
    accepted = next;
    opts.change(
      plainText(doc),
      doc.images.length ||
        doc.blocks.some((b) => b.type === 'paragraph' && b.height !== undefined)
        ? structuredClone(doc)
        : undefined,
    );
  }
  function emit() {
    accepted = JSON.stringify(doc);
    opts.change(
      plainText(doc),
      doc.images.length ||
        doc.blocks.some((b) => b.type === 'paragraph' && b.height !== undefined)
        ? structuredClone(doc)
        : undefined,
    );
  }
  function caret(p: Node, offset = 0) {
    editor.focus();
    const r = document.createRange();
    r.setStart(p, offset);
    r.collapse(true);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(r);
  }
  function endCaret() {
    const p = editor.lastChild || editor.appendChild(paragraph());
    if (p instanceof HTMLElement && p.dataset.imageAnchor) {
      const next = paragraph();
      editor.append(next);
      caret(next);
    } else {
      const r = document.createRange();
      r.selectNodeContents(p);
      r.collapse(false);
      editor.focus();
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(r);
    }
  }
  function targetParagraph(r: Range): HTMLElement {
    let el =
      r.startContainer instanceof HTMLElement
        ? r.startContainer
        : r.startContainer.parentElement!;
    while (el.parentElement !== editor && el !== editor) el = el.parentElement!;
    return el;
  }
  function splitAtCaret(imageId?: string) {
    const r = range();
    if (!r) {
      endCaret();
      return splitAtCaret(imageId);
    }
    const kept = all
      ? []
      : [...editor.querySelectorAll<HTMLElement>('[data-image-anchor]')].map(
          (node) => ({ node, index: [...editor.childNodes].indexOf(node) }),
        );
    if (all) {
      doc.images = doc.images.filter((im) => im.id === imageId);
      all = false;
    }
    r.deleteContents();
    const block = targetParagraph(r);
    const left = r.cloneRange();
    left.selectNodeContents(block);
    left.setEnd(r.startContainer, r.startOffset);
    const right = r.cloneRange();
    right.selectNodeContents(block);
    right.setStart(r.endContainer, r.endOffset);
    const a = paragraph(left.toString()),
      b = paragraph(right.toString());
    const nodes = [
      ...(!imageId || left.toString() ? [a] : []),
      ...(imageId ? [spacer(imageId)] : []),
      b,
    ];
    if (block === editor) editor.replaceChildren(...nodes);
    else block.replaceWith(...nodes);
    for (const a of kept)
      if (!editor.contains(a.node))
        editor.insertBefore(a.node, editor.childNodes[a.index] || null);
    caret(b);
    return b;
  }
  function setParagraphText(
    p: HTMLElement,
    text: string,
    offset = text.length,
  ) {
    delete p.dataset.height;
    p.style.minHeight = p.style.lineHeight = '';
    p.replaceChildren(document.createTextNode(text));
    caret(p.firstChild!, Math.max(0, Math.min(offset, text.length)));
  }
  function enterParagraph() {
    const previous = accepted,
      r = range();
    const original = r ? targetParagraph(r) : null;
    const item = original ? listItem(original.textContent || '') : null;
    if (r?.collapsed && item && !item.content.trim()) {
      setParagraphText(original!, '');
      persist(previous);
      paint();
      return;
    }
    let y = 0;
    if (r) {
      let b = r.getClientRects()[0];
      if (!b?.height) b = targetParagraph(r).getBoundingClientRect();
      y = b.top - editor.getBoundingClientRect().top;
    }
    const keep = doc.images
      .filter((im) => y > (positions.get(im.id)?.y || 0) + 2)
      .map((im) => ({ im, y: positions.get(im.id)!.y }));
    const next = splitAtCaret();
    if (item && next) {
      const prefix = listPrefix(item.kind, item.depth, item.value + 1);
      setParagraphText(next, prefix + (next.textContent || ''), prefix.length);
    }
    paint();
    for (const k of keep) k.im.dy += k.y - (positions.get(k.im.id)?.y ?? k.y);
    persist(previous);
    paint();
  }
  function indentList(backward: boolean) {
    const r = range();
    if (!r) return false;
    const p = targetParagraph(r),
      item = listItem(p.textContent || '');
    if (!item) return false;
    const prefix = r.cloneRange();
    prefix.selectNodeContents(p);
    prefix.setEnd(r.startContainer, r.startOffset);
    const offset = prefix.toString().length;
    const preceding = [...editor.children]
      .slice(0, [...editor.children].indexOf(p))
      .map((el) => el.textContent || '');
    const next = nestedPrefix(item, backward, preceding),
      previous = accepted;
    setParagraphText(
      p,
      next + item.content,
      Math.max(next.length, offset + next.length - item.prefix.length),
    );
    persist(previous);
    paint();
    return true;
  }
  function overText(x: number, y: number) {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (!node.textContent?.trim()) continue;
      const r = document.createRange();
      r.selectNodeContents(node);
      if (
        [...r.getClientRects()].some(
          (b) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom,
        )
      )
        return true;
    }
    return false;
  }
  function paint() {
    if (dead) return;
    const rect = editor.getBoundingClientRect();
    const retained = new Set(doc.images.map((im) => im.asset));
    for (const [id, url] of urls)
      if (!retained.has(id)) {
        URL.revokeObjectURL(url);
        urls.delete(id);
        loading.delete(id);
      }
    for (const im of doc.images) {
      const a = anchor(im.id);
      if (a) {
        a.style.height = `${im.flow ?? im.h}px`;
        a.style.width = '100%';
        const r = a.getBoundingClientRect();
        positions.set(im.id, {
          x: r.left - rect.left + im.dx,
          y: r.top - rect.top + im.dy,
        });
      }
    }
    layer.style.top = controls.style.top = editor.offsetTop + 'px';
    layer.replaceChildren();
    controls.replaceChildren();
    for (const im of doc.images) {
      const p = positions.get(im.id);
      if (!p) continue;
      const box = document.createElement('div');
      box.className = 'text-image';
      box.dataset.image = im.id;
      Object.assign(box.style, {
        left: p.x + 'px',
        top: p.y + 'px',
        width: im.w + 'px',
        height: im.h + 'px',
        transform: `rotate(${im.angle}deg)`,
      });
      if (urls.has(im.asset)) {
        const img = document.createElement('img');
        img.src = urls.get(im.asset)!;
        img.alt = t('Note image', 'Gambar catatan');
        img.draggable = false;
        box.append(img);
      } else {
        box.textContent = t('Loading image…', 'Memuat gambar…');
        if (!loading.has(im.asset)) {
          loading.add(im.asset);
          opts
            .get(im.asset)
            .then((blob) => {
              if (!dead) urls.set(im.asset, URL.createObjectURL(blob));
            })
            .catch(() => {
              if (!dead)
                status.textContent = t(
                  'An image is not cached. Reconnect and reopen this note.',
                  'Gambar belum tersimpan lokal. Sambungkan jaringan dan buka kembali catatan.',
                );
            })
            .finally(() => {
              if (!dead) paint();
            });
        }
      }
      layer.append(box);
      if ((active === im.id || all) && opts.writable) {
        const frame = document.createElement('div');
        frame.className = 'image-selection';
        frame.dataset.image = im.id;
        frame.style.cssText = box.style.cssText;
        for (let i = 0; i < 4; i++) {
          const h = document.createElement('button');
          h.type = 'button';
          h.className = 'image-resize corner-' + i;
          h.dataset.corner = String(i);
          h.setAttribute('aria-label', t('Resize image', 'Ubah ukuran gambar'));
          frame.append(h);
        }
        const rotate = document.createElement('button');
        rotate.type = 'button';
        rotate.className = 'image-rotate';
        rotate.innerHTML =
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9a8 8 0 1 1 0 6M4 3v6h6"/></svg>';
        rotate.setAttribute('aria-label', t('Rotate image', 'Putar gambar'));
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'image-delete';
        del.setAttribute('aria-label', t('Delete image', 'Hapus gambar'));
        del.innerHTML =
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15"/></svg>';
        del.onpointerdown = (e) => {
          e.preventDefault();
          e.stopPropagation();
        };
        del.onpointerup = (e) => {
          e.preventDefault();
          e.stopPropagation();
          remove(im.id);
        };
        del.onclick = () => remove(im.id);
        if (p.y + editor.offsetTop - host.scrollTop < 50)
          rotate.style.top = '4px';
        frame.append(rotate, del);
        controls.append(frame);
      }
    }
  }
  function remove(id: string) {
    if (!opts.writable) return;
    const before = accepted;
    doc.images = doc.images.filter((im) => im.id !== id);
    anchor(id)?.remove();
    active = null;
    all = false;
    persist(before);
    paint();
    editor.focus();
  }
  function deleteAdjacentImage(backward: boolean) {
    const r = range();
    if (!r?.collapsed) return false;
    const p = targetParagraph(r),
      prefix = r.cloneRange();
    prefix.selectNodeContents(p);
    prefix.setEnd(r.startContainer, r.startOffset);
    const boundary = backward
      ? !prefix.toString()
      : prefix.toString() === p.textContent;
    const neighbor = backward ? p.previousSibling : p.nextSibling;
    if (
      !boundary ||
      !(neighbor instanceof HTMLElement) ||
      !neighbor.dataset.imageAnchor
    )
      return false;
    remove(neighbor.dataset.imageAnchor);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(r);
    return true;
  }
  async function insert(file: Blob) {
    if (!opts.writable || uploading) return;
    const previousRange = savedRange || range();
    savedRange = null;
    uploading = true;
    opts.busy(true);
    editor.contentEditable = 'false';
    status.textContent = t('Preparing image…', 'Menyiapkan gambar…');
    try {
      const blob = await prepareImage(file),
        bitmap = await createImageBitmap(blob);
      const asset = await opts.put(blob);
      if (dead) return;
      const w = Math.min(
          bitmap.width,
          Math.max(60, editor.clientWidth * 0.85),
          650,
        ),
        h = Math.max(10, (bitmap.height * w) / bitmap.width);
      bitmap.close();
      editor.contentEditable = String(opts.writable);
      if (!opts.writable) return;
      if (previousRange && editor.contains(previousRange.startContainer)) {
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(previousRange);
      } else endCaret();
      const before = accepted,
        id = crypto.randomUUID();
      doc.images.push({
        id,
        asset,
        w: Math.max(20, w),
        h,
        dx: 0,
        dy: 0,
        angle: 0,
      });
      urls.set(asset, URL.createObjectURL(blob));
      splitAtCaret(id);
      all = false;
      active = null;
      persist(before);
      paint();
      status.textContent = '';
    } catch (e) {
      opts.error(e);
      status.textContent = t(
        'Could not add image. Try a smaller file.',
        'Gambar tidak dapat ditambahkan. Coba berkas lebih kecil.',
      );
    } finally {
      uploading = false;
      if (!dead) editor.contentEditable = String(opts.writable);
      opts.busy(false);
    }
  }
  file.onchange = () => {
    if (file.files?.[0]) void insert(file.files[0]);
    file.value = '';
  };
  editor.addEventListener('paste', (e) => {
    e.preventDefault();
    if (!opts.writable) return;
    const image = [...(e.clipboardData?.items || [])]
      .find((x) => x.type.startsWith('image/'))
      ?.getAsFile();
    if (image) {
      savedRange = range();
      void insert(image);
      return;
    }
    const text = e.clipboardData?.getData('text/plain') || '';
    const r = range();
    if (!r) return;
    // Plain text only: pasted HTML never becomes executable markup.
    const previous = accepted;
    const kept = all
      ? []
      : [...editor.querySelectorAll<HTMLElement>('[data-image-anchor]')].map(
          (node) => ({ node, index: [...editor.childNodes].indexOf(node) }),
        );
    if (all) {
      doc.images = [];
      all = false;
    }
    r.deleteContents();
    const node = document.createTextNode(text);
    r.insertNode(node);
    for (const a of kept)
      if (!editor.contains(a.node))
        editor.insertBefore(a.node, editor.childNodes[a.index] || null);
    caret(node, node.length);
    persist(previous);
    paint();
  });
  editor.addEventListener('beforeinput', (e) => {
    if (!opts.writable) {
      e.preventDefault();
      return;
    }
    if ((e as InputEvent).inputType === 'insertParagraph') {
      e.preventDefault();
      enterParagraph();
      return;
    }
    before = accepted;
    stationary = [];
    const r = range();
    if (r) {
      let b = r.getClientRects()[0];
      if (!b?.height) b = targetParagraph(r).getBoundingClientRect();
      const y = b.top - editor.getBoundingClientRect().top;
      stationary = doc.images
        .filter((im) => y > (positions.get(im.id)?.y || 0) + 2)
        .map((im) => ({ id: im.id, y: positions.get(im.id)!.y }));
    }
    const inputType = (e as InputEvent).inputType;
    if (
      inputType === 'deleteContentBackward' ||
      inputType === 'deleteContentForward'
    ) {
      if (deleteAdjacentImage(inputType === 'deleteContentBackward')) {
        e.preventDefault();
        return;
      }
    }
    if (all && (e as InputEvent).inputType.startsWith('insert')) {
      doc.images = [];
      all = false;
    }
  });
  editor.addEventListener('input', (e) => {
    const selection = range();
    if (selection?.collapsed && !(e as InputEvent).isComposing) {
      const p = targetParagraph(selection),
        text = p.textContent || '',
        item = listItem(text);
      if (item && !item.content && /^[ \t]*[-*][ \u00a0]$/.test(text))
        setParagraphText(p, listPrefix('bullet', item.depth));
      if (p.dataset.height && p.textContent) {
        delete p.dataset.height;
        p.style.minHeight = p.style.lineHeight = '';
      }
    }
    // Native range deletion can remove image anchors along with selected text.
    doc.images = doc.images.filter((im) => anchor(im.id));
    paint();
    for (const p of stationary) {
      const im = doc.images.find((im) => im.id === p.id),
        current = positions.get(p.id);
      if (im && current) im.dy += p.y - current.y;
    }
    stationary = [];
    all = false;
    active = null;
    if (!(e as InputEvent).isComposing) {
      try {
        persist(before);
      } catch (e) {
        opts.error(e);
      }
    }
    paint();
  });
  editor.addEventListener('compositionstart', () => opts.busy(true));
  editor.addEventListener('compositionend', () => {
    persist(before);
    opts.busy(false);
  });
  host.addEventListener('keydown', (e) => {
    if (
      !opts.writable ||
      e.isComposing ||
      !(e.target instanceof Element) ||
      e.target.closest('input')
    )
      return;
    const cmd = e.ctrlKey || e.metaKey;
    if (cmd && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      all = true;
      active = null;
      editor.focus();
      const r = document.createRange();
      r.selectNodeContents(editor);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(r);
      paint();
      return;
    }
    if (cmd && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      const from = e.shiftKey ? redo : history,
        to = e.shiftKey ? history : redo;
      if (from.length) {
        to.push(accepted);
        doc = JSON.parse(from.pop()!);
        active = null;
        all = false;
        render();
        emit();
        endCaret();
      }
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && (all || active)) {
      e.preventDefault();
      if (all) {
        const previous = accepted;
        doc = fromText('');
        render();
        persist(previous);
        all = false;
        active = null;
        endCaret();
      } else remove(active!);
      return;
    }
    if (e.key === 'Escape' || e.key.startsWith('Arrow')) {
      all = false;
      active = null;
      paint();
    }
    if (e.key === 'Tab' && indentList(e.shiftKey)) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter' && !cmd) {
      e.preventDefault();
      enterParagraph();
      return;
    }
    if (
      (e.key === 'Backspace' || e.key === 'Delete') &&
      deleteAdjacentImage(e.key === 'Backspace')
    )
      e.preventDefault();
  });
  host.addEventListener('pointerdown', (e) => {
    const el = e.target as Element;
    if (el.closest('.text-image-tools,.image-delete')) return;
    if (!opts.writable) return;
    const rect = editor.getBoundingClientRect(),
      p: Point = [e.clientX - rect.left, e.clientY - rect.top];
    const control = el.closest<HTMLElement>('.image-selection'),
      over = overText(e.clientX, e.clientY);
    const im = control
      ? doc.images.find((im) => im.id === control.dataset.image)
      : !over
        ? [...doc.images].reverse().find((im) => {
            const at = positions.get(im.id)!;
            const q = turn(p, [at.x + im.w / 2, at.y + im.h / 2], -im.angle);
            return (
              q[0] >= at.x &&
              q[0] <= at.x + im.w &&
              q[1] >= at.y &&
              q[1] <= at.y + im.h
            );
          })
        : undefined;
    if (!im) {
      active = null;
      all = false;
      paint();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    active = im.id;
    all = false;
    getSelection()?.removeAllRanges();
    host.focus({ preventScroll: true });
    const at = positions.get(im.id)!;
    gesture = {
      id: im.id,
      kind: el.closest('.image-rotate')
        ? 'rotate'
        : el.closest('.image-resize')
          ? 'resize'
          : 'move',
      corner: Number(
        el.closest<HTMLElement>('[data-corner]')?.dataset.corner || 0,
      ),
      start: p,
      image: structuredClone(im),
      x: at.x,
      y: at.y,
      angle: Math.atan2(p[1] - at.y - im.h / 2, p[0] - at.x - im.w / 2),
      before: accepted,
    };
    host.setPointerCapture(e.pointerId);
    opts.busy(true);
    paint();
  });
  host.addEventListener('pointermove', (e) => {
    if (!gesture) return;
    const g = gesture,
      im = doc.images.find((im) => im.id === g.id)!,
      r = editor.getBoundingClientRect(),
      p: Point = [e.clientX - r.left, e.clientY - r.top],
      dx = p[0] - g.start[0],
      dy = p[1] - g.start[1];
    if (g.kind === 'move') {
      im.dx = g.image.dx + dx;
      im.dy = Math.max(g.image.dy - g.y, g.image.dy + dy);
    }
    if (g.kind === 'rotate')
      im.angle =
        (g.image.angle +
          ((Math.atan2(p[1] - g.y - im.h / 2, p[0] - g.x - im.w / 2) -
            g.angle) *
            180) /
            Math.PI) %
        360;
    if (g.kind === 'resize') {
      const c: Point = [g.x + g.image.w / 2, g.y + g.image.h / 2],
        local = turn(p, c, -g.image.angle),
        start = turn(g.start, c, -g.image.angle),
        left = g.corner % 2 === 0,
        top = g.corner < 2;
      const sx = ((left ? -1 : 1) * (local[0] - start[0])) / g.image.w,
        sy = ((top ? -1 : 1) * (local[1] - start[1])) / g.image.h;
      const factor = Math.min(
        10000 / Math.max(g.image.w, g.image.h),
        Math.max(
          20 / g.image.w,
          10 / g.image.h,
          1 + (Math.abs(sx) > Math.abs(sy) ? sx : sy),
        ),
      );
      im.w = g.image.w * factor;
      im.h = g.image.h * factor;
      const x = left ? g.x + g.image.w - im.w : g.x,
        y = top ? g.y + g.image.h - im.h : g.y,
        nc: Point = [x + im.w / 2, y + im.h / 2],
        wc = turn(nc, c, g.image.angle);
      im.dx = g.image.dx + x - g.x + wc[0] - nc[0];
      im.dy = g.image.dy + y - g.y + wc[1] - nc[1];
    }
    paint();
  });
  host.addEventListener('pointerup', () => {
    if (!gesture) return;
    const previous = gesture.before;
    const im = doc.images.find((im) => im.id === gesture!.id)!;
    if (
      gesture.kind === 'move' &&
      (im.dx !== gesture.image.dx || im.dy !== gesture.image.dy) &&
      (im.flow ?? im.h) > 0
    ) {
      const a = anchor(im.id)!;
      let remaining = im.flow ?? im.h;
      const lines: HTMLElement[] = [];
      const lineHeight = parseFloat(getComputedStyle(editor).lineHeight);
      while (remaining > 0.01) {
        const height = Math.min(remaining, lineHeight);
        lines.push(paragraph('', height));
        remaining -= height;
      }
      im.flow = 0;
      a.after(...lines);
    }
    gesture = null;
    persist(previous);
    opts.busy(false);
    paint();
  });
  host.addEventListener('pointercancel', () => {
    if (!gesture) return;
    doc = JSON.parse(gesture.before);
    gesture = null;
    opts.busy(false);
    render();
  });
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!host.contains(e.target as Node)) {
        active = null;
        all = false;
        paint();
      }
    },
    { signal: abort.signal },
  );
  const resizeObserver = new ResizeObserver(paint);
  resizeObserver.observe(editor);
  render();
  editor.contentEditable = String(opts.writable);
  editor.setAttribute('aria-readonly', String(!opts.writable));
  add.disabled = !opts.writable;
  return {
    update(next: Options) {
      opts = next;
      editor.contentEditable = String(opts.writable && !uploading);
      editor.setAttribute('aria-readonly', String(!opts.writable));
      add.disabled = !opts.writable || uploading;
      const nextDoc = JSON.stringify(next.rich || fromText(next.body));
      if (nextDoc !== accepted && !gesture && !uploading) {
        doc = JSON.parse(nextDoc);
        validateDocument(doc);
        accepted = nextDoc;
        history = [];
        redo = [];
        render();
      }
    },
    destroy() {
      dead = true;
      abort.abort();
      resizeObserver.disconnect();
      for (const url of urls.values()) URL.revokeObjectURL(url);
      tools.remove();
      host.replaceChildren();
      opts.busy(false);
    },
  };
}
