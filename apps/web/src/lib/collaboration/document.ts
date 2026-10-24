import * as Y from 'yjs';
import Delta from 'quill-delta';
import type { Note } from '../storage';
import {
  fromText,
  plainText,
  validateDocument,
  type TextDocument,
  type TextRun,
  type Block,
} from '../text/document';
import { parseScene } from '../draw/scene';
export { Y };
export const LOCAL = 'editor';
export function delta(doc: TextDocument): Delta {
  const result = new Delta();
  for (const b of doc.blocks) {
    if (b.type === 'image') result.insert({ image: b.id });
    else {
      for (const run of b.runs || [{ text: b.text }]) {
        const { text, ...attributes } = run;
        if (text) result.insert(text, attributes);
      }
      result.insert({
        paragraph: true,
        ...(b.height === undefined ? {} : { height: b.height }),
        ...(b.rule ? { rule: true } : {}),
      });
    }
  }
  return result;
}
function syncMap(map: Y.Map<string>, values: { id: string }[]) {
  const ids = new Set(values.map((v) => v.id));
  for (const key of map.keys()) if (!ids.has(key)) map.delete(key);
  for (const value of values) {
    const json = JSON.stringify(value);
    if (map.get(value.id) !== json) map.set(value.id, json);
  }
}
export function write(doc: Y.Doc, note: Note) {
  doc.transact(() => {
    if (note.kind === 'draw') {
      const scene = parseScene(note.body);
      syncMap(doc.getMap('shapes'), scene.shapes);
      const order = doc.getMap<number>('order');
      for (const [i, shape] of scene.shapes.entries())
        if (!order.has(shape.id)) order.set(shape.id, i);
    } else {
      const rich = note.rich || fromText(note.body);
      const text = doc.getText('text');
      const difference = new Delta(text.toDelta()).diff(delta(rich));
      if (difference.ops.length) text.applyDelta(difference.ops);
      syncMap(doc.getMap('images'), rich.images);
    }
  }, LOCAL);
}
export function snapshot(doc: Y.Doc, note: Note): Note {
  if (note.kind === 'draw') {
    const order = doc.getMap<number>('order');
    const shapes = [...doc.getMap<string>('shapes').values()]
      .map((v) => JSON.parse(v))
      .sort(
        (a, b) =>
          (order.get(a.id) || 0) - (order.get(b.id) || 0) ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
    const body = JSON.stringify({ version: 1, shapes });
    parseScene(body);
    return { ...note, body, rich: undefined };
  }
  const blocks: Block[] = [],
    runs: TextRun[] = [];
  const images = doc.getMap<string>('images');
  const used = new Set<string>();
  function paragraph(extra: Record<string, unknown> = {}) {
    blocks.push({
      type: 'paragraph',
      text: runs.map((r) => r.text).join(''),
      ...(runs.some((r) => Object.keys(r).length > 1)
        ? { runs: structuredClone(runs) }
        : {}),
      ...extra,
    });
    runs.length = 0;
  }
  for (const op of doc.getText('text').toDelta()) {
    if (typeof op.insert === 'string')
      runs.push({ text: op.insert, ...op.attributes });
    else if (op.insert?.paragraph)
      paragraph({
        ...(op.insert.height === undefined ? {} : { height: op.insert.height }),
        ...(op.insert.rule ? { rule: true } : {}),
      });
    else if (
      typeof op.insert?.image === 'string' &&
      images.has(op.insert.image) &&
      !used.has(op.insert.image)
    ) {
      if (runs.length) paragraph();
      used.add(op.insert.image);
      blocks.push({ type: 'image', id: op.insert.image });
    }
  }
  if (runs.length || !blocks.length) paragraph();
  const rich: TextDocument = {
    version: 1,
    blocks,
    images: [...used].map((id) => JSON.parse(images.get(id)!)),
  };
  validateDocument(rich);
  return { ...note, body: plainText(rich), rich };
}
export function encode(bytes: Uint8Array): string {
  let value = '';
  for (let i = 0; i < bytes.length; i += 8192)
    value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value);
}
export const decode = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
