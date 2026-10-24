import { api, ApiError } from '../account';
import type { Note, WorkspaceDB } from '../storage';
import { Y, LOCAL, write, snapshot, encode, decode } from './document';
export type SaveState = 'connecting' | 'saving' | 'saved' | 'offline' | 'error';
interface Reply {
  metadata: Omit<Note, 'body' | 'rich'>;
  editable: boolean;
  state: string;
  vector: string;
}
export class Room {
  readonly doc = new Y.Doc();
  readonly undo = new Y.UndoManager(
    [
      this.doc.getText('text'),
      this.doc.getMap('images'),
      this.doc.getMap('shapes'),
      this.doc.getMap('order'),
    ],
    { trackedOrigins: new Set([LOCAL]) },
  );
  private note: Note;
  private vector: Uint8Array = new Uint8Array([0]);
  private ready = false;
  private connected = false;
  private permission = false;
  private dirty = false;
  private version = 0;
  private busy = false;
  private resume: (() => void) | undefined;
  private closed = false;
  private blocked = false;
  private timer?: ReturnType<typeof setTimeout>;
  private request?: Promise<void>;
  private persist = Promise.resolve();
  private key: string;
  constructor(
    note: Note,
    private path: string,
    private db: WorkspaceDB | undefined,
    private change: (note: Note) => void,
    private status: (
      state: SaveState,
      writable: boolean,
      pending: boolean,
    ) => void,
    private error: (e: unknown) => void,
    private valid: () => boolean = () => true,
  ) {
    this.note = note;
    this.key = `note-pending:${note.id}`;
    this.undo.on('stack-item-added', () => {
      if (this.undo.undoStack.length > 80) this.undo.undoStack.shift();
      if (this.undo.redoStack.length > 80) this.undo.redoStack.shift();
    });
    this.doc.on('update', (_update: Uint8Array, origin: unknown) => {
      if (
        this.closed ||
        !this.valid() ||
        (origin !== LOCAL && origin !== this.undo)
      )
        return;
      this.dirty = true;
      this.version++;
      this.publish();
      const value = encode(Y.encodeStateAsUpdate(this.doc));
      if (this.db)
        this.persist = this.persist
          .then(async () => {
            if (this.valid()) await this.db!.meta.put({ key: this.key, value });
          })
          .catch((e) => this.error(e));
      this.state();
      this.schedule(450);
    });
    window.addEventListener('online', this.connectivity);
    window.addEventListener('offline', this.connectivity);
    void this.start();
  }
  private async start() {
    try {
      const pending = await this.db?.meta.get(this.key);
      if (typeof pending?.value === 'string') {
        Y.applyUpdate(this.doc, decode(pending.value), 'restore');
        this.dirty = true;
      }
      await this.flush();
    } catch (e) {
      this.error(e);
      this.state();
    }
  }
  private connectivity = () => {
    if (!navigator.onLine) this.connected = false;
    this.state();
    if (navigator.onLine) void this.flush();
  };
  private state() {
    const state: SaveState = !navigator.onLine
      ? 'offline'
      : this.blocked
        ? 'error'
        : !this.ready
          ? 'connecting'
          : !this.connected
            ? 'error'
            : this.dirty
              ? 'saving'
              : 'saved';
    if (this.closed || !this.valid()) return;
    this.status(
      state,
      this.ready &&
        this.connected &&
        this.permission &&
        navigator.onLine &&
        !this.blocked,
      this.dirty,
    );
  }
  private publish() {
    this.note = snapshot(this.doc, this.note);
    this.change(this.note);
  }
  edit(body: string, rich?: Note['rich']) {
    if (
      !this.ready ||
      !this.connected ||
      !this.permission ||
      !navigator.onLine ||
      this.blocked
    )
      return;
    write(this.doc, { ...this.note, body, rich });
  }
  history(forward: boolean) {
    if (
      !this.connected ||
      !navigator.onLine ||
      !this.permission ||
      this.blocked
    )
      return;
    if (forward) this.undo.redo();
    else this.undo.undo();
  }
  setBusy(value: boolean) {
    this.busy = value;
    if (!value) {
      this.resume?.();
      this.resume = undefined;
      this.schedule(100);
    }
  }
  private schedule(delay: number) {
    clearTimeout(this.timer);
    if (!this.closed && this.valid() && !this.blocked)
      this.timer = setTimeout(() => void this.flush(), delay);
  }
  flush(): Promise<void> {
    if (this.request) return this.request;
    if (
      this.closed ||
      !this.valid() ||
      this.busy ||
      !navigator.onLine ||
      this.blocked
    ) {
      this.state();
      this.schedule(1000);
      return Promise.resolve();
    }
    this.request = this.exchange().finally(() => {
      this.request = undefined;
      this.schedule(this.dirty ? 450 : 1000);
    });
    return this.request;
  }
  private async exchange() {
    const sentVersion = this.version;
    try {
      const reply = await api<Reply>(this.path, 'POST', {
        vector: encode(Y.encodeStateVector(this.doc)),
        ...(this.dirty
          ? { update: encode(Y.encodeStateAsUpdate(this.doc, this.vector)) }
          : {}),
      });
      // Finish local gestures/composition against their original CRDT baseline.
      if (this.busy && !this.closed)
        await new Promise<void>((resolve) => (this.resume = resolve));
      if (this.closed || !this.valid()) return;
      Y.applyUpdate(this.doc, decode(reply.state), 'remote');
      this.vector = decode(reply.vector);
      this.note = snapshot(this.doc, { ...this.note, ...reply.metadata });
      this.permission = reply.editable;
      this.ready = true;
      this.connected = true;
      this.dirty = this.version !== sentVersion;
      this.change(this.note);
      if (this.db) {
        const note = this.note;
        this.persist = this.persist.then(async () => {
          if (this.closed || !this.valid()) return;
          await this.db!.notes.put(note);
          if (!this.dirty && this.version === sentVersion)
            await this.db!.meta.delete(this.key);
        });
        await this.persist;
      }
    } catch (e) {
      this.connected = false;
      this.blocked =
        e instanceof ApiError && [400, 401, 403, 404, 413].includes(e.status);
      if (!this.closed && this.valid()) this.error(e);
    } finally {
      this.state();
    }
  }
  close() {
    this.closed = true;
    this.resume?.();
    clearTimeout(this.timer);
    window.removeEventListener('online', this.connectivity);
    window.removeEventListener('offline', this.connectivity);
    // Pending state is retained separately from canonical snapshots for retry on reopening.
    void Promise.allSettled([this.request, this.persist]).then(() => {
      this.undo.destroy();
      this.doc.destroy();
    });
  }
}
