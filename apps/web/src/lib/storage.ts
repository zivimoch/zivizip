import {
  validateDocument,
  plainText,
  assetsIn,
  type TextDocument,
} from './text/document';
import {
  encodeMedia,
  decodeMedia,
  type Media,
  type MediaBackup,
} from './text/media';
import { emptyScene, parseScene } from './draw/scene';
import Dexie, { type Table } from 'dexie';
import { readTaskState, validateTasks, type Task } from './tasks';
import {
  readFinanceState,
  validateTransactions,
  type Transaction,
} from './finance';
export type NoteKind = 'text' | 'draw';
export interface Note {
  kind?: NoteKind;
  rich?: TextDocument;
  id: string;
  name: string;
  category: string;
  icon: string;
  body: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
}
export interface Preferences {
  key: 'workspace';
  open: string[];
  active: string | null;
  counter: number;
  language: 'en' | 'id';
  width: number;
  height: number;
}
export interface Backup {
  format: 'zivizip';
  version: 1 | 2 | 3 | 4 | 5;
  tasks?: Task[];
  transactions?: Transaction[];
  media?: MediaBackup[];
  exportedAt: string;
  notes: Note[];
  preferences: Preferences;
}
export const defaults: Preferences = {
  key: 'workspace',
  open: [],
  active: null,
  counter: 0,
  language: 'en',
  width: 75,
  height: 49,
};
export class WorkspaceDB extends Dexie {
  notes!: Table<Note, string>;
  media!: Table<Media, string>;
  preferences!: Table<Preferences, string>;
  meta!: Table<{ key: string; value: unknown }, string>;
  constructor(name = 'zivizip-guest-v1') {
    super(name);
    this.version(1).stores({
      notes: 'id, createdAt, updatedAt, category',
      preferences: 'key',
    });
    this.version(2).stores({
      notes: 'id, createdAt, updatedAt, category',
      preferences: 'key',
      meta: 'key',
    });
    this.version(3).stores({
      notes: 'id, createdAt, updatedAt, category',
      preferences: 'key',
      meta: 'key',
      media: 'id',
    });
  }
}
export interface NotesRepository {
  list(): Promise<Note[]>;
  create(
    name: string,
    category: string,
    icon: string,
    kind?: NoteKind,
  ): Promise<Note>;
  write(note: Note): Promise<Note>;
  remove(id: string): Promise<void>;
}
export class LocalNotes implements NotesRepository {
  constructor(public db: WorkspaceDB) {}
  list() {
    return this.db.notes
      .orderBy('createdAt')
      .toArray()
      .catch(() => this.db.notes.toArray());
  }
  async create(
    name: string,
    category: string,
    icon: string,
    kind: NoteKind = 'text',
  ) {
    const now = Date.now();
    const n: Note = {
      id: crypto.randomUUID(),
      name,
      category,
      icon,
      kind,
      body: kind === 'draw' ? JSON.stringify(emptyScene()) : '',
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.notes.add(n);
    return n;
  }
  async write(note: Note) {
    return this.db.transaction('rw', this.db.notes, async () => {
      const current = await this.db.notes.get(note.id);
      if (!current || current.revision !== note.revision) {
        const copy = {
          ...note,
          id: crypto.randomUUID(),
          name: note.name + ' (conflict copy)',
          revision: 1,
          updatedAt: Date.now(),
        };
        await this.db.notes.add(copy);
        return copy;
      }
      const next = {
        ...note,
        revision: note.revision + 1,
        updatedAt: Date.now(),
      };
      await this.db.notes.put(next);
      return next;
    });
  }
  async remove(id: string) {
    await this.db.notes.delete(id);
  }
}
export function validateBackup(value: unknown): Backup {
  if (!value || typeof value !== 'object') throw new Error('Invalid backup');
  const b = value as Backup;
  if (
    b.format !== 'zivizip' ||
    ![1, 2, 3, 4, 5].includes(b.version) ||
    !Array.isArray(b.notes) ||
    b.notes.length > 10000
  )
    throw new Error('Unsupported backup format');
  if (b.version >= 4 || b.tasks !== undefined) validateTasks(b.tasks!);
  if (b.version >= 5 || b.transactions !== undefined)
    validateTransactions(b.transactions!);
  const ids = new Set<string>();
  for (const n of b.notes) {
    if (
      !n ||
      typeof n.id !== 'string' ||
      !n.id ||
      ids.has(n.id) ||
      typeof n.name !== 'string' ||
      !n.name.trim() ||
      n.name.length > 150 ||
      typeof n.category !== 'string' ||
      n.category.length > 60 ||
      typeof n.icon !== 'string' ||
      (n.kind !== undefined && !['text', 'draw'].includes(n.kind)) ||
      typeof n.body !== 'string' ||
      n.body.length > 2_000_000 ||
      ![n.revision, n.createdAt, n.updatedAt].every(Number.isFinite) ||
      n.revision < 1
    )
      throw new Error('Invalid note in backup');
    if (n.kind === 'draw') parseScene(n.body);
    if (n.rich) {
      if (n.kind === 'draw') throw Error('Invalid rich note');
      validateDocument(n.rich);
      if (plainText(n.rich) !== n.body)
        throw Error('Inconsistent text document');
    }
    ids.add(n.id);
  }
  if (b.media !== undefined && !Array.isArray(b.media))
    throw Error('Invalid backup images');
  const mediaIds = new Set((b.media || []).map((m) => m.id));
  if (mediaIds.size !== (b.media || []).length)
    throw Error('Duplicate backup images');
  for (const n of b.notes)
    for (const id of assetsIn(n.rich))
      if (!mediaIds.has(id)) throw Error('Missing backup image');
  const p = b.preferences;
  if (
    !p ||
    !Array.isArray(p.open) ||
    p.open.some((id) => typeof id !== 'string' || !ids.has(id)) ||
    new Set(p.open).size !== p.open.length ||
    !(p.active === null || p.open.includes(p.active)) ||
    !['en', 'id'].includes(p.language) ||
    !Number.isSafeInteger(p.counter) ||
    p.counter < 0 ||
    !Number.isFinite(p.width) ||
    p.width < 20 ||
    p.width > 85 ||
    !Number.isFinite(p.height) ||
    p.height < 20 ||
    p.height > 80
  )
    throw new Error('Invalid workspace settings');
  return b;
}
export async function exportWorkspace(
  db: WorkspaceDB,
  live?: Note[],
): Promise<Backup> {
  const snapshot = await db.transaction(
    'r',
    db.notes,
    db.preferences,
    db.meta,
    async () => ({
      format: 'zivizip' as const,
      version: 5 as const,
      tasks: readTaskState((await db.meta.get('tasks'))?.value).items,
      transactions: readFinanceState((await db.meta.get('finance'))?.value)
        .items,
      exportedAt: new Date().toISOString(),
      notes: live || (await db.notes.toArray()),
      preferences: (await db.preferences.get('workspace')) || { ...defaults },
    }),
  );
  const ids = [...new Set(snapshot.notes.flatMap((n) => assetsIn(n.rich)))];
  const media: MediaBackup[] = [];
  for (const id of ids) {
    const m = await db.media.get(id);
    if (!m)
      throw Error(
        'Some images are not cached. Open those notes online before exporting.',
      );
    media.push(await encodeMedia(m));
  }
  return { ...snapshot, media };
}
// Merge always creates new IDs: importing never overwrites a local note.
export async function importWorkspace(db: WorkspaceDB, input: unknown) {
  const b = validateBackup(input);
  const media = await Promise.all((b.media || []).map(decodeMedia));
  return db.transaction(
    'rw',
    db.notes,
    db.preferences,
    db.media,
    db.meta,
    async () => {
      if (b.transactions?.length) {
        const current = readFinanceState((await db.meta.get('finance'))?.value);
        const items = [
          ...current.items,
          ...b.transactions.map((item) => ({
            ...item,
            id: crypto.randomUUID(),
          })),
        ];
        validateTransactions(items);
        await db.meta.put({
          key: 'finance',
          value: { revision: current.revision + 1, items },
        });
      }
      if (b.tasks?.length) {
        const current = readTaskState((await db.meta.get('tasks'))?.value);
        const items = [
          ...current.items,
          ...b.tasks.map((t) => ({ ...t, id: crypto.randomUUID() })),
        ];
        validateTasks(items);
        await db.meta.put({
          key: 'tasks',
          value: { revision: current.revision + 1, items },
        });
      }
      await db.media.bulkPut(media);
      const ids = new Map(b.notes.map((n) => [n.id, crypto.randomUUID()]));
      const notes = b.notes.map((n) => ({
        ...n,
        id: ids.get(n.id)!,
        revision: 1,
      }));
      await db.notes.bulkAdd(notes);
      const pref = (await db.preferences.get('workspace')) || { ...defaults };
      pref.open = [
        ...pref.open,
        ...b.preferences.open.map((id) => ids.get(id)!),
      ];
      pref.active = b.preferences.active
        ? ids.get(b.preferences.active)!
        : pref.active;
      pref.counter = Math.max(pref.counter, b.preferences.counter);
      await db.preferences.put(pref);
      return notes.length;
    },
  );
}
