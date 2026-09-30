import { expect, it } from 'vitest';
import {
  fromText,
  plainText,
  validateDocument,
  type TextDocument,
} from '../src/lib/text/document';
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
