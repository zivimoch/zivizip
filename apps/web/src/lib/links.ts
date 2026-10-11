export function linkParts(text: string): { text: string; href?: string }[] {
  const result: { text: string; href?: string }[] = [];
  const pattern = /(?:https?:\/\/|www\.)[^\s<>]+/gi;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index!;
    const value = match[0].replace(/[.,;:!?)}\]]+$/, '');
    let href: string;
    try {
      const url = new URL(
        value.startsWith('www.') ? `https://${value}` : value,
      );
      if (!['https:', 'http:'].includes(url.protocol)) continue;
      href = url.href;
    } catch {
      continue;
    }
    if (start > offset) result.push({ text: text.slice(offset, start) });
    result.push({ text: value, href });
    offset = start + value.length;
  }
  if (offset < text.length) result.push({ text: text.slice(offset) });
  return result;
}
export function linkify(element: HTMLElement) {
  const text = element.textContent || '';
  const parts = linkParts(text);
  if (!parts.some((part) => part.href) && !element.querySelector('a')) return;
  const selection = window.getSelection();
  let offset: number | undefined;
  if (
    selection?.isCollapsed &&
    selection.anchorNode &&
    element.contains(selection.anchorNode)
  ) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    offset = range.toString().length;
  }
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    if (node.parentElement?.closest('a')) continue;
    const fragments = linkParts(node.textContent || '');
    if (!fragments.some((part) => part.href)) continue;
    node.replaceWith(
      ...fragments.map((part) => {
        if (!part.href) return document.createTextNode(part.text);
        const a = document.createElement('a');
        a.href = part.href;
        a.textContent = part.text;
        a.className = 'content-link';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        return a;
      }),
    );
  }
  if (offset !== undefined && selection) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    let remaining = offset;
    while ((node = walker.nextNode())) {
      const length = node.textContent?.length || 0;
      if (remaining <= length) {
        selection.collapse(node, remaining);
        break;
      }
      remaining -= length;
    }
  }
}
