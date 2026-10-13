import { expect, it } from 'vitest';
import {
  fromText,
  documentSnapshot,
  plainText,
  validateDocument,
  type TextDocument,
} from '../src/lib/text/document';
it('compares text documents independently of API object field order', () => {
  const doc = fromText('First\nLast');
  const reordered: TextDocument = {
    images: [],
    blocks: doc.blocks.map((b) => ({
      text: 'text' in b ? b.text : '',
      type: 'paragraph',
    })),
    version: 1,
  };
  expect(documentSnapshot(reordered)).toBe(documentSnapshot(doc));
  expect(documentSnapshot(fromText('First\nChanged'))).not.toBe(
    documentSnapshot(doc),
  );
  expect(documentSnapshot(fromText('Last\nFirst'))).not.toBe(
    documentSnapshot(doc),
  );
});
it('preserves paragraphs and validates image references without accepting HTML', () => {
  expect(plainText(fromText('First\n\nLast'))).toBe('First\n\nLast');
  const doc: TextDocument = {
    version: 1,
    blocks: [
      { type: 'paragraph', text: '<script>plain text</script>' },
      { type: 'image', id: 'image-1' },
    ],
    images: [
      {
        id: 'image-1',
        asset: 'a'.repeat(64),
        w: 100,
        h: 80,
        dx: 0,
        dy: 0,
        angle: 30,
      },
    ],
  };
  expect(() => validateDocument(doc)).not.toThrow();
  expect(() => validateDocument({ ...doc, blocks: [] })).toThrow();
  expect(() =>
    validateDocument({
      ...doc,
      images: [{ ...doc.images[0], asset: 'https://example.com/image.png' }],
    }),
  ).toThrow();
});

it('validates editable image space without discarding placement metadata', () => {
  const doc = fromText('');
  doc.blocks = [{ type: 'paragraph', text: '', height: 20 }];
  expect(() => validateDocument(doc)).not.toThrow();
  doc.blocks[0] = { type: 'paragraph', text: '', height: -1 };
  expect(() => validateDocument(doc)).toThrow();
});
