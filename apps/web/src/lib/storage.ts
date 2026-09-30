import Dexie, { type Table } from 'dexie';
export interface Note {
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
  version: 1;
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
  }
}
export interface NotesRepository {
  list(): Promise<Note[]>;
  create(name: string, category: string, icon: string): Promise<Note>;
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
  async create(name: string, category: string, icon: string) {
    const now = Date.now();
    const n: Note = {
      id: crypto.randomUUID(),
      name,
      category,
      icon,
      body: '',
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
    b.version !== 1 ||
    !Array.isArray(b.notes) ||
    b.notes.length > 10000
  )
    throw new Error('Unsupported backup format');
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
      typeof n.body !== 'string' ||
      n.body.length > 2_000_000 ||
      ![n.revision, n.createdAt, n.updatedAt].every(Number.isFinite) ||
      n.revision < 1
    )
      throw new Error('Invalid note in backup');
    ids.add(n.id);
  }
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
export async function exportWorkspace(db: WorkspaceDB): Promise<Backup> {
  return db.transaction('r', db.notes, db.preferences, async () => ({
    format: 'zivizip',
    version: 1,
    exportedAt: new Date().toISOString(),
    notes: await db.notes.toArray(),
    preferences: (await db.preferences.get('workspace')) || { ...defaults },
  }));
}
// Merge always creates new IDs: importing never overwrites a local note.
export async function importWorkspace(db: WorkspaceDB, input: unknown) {
  const b = validateBackup(input);
  return db.transaction('rw', db.notes, db.preferences, async () => {
    const ids = new Map(b.notes.map((n) => [n.id, crypto.randomUUID()]));
    const notes = b.notes.map((n) => ({
      ...n,
      id: ids.get(n.id)!,
      revision: 1,
    }));
    await db.notes.bulkAdd(notes);
    const pref = (await db.preferences.get('workspace')) || { ...defaults };
    pref.open = [...pref.open, ...b.preferences.open.map((id) => ids.get(id)!)];
    pref.active = b.preferences.active
      ? ids.get(b.preferences.active)!
      : pref.active;
    pref.counter = Math.max(pref.counter, b.preferences.counter);
    await db.preferences.put(pref);
    return notes.length;
  });
}
