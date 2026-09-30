// Native editable lists: space expands a marker; Tab/Shift+Tab change nesting.
function mountNoteLists(note, editor) {
  function persist() {
    note.body = editor.innerText;
    note.bodyHtml = cleanBody(editor.innerHTML);
    save();
  }
  function decorate() {
    editor.querySelectorAll('li').forEach((li) => {
      li.draggable = true;
      li.title =
        language === 'en'
          ? 'Drag selected items to To do'
          : 'Seret item terpilih ke To do';
    });
  }
  editor.addEventListener('keydown', (e) => {
    const sel = getSelection();
    if (!sel.rangeCount || !editor.contains(sel.anchorNode)) return;
    const el =
      sel.anchorNode.nodeType === 1
        ? sel.anchorNode
        : sel.anchorNode.parentElement;
    const item = el.closest('li');
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      !e.isComposing &&
      sel.isCollapsed &&
      item &&
      !item.textContent.replace(/\u200b/g, '').trim() &&
      !item.querySelector('[data-image-anchor],img')
    ) {
      e.preventDefault();
      // Split the list around the empty item without discarding later items.
      const list = item.parentElement,
        after = list.cloneNode(false);
      while (item.nextSibling) after.append(item.nextSibling);
      const paragraph = document.createElement('div');
      paragraph.append(document.createElement('br'));
      list.after(paragraph);
      if (after.childNodes.length) paragraph.after(after);
      item.remove();
      if (!list.children.length) list.remove();
      const range = document.createRange();
      range.setStart(paragraph, 0);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      persist();
      return;
    }
    if (e.key === 'Tab' && el.closest('li')) {
      e.preventDefault();
      document.execCommand(e.shiftKey ? 'outdent' : 'indent');
      decorate();
      persist();
    }
  });
  editor.addEventListener('input', (e) => {
    decorate();
    if (e.isComposing) return;
    const sel = getSelection();
    if (!sel.isCollapsed || !sel.rangeCount) return;
    const caret = sel.getRangeAt(0),
      element =
        caret.startContainer.nodeType === 1
          ? caret.startContainer
          : caret.startContainer.parentElement;
    if (element.closest('li')) return;
    let block = element.closest('p,div');
    if (!block || !editor.contains(block)) block = editor;
    const before = document.createRange();
    before.selectNodeContents(block);
    before.setEnd(caret.startContainer, caret.startOffset);
    const text = before.toString();
    if (!/^(?:[-*•]|1[.)])\s$/.test(text)) return;
    before.deleteContents();
    sel.removeAllRanges();
    sel.addRange(before);
    document.execCommand(
      text.startsWith('1') ? 'insertOrderedList' : 'insertUnorderedList',
    );
    decorate();
    persist();
  });
  let dragOrigin = null;
  editor.addEventListener('pointerdown', (e) => {
    dragOrigin = e.target.closest('li');
  });
  editor.addEventListener('dragstart', (e) => {
    const anchor = getSelection().anchorNode;
    const anchorElement =
      anchor?.nodeType === 1 ? anchor : anchor?.parentElement;
    const item =
      e.target.closest('li') || dragOrigin || anchorElement?.closest('li');
    if (!item || !e.dataTransfer) return;
    const selection = getSelection();
    let items = [item];
    if (selection.rangeCount && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const chosen = [...editor.querySelectorAll('li')].filter((li) => {
        try {
          return [...li.childNodes].some(
            (node) =>
              !(node.nodeType === 1 && ['UL', 'OL'].includes(node.tagName)) &&
              node.textContent.trim() &&
              range.intersectsNode(node),
          );
        } catch {
          return false;
        }
      });
      if (chosen.includes(item)) items = chosen;
    }
    const titles = items
      .map((li) => {
        const copy = li.cloneNode(true);
        copy.querySelectorAll('ul,ol').forEach((x) => x.remove());
        return copy.textContent.trim();
      })
      .filter(Boolean);
    if (!titles.length) return;
    e.dataTransfer.setData(
      'application/x-zivizip-list',
      JSON.stringify(titles),
    );
    e.dataTransfer.setData('text/plain', titles.join('\n'));
    e.dataTransfer.effectAllowed = 'copy';
    document.querySelector('.tasks-pane').classList.add('list-drop-ready');
  });
  editor.addEventListener('dragend', () =>
    document
      .querySelector('.tasks-pane')
      .classList.remove('list-drop-ready', 'list-drop-over'),
  );
  decorate();
}
window.addEventListener('DOMContentLoaded', () => {
  const panel = document.querySelector('.tasks-pane');
  panel.addEventListener('dragover', (e) => {
    if ([...e.dataTransfer.types].includes('application/x-zivizip-list')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      panel.classList.add('list-drop-over');
    }
  });
  panel.addEventListener('dragleave', (e) => {
    if (!panel.contains(e.relatedTarget))
      panel.classList.remove('list-drop-over');
  });
  panel.addEventListener('drop', (e) => {
    const raw = e.dataTransfer.getData('application/x-zivizip-list');
    panel.classList.remove('list-drop-ready', 'list-drop-over');
    if (!raw) return;
    e.preventDefault();
    try {
      const titles = JSON.parse(raw);
      if (!Array.isArray(titles)) return;
      const valid = titles.filter((t) => typeof t === 'string' && t.trim());
      valid.forEach((title) =>
        state.tasks.push({ id: uid(), title: title.trim(), done: false }),
      );
      save();
      tasksRender();
      toast(
        language === 'en'
          ? `${valid.length} tasks added`
          : `${valid.length} tugas ditambahkan`,
      );
    } catch {
      toast(
        language === 'en'
          ? 'Could not import list'
          : 'Daftar tidak dapat ditambahkan',
      );
    }
  });
});
