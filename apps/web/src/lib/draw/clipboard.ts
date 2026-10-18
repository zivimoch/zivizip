import { parseScene, type Scene } from './scene';
import { decodeMedia, type MediaBackup } from '../text/media';
export const DRAW_CLIPBOARD = 'zivizip-draw-v1:';
export async function readClipboard(text: string) {
  if (!text.startsWith(DRAW_CLIPBOARD) || text.length > 16_000_000)
    throw Error('Invalid drawing clipboard');
  const payload = JSON.parse(text.slice(DRAW_CLIPBOARD.length));
  const scene: Scene = parseScene(JSON.stringify(payload.scene));
  if (!Array.isArray(payload.media) || payload.media.length > 100)
    throw Error('Invalid clipboard images');
  const ids = new Set(
    scene.shapes.flatMap((s) => (s.type === 'image' ? [s.asset!] : [])),
  );
  if (
    ids.size !== payload.media.length ||
    !payload.media.every((m: MediaBackup) => ids.delete(m.id))
  )
    throw Error('Missing clipboard image');
  const media = await Promise.all(payload.media.map(decodeMedia));
  return { scene, media };
}
