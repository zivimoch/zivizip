import type { WorkspaceDB } from './storage';
import { api } from './account';

export interface Task {
  id: string;
  title: string;
  date: string;
  amount: number;
  done: boolean;
  archived: boolean;
  createdAt: number;
}
export interface TaskState {
  revision: number;
  items: Task[];
}
export const emptyTasks = (): TaskState => ({ revision: 0, items: [] });
export function validateTasks(items: Task[]): void {
  if (!Array.isArray(items) || items.length > 10000)
    throw Error('Invalid task list');
  const ids = new Set<string>();
  for (const task of items) {
    if (
      !task ||
      typeof task.id !== 'string' ||
      !/^[a-zA-Z0-9-]{1,64}$/.test(task.id) ||
      ids.has(task.id) ||
      typeof task.title !== 'string' ||
      !task.title.trim() ||
      task.title.length > 150 ||
      typeof task.date !== 'string' ||
      (task.date &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(task.date) ||
          !Number.isFinite(Date.parse(task.date)) ||
          new Date(task.date).toISOString().slice(0, 10) !== task.date)) ||
      !Number.isSafeInteger(task.amount) ||
      task.amount < 0 ||
      task.amount > 1e12 ||
      typeof task.done !== 'boolean' ||
      typeof task.archived !== 'boolean' ||
      !Number.isSafeInteger(task.createdAt) ||
      task.createdAt < 0
    )
      throw Error('Invalid task');
    ids.add(task.id);
  }
  if (new TextEncoder().encode(JSON.stringify(items)).length > 2_000_000)
    throw Error('Task list exceeds its limit');
}
export function readTaskState(value: unknown): TaskState {
  if (!value) return emptyTasks();
  // The first local implementation stored an array with no date/archive fields.
  const state: TaskState = Array.isArray(value)
    ? {
        revision: 0,
        items: value.map((task) => ({
          date: '',
          amount: 0,
          archived: false,
          ...task,
        })),
      }
    : (value as TaskState);
  if (!Number.isSafeInteger(state.revision) || state.revision < 0)
    throw Error('Invalid task revision');
  validateTasks(state.items);
  return structuredClone(state);
}
export const visibleTasks = (items: Task[], archived = false) =>
  items
    .filter((t) => t.archived === archived)
    .sort(
      (a, b) =>
        Number(!!b.date) - Number(!!a.date) || a.date.localeCompare(b.date),
    );
export function moveTasks(
  items: Task[],
  ids: Set<string>,
  targetId: string,
  after: boolean,
): Task[] {
  const target = items.find((t) => t.id === targetId);
  if (!target || ids.has(targetId)) return items;
  const visible = visibleTasks(items, target.archived);
  const group = visible.filter((t) => ids.has(t.id));
  if (!group.length) return items;
  const remaining = visible.filter((t) => !group.includes(t));
  remaining.splice(remaining.indexOf(target) + Number(after), 0, ...group);
  const ordered = visibleTasks(remaining, target.archived);
  let index = 0;
  return items.map((t) =>
    t.archived === target.archived ? ordered[index++] : t,
  );
}
export class TasksRepository {
  constructor(
    public db: WorkspaceDB,
    public server: boolean,
    private active = () => true,
  ) {}
  private check() {
    if (!this.active()) throw Error('Workspace changed');
  }
  private async cache(state: TaskState) {
    return this.db.transaction('rw', this.db.meta, async () => {
      this.check();
      const cached = readTaskState((await this.db.meta.get('tasks'))?.value);
      // A delayed refresh must not replace a newer acknowledged write.
      if (cached.revision > state.revision) return cached;
      await this.db.meta.put({ key: 'tasks', value: state });
      return state;
    });
  }
  async list(online = true): Promise<TaskState> {
    this.check();
    const cached = await this.db.meta.get('tasks');
    this.check();
    if (!this.server || !online) return readTaskState(cached?.value);
    let state = await api<TaskState>('/tasks');
    this.check();
    // Existing account-local tasks already belong to this account. Preserve them before replacing its cache.
    if (Array.isArray(cached?.value) && cached.value.length) {
      const legacy = readTaskState(cached.value).items;
      state = await api<TaskState>('/tasks', 'PUT', {
        ...state,
        items: [
          ...state.items,
          ...legacy.filter((t) => !state.items.some((s) => s.id === t.id)),
        ],
      });
      this.check();
    }
    state = readTaskState(state);
    return this.cache(state);
  }
  async write(state: TaskState, items: Task[]): Promise<TaskState> {
    this.check();
    validateTasks(items);
    if (this.server) {
      const saved = readTaskState(
        await api<TaskState>('/tasks', 'PUT', {
          revision: state.revision,
          items,
        }),
      );
      this.check();
      return this.cache(saved);
    }
    return this.db.transaction('rw', this.db.meta, async () => {
      this.check();
      const current = readTaskState((await this.db.meta.get('tasks'))?.value);
      if (current.revision !== state.revision)
        throw Error(
          'Tasks changed in another tab. Reload the list and try again.',
        );
      const saved = {
        revision: state.revision + 1,
        items: structuredClone(items),
      };
      await this.db.meta.put({ key: 'tasks', value: saved });
      return saved;
    });
  }
  async merge(items: Task[]) {
    const state = await this.list();
    return this.write(state, [
      ...state.items,
      ...items.map((t) => ({ ...t, id: crypto.randomUUID() })),
    ]);
  }
}
