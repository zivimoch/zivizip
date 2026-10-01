import type { WorkspaceDB } from './storage';
import { api } from './account';

export interface Transaction {
  id: string;
  type: 'income' | 'expense';
  title: string;
  category: string;
  date: string;
  amount: number;
  createdAt: number;
}
export interface FinanceState {
  revision: number;
  items: Transaction[];
}
export const emptyFinance = (): FinanceState => ({ revision: 0, items: [] });
export function validateTransactions(items: Transaction[]): void {
  if (!Array.isArray(items) || items.length > 10000)
    throw Error('Invalid transaction list');
  const ids = new Set<string>();
  let total = 0;
  for (const item of items) {
    if (
      !item ||
      typeof item.id !== 'string' ||
      !/^[a-zA-Z0-9-]{1,64}$/.test(item.id) ||
      ids.has(item.id) ||
      !['income', 'expense'].includes(item.type) ||
      typeof item.title !== 'string' ||
      !item.title.trim() ||
      item.title.length > 150 ||
      typeof item.category !== 'string' ||
      !item.category.trim() ||
      item.category.length > 60 ||
      typeof item.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(item.date) ||
      !Number.isFinite(Date.parse(item.date)) ||
      new Date(item.date).toISOString().slice(0, 10) !== item.date ||
      !Number.isSafeInteger(item.amount) ||
      item.amount < 1 ||
      item.amount > 1e12 ||
      !Number.isSafeInteger(item.createdAt) ||
      item.createdAt < 0
    )
      throw Error('Invalid transaction');
    total += item.amount;
    if (!Number.isSafeInteger(total))
      throw Error('Transaction total exceeds its limit');
    ids.add(item.id);
  }
  if (new TextEncoder().encode(JSON.stringify(items)).length > 2_000_000)
    throw Error('Transaction list exceeds its limit');
}
export function readFinanceState(value: unknown): FinanceState {
  if (!value) return emptyFinance();
  const state = value as FinanceState;
  if (!Number.isSafeInteger(state.revision) || state.revision < 0)
    throw Error('Invalid finance revision');
  validateTransactions(state.items);
  return structuredClone(state);
}
export function monthlyTransactions(items: Transaction[], month: string) {
  return items
    .filter((item) => item.date.startsWith(month + '-'))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}
export function totals(items: Transaction[]) {
  let income = 0,
    expense = 0;
  for (const item of items) {
    if (item.type === 'income') income += item.amount;
    else expense += item.amount;
  }
  return { income, expense, balance: income - expense };
}
export const localMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};
export function dateInMonth(month: string) {
  const [year, number] = month.split('-').map(Number);
  const day = Math.min(
    new Date().getDate(),
    new Date(year, number, 0).getDate(),
  );
  return `${month}-${String(day).padStart(2, '0')}`;
}
export class FinanceRepository {
  constructor(
    public db: WorkspaceDB,
    public server: boolean,
    private active = () => true,
  ) {}
  private check() {
    if (!this.active()) throw Error('Workspace changed');
  }
  private async cache(state: FinanceState) {
    return this.db.transaction('rw', this.db.meta, async () => {
      this.check();
      const cached = readFinanceState(
        (await this.db.meta.get('finance'))?.value,
      );
      if (cached.revision > state.revision) return cached;
      await this.db.meta.put({ key: 'finance', value: state });
      return state;
    });
  }
  async list(online = true): Promise<FinanceState> {
    this.check();
    if (this.server && online) {
      const state = readFinanceState(await api('/finance'));
      this.check();
      return this.cache(state);
    }
    const cached = await this.db.meta.get('finance');
    this.check();
    return readFinanceState(cached?.value);
  }
  async write(
    state: FinanceState,
    items: Transaction[],
  ): Promise<FinanceState> {
    this.check();
    validateTransactions(items);
    if (this.server) {
      const saved = readFinanceState(
        await api('/finance', 'PUT', { revision: state.revision, items }),
      );
      this.check();
      return this.cache(saved);
    }
    return this.db.transaction('rw', this.db.meta, async () => {
      this.check();
      const current = readFinanceState(
        (await this.db.meta.get('finance'))?.value,
      );
      if (current.revision !== state.revision)
        throw Error(
          'Transactions changed in another tab. Reload the list and try again.',
        );
      const saved = {
        revision: state.revision + 1,
        items: structuredClone(items),
      };
      await this.db.meta.put({ key: 'finance', value: saved });
      return saved;
    });
  }
  async merge(items: Transaction[]) {
    const state = await this.list();
    return this.write(state, [
      ...state.items,
      ...items.map((item) => ({ ...item, id: crypto.randomUUID() })),
    ]);
  }
}
