import { drawAssets } from './draw/scene';
import { assetsIn, type TextDocument } from './text/document';
export const noteAssets = (note: {
  kind?: string;
  body: string;
  rich?: TextDocument | null;
}) =>
  note.kind === 'draw'
    ? drawAssets(note.body)
    : assetsIn(note.rich || undefined);
