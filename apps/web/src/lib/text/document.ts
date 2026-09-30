export interface TextImage {
  id: string;
  asset: string;
  w: number;
  h: number;
  dx: number;
  dy: number;
  angle: number;
  flow?: number;
}
export type Block =
  | { type: 'paragraph'; text: string; height?: number }
  | { type: 'image'; id: string };
export interface TextDocument {
  version: 1;
  blocks: Block[];
  images: TextImage[];
}
export const fromText = (body: string): TextDocument => ({
  version: 1,
  blocks: body.split('\n').map((text) => ({ type: 'paragraph', text })),
  images: [],
});
export const plainText = (doc: TextDocument) =>
  doc.blocks
    .filter(
      (b): b is Extract<Block, { type: 'paragraph' }> => b.type === 'paragraph',
    )
    .map((b) => b.text)
    .join('\n');
export function validateDocument(doc: TextDocument): void {
  if (
    !doc ||
    doc.version !== 1 ||
    !Array.isArray(doc.blocks) ||
    doc.blocks.length > 20000 ||
    !Array.isArray(doc.images) ||
    doc.images.length > 100
  )
    throw Error('Invalid text document');
  const ids = new Set<string>();
  for (const im of doc.images) {
    if (
      !im ||
      typeof im.id !== 'string' ||
      !/^[a-zA-Z0-9-]{1,64}$/.test(im.id) ||
      ids.has(im.id) ||
      !/^[a-f0-9]{64}$/.test(im.asset) ||
      ![im.w, im.h, im.dx, im.dy, im.angle].every(Number.isFinite) ||
      im.w < 20 ||
      im.w > 10000 ||
      im.h < 10 ||
      im.h > 10000 ||
      Math.abs(im.dx) > 100000 ||
      Math.abs(im.dy) > 100000 ||
      (im.flow !== undefined &&
        (!Number.isFinite(im.flow) || im.flow < 0 || im.flow > 10000)) ||
      Math.abs(im.angle) > 360000
    )
      throw Error('Invalid image placement');
    ids.add(im.id);
  }
  const anchors = new Set<string>();
  for (const b of doc.blocks) {
    if (!b || (b.type !== 'paragraph' && b.type !== 'image'))
      throw Error('Invalid text block');
    if (b.type === 'paragraph') {
      if (
        b.height !== undefined &&
        (!Number.isFinite(b.height) || b.height <= 0 || b.height > 40)
      )
        throw Error('Invalid paragraph spacing');
      if (typeof b.text !== 'string') throw Error('Invalid paragraph');
    } else {
      if (!ids.has(b.id) || anchors.has(b.id))
        throw Error('Invalid image anchor');
      anchors.add(b.id);
    }
  }
  if (
    anchors.size !== ids.size ||
    new TextEncoder().encode(JSON.stringify(doc)).length > 2_000_000
  )
    throw Error('Text document exceeds its limit');
}
export const assetsIn = (rich?: TextDocument) => [
  ...new Set(rich?.images.map((im) => im.asset) || []),
];
