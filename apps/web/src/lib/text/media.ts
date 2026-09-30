import type { WorkspaceDB } from '../storage';
export interface Media {
  id: string;
  blob: Blob;
}
export interface MediaBackup {
  id: string;
  data: string;
}
export const MAX_MEDIA = 1_000_000;
export async function hashBlob(blob: Blob) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export async function prepareImage(file: Blob): Promise<Blob> {
  if (file.size > 15_000_000) throw Error('Maximum image input: 15 MB');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas
      .getContext('2d')!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(Error('Image conversion failed'))),
        'image/webp',
        0.88,
      ),
    );
    if (blob.type !== 'image/webp' || blob.size > MAX_MEDIA)
      throw Error('Image exceeds 1 MB after compression. Use a smaller image.');
    return blob;
  } finally {
    bitmap.close();
  }
}
export async function putMedia(
  db: WorkspaceDB,
  blob: Blob,
  server: boolean,
  active = () => true,
): Promise<string> {
  const id = await hashBlob(blob);
  if (!active()) throw Error('Workspace changed');
  if (server) {
    const response = await fetch('/api/media/' + id, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'image/webp', 'X-Zivizip': '1' },
      body: blob,
    });
    if (!response.ok) throw Error('Image upload failed');
  }
  if (!active()) throw Error('Workspace changed');
  await db.media.put({ id, blob });
  return id;
}
export async function getMedia(
  db: WorkspaceDB,
  id: string,
  server: boolean,
  active = () => true,
): Promise<Blob> {
  if (!active()) throw Error('Workspace changed');
  const local = await db.media.get(id);
  if (!active()) throw Error('Workspace changed');
  if (local) return local.blob;
  if (!server || !active())
    throw Error('Image is not available on this device');
  const response = await fetch('/api/media/' + id, {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) throw Error('Image is not available');
  const blob = await response.blob();
  if (!active()) throw Error('Workspace changed');
  if (
    blob.type !== 'image/webp' ||
    blob.size > MAX_MEDIA ||
    (await hashBlob(blob)) !== id
  )
    throw Error('Invalid image data');
  if (!active()) throw Error('Workspace changed');
  await db.media.put({ id, blob });
  return blob;
}
export async function encodeMedia(media: Media): Promise<MediaBackup> {
  const bytes = new Uint8Array(await media.blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { id: media.id, data: btoa(binary) };
}
export async function decodeMedia(media: MediaBackup): Promise<Media> {
  if (
    !/^[a-f0-9]{64}$/.test(media.id) ||
    typeof media.data !== 'string' ||
    media.data.length > 1_333_336
  )
    throw Error('Invalid backup image');
  const bytes = Uint8Array.from(atob(media.data), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: 'image/webp' });
  if (
    bytes.length > MAX_MEDIA ||
    new TextDecoder().decode(bytes.slice(0, 4)) !== 'RIFF' ||
    new TextDecoder().decode(bytes.slice(8, 12)) !== 'WEBP' ||
    (await hashBlob(blob)) !== media.id
  )
    throw Error('Invalid backup image');
  return { id: media.id, blob };
}
