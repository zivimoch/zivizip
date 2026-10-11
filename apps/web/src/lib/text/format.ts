import type { TextRun } from './document';

export function readRuns(element: HTMLElement): TextRun[] {
  const runs: TextRun[] = [];
  function visit(node: Node, style: Omit<TextRun, 'text'>) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (text) runs.push({ ...style, text });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === 'BR') {
      runs.push({ ...style, text: '\n' });
      return;
    }
    const next = { ...style };
    if (node.style.fontWeight === 'normal' || node.style.fontWeight === '400')
      delete next.bold;
    if (node.style.fontStyle === 'normal') delete next.italic;
    if (node.style.textDecoration === 'none') delete next.underline;
    if (
      ['B', 'STRONG'].includes(node.tagName) ||
      Number(node.style.fontWeight) >= 600 ||
      node.style.fontWeight === 'bold'
    )
      next.bold = true;
    if (['I', 'EM'].includes(node.tagName) || node.style.fontStyle === 'italic')
      next.italic = true;
    if (node.tagName === 'U' || node.style.textDecoration.includes('underline'))
      next.underline = true;
    const color = node.style.color || node.getAttribute('color');
    if (color) {
      if (/^#[\da-f]{6}$/i.test(color)) next.color = color;
      else {
        const channels = color.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
        if (channels)
          next.color =
            '#' +
            channels
              .slice(1)
              .map((v) => Number(v).toString(16).padStart(2, '0'))
              .join('');
      }
    }
    const size = parseInt(node.style.fontSize);
    if (size >= 8 && size <= 72) next.size = size;
    node.childNodes.forEach((child) => visit(child, next));
  }
  element.childNodes.forEach((node) => visit(node, {}));
  // A lone BR is the browser's empty-paragraph placeholder.
  if (element.innerHTML === '<br>') return [];
  if (element.lastChild instanceof HTMLBRElement && runs.at(-1)?.text === '\n')
    runs.pop();
  return runs;
}

export function renderRuns(element: HTMLElement, runs: TextRun[]) {
  element.replaceChildren(
    ...runs.map((run) => {
      const span = document.createElement('span');
      span.textContent = run.text;
      if (run.bold) span.style.fontWeight = '700';
      if (run.italic) span.style.fontStyle = 'italic';
      if (run.underline) span.style.textDecoration = 'underline';
      if (run.color) span.style.color = run.color;
      if (run.size) span.style.fontSize = run.size + 'px';
      return span;
    }),
  );
}
