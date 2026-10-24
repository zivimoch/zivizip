import { describe, it, expect } from 'vitest';
import { Y, LOCAL, write, snapshot } from '../src/lib/collaboration/document';
import type { Note } from '../src/lib/storage';
const note: Note = {
  id: 'n',
  name: 'Note',
  category: 'General',
  icon: 'note',
  body: 'Hello world',
  revision: 1,
  createdAt: 1,
  updatedAt: 1,
};
function pair(n = note) {
  const a = new Y.Doc(),
    b = new Y.Doc();
  write(a, n);
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  return { a, b };
}
function merge(a: Y.Doc, b: Y.Doc) {
  const aa = Y.encodeStateAsUpdate(a),
    bb = Y.encodeStateAsUpdate(b);
  Y.applyUpdate(a, bb);
  Y.applyUpdate(b, aa);
}
describe('collaborative notes', () => {
  it('merges concurrent typing and deletion without copying notes', () => {
    const { a, b } = pair();
    write(a, { ...note, body: 'Hello beautiful world' });
    write(b, { ...note, body: 'Hello world!' });
    merge(a, b);
    expect(snapshot(a, note).body).toBe('Hello beautiful world!');
    expect(snapshot(b, note)).toEqual(snapshot(a, note));
    const update = Y.encodeStateAsUpdate(a);
    Y.applyUpdate(a, update);
    Y.applyUpdate(a, update);
    expect(snapshot(a, note).body).toBe('Hello beautiful world!');
  });
  it('keeps remote edits when undoing local edits', () => {
    const { a, b } = pair();
    const undo = new Y.UndoManager(a.getText('text'), {
      trackedOrigins: new Set([LOCAL]),
    });
    write(a, { ...note, body: 'Hello beautiful world' });
    write(b, { ...note, body: 'Hello world!' });
    merge(a, b);
    undo.undo();
    expect(snapshot(a, note).body).toBe('Hello world!');
  });
  it('preserves formatting, soft breaks, image anchors and unicode', () => {
    const n: Note = {
      ...note,
      body: 'Hi 👋\nnext\nBelow',
      rich: {
        version: 1,
        blocks: [
          {
            type: 'paragraph',
            text: 'Hi 👋\nnext',
            runs: [{ text: 'Hi 👋', bold: true }, { text: '\nnext' }],
          },
          { type: 'image', id: 'img' },
          { type: 'paragraph', text: 'Below' },
        ],
        images: [
          {
            id: 'img',
            asset: 'a'.repeat(64),
            w: 100,
            h: 100,
            dx: 0,
            dy: 0,
            angle: 15,
          },
        ],
      },
    };
    const { a, b } = pair(n);
    merge(a, b);
    expect(snapshot(a, n).rich).toEqual(n.rich);
    expect(snapshot(a, n).body).toBe(n.body);
  });
  it('merges edits to independent drawing objects', () => {
    // Use the engine schema rather than a separate drawing representation.
    const n: Note = {
      ...note,
      kind: 'draw',
      body: JSON.stringify({ version: 1, shapes: [] }),
    };
    const { a, b } = pair(n);
    a.getMap('shapes').set(
      'one',
      JSON.stringify({
        id: 'one',
        type: 'rect',
        points: [
          [0, 0],
          [100, 100],
        ],
        color: '#ffffff',
        width: 4,
        angle: 0,
        fontSize: 24,
        text: '',
        erased: [],
      }),
    );
    b.getMap('shapes').set(
      'two',
      JSON.stringify({
        id: 'two',
        type: 'rect',
        points: [
          [200, 0],
          [300, 100],
        ],
        color: '#ffffff',
        width: 4,
        angle: 0,
        fontSize: 24,
        text: '',
        erased: [],
      }),
    );
    merge(a, b);
    expect(JSON.parse(snapshot(a, n).body).shapes).toHaveLength(2);
  });
});
