import type { WorkspaceDB } from './storage';
import { api } from './account';
import type { Task } from './tasks';
import type { Transaction } from './finance';
export const covers = ['forest', 'lake', 'sunrise'] as const;
export interface Goal {
  id: string;
  title: string;
  description: string;
  cover: string;
  seed?: string;
  theme?: 'island' | 'garden' | 'space';
  generatorVersion?: 1 | 2;
  order?: string[];
  completed?: boolean;
  tasks: string[];
  expenses: string[];
}
export interface GoalState {
  revision: number;
  items: Goal[];
  setAside?: string[];
}
export const emptyGoals = (): GoalState => ({ revision: 0, items: [] });
export function validateGoals(items: Goal[]) {
  if (!Array.isArray(items) || items.length > 1000)
    throw Error('Invalid goals');
  const ids = new Set<string>();
  const validId = (id: unknown): id is string =>
    typeof id === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(id);
  for (const g of items) {
    if (
      !g ||
      !validId(g.id) ||
      (g.theme !== undefined &&
        !['island', 'garden', 'space'].includes(g.theme)) ||
      (g.generatorVersion !== undefined &&
        ![1, 2].includes(g.generatorVersion)) ||
      (g.seed !== undefined && !validId(g.seed)) ||
      (g.completed !== undefined && typeof g.completed !== 'boolean') ||
      ids.has(g.id) ||
      typeof g.title !== 'string' ||
      !g.title.trim() ||
      g.title.length > 150 ||
      typeof g.description !== 'string' ||
      g.description.length > 2000 ||
      !['', ...covers].includes(g.cover)
    )
      throw Error('Invalid goal');
    ids.add(g.id);
    const tasks = new Set<string>(),
      expenses = new Set<string>();
    for (const [links, seen] of [
      [g.tasks, tasks],
      [g.expenses, expenses],
    ] as const) {
      if (!Array.isArray(links) || links.length > 10000)
        throw Error('Invalid goal assignments');
      for (const id of links) {
        if (!validId(id) || seen.has(id))
          throw Error('Duplicate or invalid assignment');
        seen.add(id);
      }
    }
    if (g.order !== undefined) {
      const keys = new Set([
        ...g.tasks.map((id) => 'task:' + id),
        ...g.expenses.map((id) => 'expense:' + id),
      ]);
      if (
        !Array.isArray(g.order) ||
        g.order.length > 20000 ||
        new Set(g.order).size !== g.order.length ||
        g.order.some((key) => !keys.has(key))
      )
        throw Error('Invalid contribution order');
    }
  }
  if (new TextEncoder().encode(JSON.stringify(items)).length > 2_000_000)
    throw Error('Goals exceed their limit');
}
export function validateSetAside(keys: unknown) {
  if (
    !Array.isArray(keys) ||
    keys.length > 20000 ||
    new Set(keys).size !== keys.length ||
    keys.some(
      (key) =>
        typeof key !== 'string' ||
        !/^(task|expense):[a-zA-Z0-9-]{1,64}$/.test(key),
    )
  )
    throw Error('Invalid set-aside items');
}
export function remapItemKeys(
  keys: string[],
  tasks: Map<string, string>,
  expenses: Map<string, string>,
) {
  return keys.flatMap((key) => {
    const [type, id] = key.split(':');
    const mapped = (type === 'task' ? tasks : expenses).get(id);
    return mapped ? [type + ':' + mapped] : [];
  });
}
export function readGoalState(value: unknown): GoalState {
  if (!value) return emptyGoals();
  const s = value as GoalState;
  if (!Number.isSafeInteger(s.revision) || s.revision < 0)
    throw Error('Invalid goals revision');
  validateGoals(s.items);
  validateSetAside(s.setAside || []);
  return structuredClone(s);
}
export function goalTotals(goal: Goal, tasks: Task[], expenses: Transaction[]) {
  return {
    tasks: tasks.filter((t) => t.done && goal.tasks.includes(t.id)).length,
    amount: expenses
      .filter((t) => t.type === 'expense' && goal.expenses.includes(t.id))
      .reduce((n, t) => n + t.amount, 0),
  };
}
export function goalKeys(g: Goal): string[] {
  return [
    ...new Set([
      ...(g.order || []),
      ...g.tasks.map((id) => 'task:' + id).reverse(),
      ...g.expenses.map((id) => 'expense:' + id).reverse(),
    ]),
  ];
}
export function remapGoals(
  items: Goal[],
  tasks: Map<string, string>,
  expenses: Map<string, string>,
): Goal[] {
  return items.map((g) => ({
    ...g,
    seed: g.seed || g.id,
    order: goalKeys(g).flatMap((key) => {
      const [type, id] = key.split(':');
      const mapped = (type === 'task' ? tasks : expenses).get(id);
      return mapped ? [type + ':' + mapped] : [];
    }),
    id: crypto.randomUUID(),
    tasks: g.tasks.flatMap((id) => (tasks.has(id) ? [tasks.get(id)!] : [])),
    expenses: g.expenses.flatMap((id) =>
      expenses.has(id) ? [expenses.get(id)!] : [],
    ),
  }));
}
export class GoalsRepository {
  constructor(
    public db: WorkspaceDB,
    public server: boolean,
    private active = () => true,
  ) {}
  private check() {
    if (!this.active()) throw Error('Workspace changed');
  }
  private async cache(state: GoalState) {
    return this.db.transaction('rw', this.db.meta, async () => {
      this.check();
      const cached = readGoalState((await this.db.meta.get('goals'))?.value);
      // A delayed refresh must not replace a newer acknowledged write.
      if (cached.revision > state.revision) return cached;
      await this.db.meta.put({ key: 'goals', value: state });
      return state;
    });
  }
  async list(online = true): Promise<GoalState> {
    this.check();
    const cached = await this.db.meta.get('goals');
    this.check();
    if (!this.server || !online) return readGoalState(cached?.value);
    let state = await api<GoalState>('/goals');
    this.check();
    state = readGoalState(state);
    return this.cache(state);
  }
  async write(
    state: GoalState,
    items: Goal[],
    setAside = state.setAside || [],
  ): Promise<GoalState> {
    this.check();
    validateGoals(items);
    validateSetAside(setAside);
    if (
      new TextEncoder().encode(JSON.stringify({ items, setAside })).length >
      2_000_000
    )
      throw Error('Goals exceed their limit');
    if (this.server) {
      const saved = readGoalState(
        await api<GoalState>('/goals', 'PUT', {
          revision: state.revision,
          items,
          setAside,
        }),
      );
      this.check();
      return this.cache(saved);
    }
    return this.db.transaction('rw', this.db.meta, async () => {
      this.check();
      const current = readGoalState((await this.db.meta.get('goals'))?.value);
      if (current.revision !== state.revision)
        throw Error(
          'Goals changed in another tab. Reload the list and try again.',
        );
      const saved = {
        revision: state.revision + 1,
        items: structuredClone(items),
        setAside: [...setAside],
      };
      await this.db.meta.put({ key: 'goals', value: saved });
      return saved;
    });
  }
  async merge(items: Goal[], setAside: string[] = []) {
    const state = await this.list();
    return this.write(
      state,
      [
        ...state.items,
        ...items.filter((g) => !state.items.some((old) => old.id === g.id)),
      ],
      [...new Set([...(state.setAside || []), ...setAside])],
    );
  }
}
