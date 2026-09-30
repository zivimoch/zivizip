import { emptyScene } from './draw/scene';
import {
  type Note,
  type NoteKind,
  type NotesRepository,
  WorkspaceDB,
} from './storage';
export interface Account {
  id: string;
  username: string;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-Zivizip': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      let message = 'Request failed';
      try {
        message = (await response.json()).error || message;
      } catch {}
      throw new ApiError(response.status, message);
    }
    const text = await response.text();
    return text ? (JSON.parse(text) as T) : (undefined as T);
  } finally {
    clearTimeout(timer);
  }
}
// This repository never queues account writes offline. Guest storage remains separate.
export class AccountNotes implements NotesRepository {
  private active = true;
  constructor(public db: WorkspaceDB) {}
  deactivate() {
    this.active = false;
  }
  private check() {
    if (!this.active) throw new Error('Workspace changed');
  }
  async list() {
    const notes = await api<Note[]>('/notes');
    this.check();
    await this.db.transaction('rw', this.db.notes, async () => {
      this.check();
      await this.db.notes.clear();
      await this.db.notes.bulkPut(notes);
    });
    return notes;
  }
  async create(
    name: string,
    category: string,
    icon: string,
    kind: NoteKind = 'text',
  ) {
    const time = Date.now();
    return this.copy({
      id: crypto.randomUUID(),
      name,
      category,
      icon,
      kind,
      body: kind === 'draw' ? JSON.stringify(emptyScene()) : '',
      revision: 1,
      createdAt: time,
      updatedAt: time,
    });
  }
  async copy(note: Note) {
    const saved = await api<Note>('/notes', 'POST', note);
    this.check();
    await this.db.notes.put(saved);
    return saved;
  }
  async write(note: Note) {
    const saved = await api<Note>(`/notes/${note.id}`, 'PUT', note);
    this.check();
    await this.db.notes.put(saved);
    return saved;
  }
  async remove(id: string) {
    const current = await this.db.notes.get(id);
    if (!current) throw new Error('Note is no longer available');
    await api(`/notes/${id}`, 'DELETE', current);
    await this.db.notes.delete(id);
  }
}
