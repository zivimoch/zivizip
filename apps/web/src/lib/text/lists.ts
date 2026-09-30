export type ListKind = 'bullet' | 'number' | 'letter';
export interface ListItem {
  depth: number;
  kind: ListKind;
  value: number;
  content: string;
  prefix: string;
}
export function listItem(text: string): ListItem | null {
  const match =
    /^([ \t]*)([•*\-]|\d+[.)]|[a-zA-Z]{1,2}[.)])[ \u00a0](.*)$/s.exec(text);
  if (!match) return null;
  const marker = match[2],
    kind: ListKind = /^[•*\-]$/.test(marker)
      ? 'bullet'
      : /^\d/.test(marker)
        ? 'number'
        : 'letter';
  const value =
    kind === 'number'
      ? Number(marker.slice(0, -1))
      : kind === 'letter'
        ? [...marker.slice(0, -1).toLowerCase()].reduce(
            (n, c) => n * 26 + c.charCodeAt(0) - 96,
            0,
          )
        : 1;
  return {
    depth: Math.min(12, Math.floor(match[1].replace(/\t/g, '  ').length / 2)),
    kind,
    value,
    content: match[3],
    prefix: text.slice(0, text.length - match[3].length),
  };
}
export function listPrefix(kind: ListKind, depth: number, value = 1): string {
  let marker = '•';
  if (kind === 'number') marker = Math.max(1, value) + '.';
  if (kind === 'letter') {
    let n = Math.max(1, value);
    marker = '';
    while (n > 0) {
      n--;
      marker = String.fromCharCode(97 + (n % 26)) + marker;
      n = Math.floor(n / 26);
    }
    marker += '.';
  }
  return '  '.repeat(Math.max(0, Math.min(12, depth))) + marker + ' ';
}
export function nestedPrefix(
  item: ListItem,
  backward: boolean,
  preceding: string[],
): string {
  const depth = Math.max(0, Math.min(12, item.depth + (backward ? -1 : 1)));
  if (depth === item.depth) return listPrefix(item.kind, depth, item.value);
  let kind: ListKind =
    item.kind === 'bullet'
      ? 'bullet'
      : item.kind === 'number'
        ? 'letter'
        : 'number';
  let value = 1;
  for (const text of [...preceding].reverse()) {
    const before = listItem(text);
    if (!before || before.depth < depth) break;
    if (before.depth === depth) {
      kind = before.kind;
      value = before.value + 1;
      break;
    }
  }
  return listPrefix(kind, depth, value);
}
