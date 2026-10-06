import type { WorkspaceDB } from './storage';
import type { Transaction } from './finance';
import { api } from './account';

export type PlanGroup = 'income' | 'recurring' | 'monthly';
export interface Budget {
  id: string;
  month: string;
  category: string;
  group: PlanGroup;
  amount: number;
  note: string;
  enabled: boolean;
  automatic: boolean;
}
export interface PlanMonth {
  month: string;
  opening: number;
}
export interface PlanningData {
  months: PlanMonth[];
  items: Budget[];
}
export interface PlanningState extends PlanningData {
  revision: number;
}
export const emptyPlanning = (): PlanningState => ({
  revision: 0,
  months: [],
  items: [],
});
export const categoryKey = (value: string) => value.trim().toLowerCase();
export const planType = (plan: Budget) =>
  plan.group === 'income' ? 'income' : 'expense';
export const validMonth = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
export function validatePlanning(data: PlanningData) {
  if (
    !data ||
    !Array.isArray(data.months) ||
    !Array.isArray(data.items) ||
    data.months.length > 2400 ||
    data.items.length > 10000
  )
    throw Error('Invalid financial plans');
  const months = new Set<string>(),
    ids = new Set<string>(),
    categories = new Set<string>();
  for (const entry of data.months) {
    if (
      !entry ||
      !validMonth(entry.month) ||
      months.has(entry.month) ||
      !Number.isSafeInteger(entry.opening) ||
      Math.abs(entry.opening) > 1e12
    )
      throw Error('Invalid plan month');
    months.add(entry.month);
  }
  let total = 0;
  for (const plan of data.items) {
    if (
      !plan ||
      typeof plan.id !== 'string' ||
      !/^[a-zA-Z0-9-]{1,64}$/.test(plan.id) ||
      ids.has(plan.id) ||
      !months.has(plan.month) ||
      !['income', 'recurring', 'monthly'].includes(plan.group) ||
      typeof plan.category !== 'string' ||
      !plan.category.trim() ||
      plan.category.length > 60 ||
      !Number.isSafeInteger(plan.amount) ||
      plan.amount < 0 ||
      plan.amount > 1e12 ||
      typeof plan.note !== 'string' ||
      plan.note.length > 2000 ||
      typeof plan.enabled !== 'boolean' ||
      typeof plan.automatic !== 'boolean' ||
      (plan.automatic && (plan.group !== 'monthly' || plan.amount !== 0))
    )
      throw Error('Invalid budget');
    const key = `${plan.month}:${planType(plan)}:${categoryKey(plan.category)}`;
    if (categories.has(key))
      throw Error(
        'This category already has a budget. Edit the existing budget.',
      );
    total += plan.amount;
    if (!Number.isSafeInteger(total))
      throw Error('Plan total exceeds its limit');
    categories.add(key);
    ids.add(plan.id);
  }
  if (new TextEncoder().encode(JSON.stringify(data)).length > 2_000_000)
    throw Error('Financial plans exceed their limit');
}
export function readPlanningState(value: unknown): PlanningState {
  if (!value) return emptyPlanning();
  const state = value as PlanningState;
  if (!Number.isSafeInteger(state.revision) || state.revision < 0)
    throw Error('Invalid planning revision');
  validatePlanning(state);
  return structuredClone(state);
}
export const matchingTransactions = (plan: Budget, items: Transaction[]) =>
  items.filter(
    (item) =>
      item.date.slice(0, 7) === plan.month &&
      item.type === planType(plan) &&
      categoryKey(item.category) === categoryKey(plan.category),
  );
export const actualAmount = (plan: Budget, items: Transaction[]) =>
  matchingTransactions(plan, items).reduce((sum, item) => sum + item.amount, 0);
// Unexpected spending is derived from the ledger. Reading a month never writes dummy budgets.
export function monthBudgets(
  data: PlanningData,
  transactions: Transaction[],
  month: string,
): Budget[] {
  const rows = data.items.filter(
    (plan) =>
      plan.month === month &&
      (!plan.automatic || actualAmount(plan, transactions) > 0),
  );
  const known = new Set(
    rows
      .filter((plan) => planType(plan) === 'expense')
      .map((plan) => categoryKey(plan.category)),
  );
  for (const item of transactions) {
    const key = categoryKey(item.category);
    if (
      item.type !== 'expense' ||
      !item.date.startsWith(month + '-') ||
      known.has(key)
    )
      continue;
    rows.push({
      id: `automatic:${month}:${key}`,
      month,
      category: item.category.trim(),
      group: 'monthly',
      amount: 0,
      note: '',
      enabled: true,
      automatic: true,
    });
    known.add(key);
  }
  return rows;
}
export function monthSummary(
  data: PlanningData,
  transactions: Transaction[],
  month: string,
) {
  const rows = monthBudgets(data, transactions, month),
    tx = transactions.filter((item) => item.date.startsWith(month + '-'));
  const opening =
    data.months.find((entry) => entry.month === month)?.opening || 0;
  const budget = (type: string) =>
    rows
      .filter((plan) => plan.enabled && planType(plan) === type)
      .reduce((sum, plan) => sum + plan.amount, 0);
  const actual = (type: string) =>
    tx
      .filter((item) => item.type === type)
      .reduce((sum, item) => sum + item.amount, 0);
  const projected = (type: string) =>
    rows
      .filter((plan) => plan.enabled && planType(plan) === type)
      .reduce(
        (sum, plan) => sum + Math.max(plan.amount, actualAmount(plan, tx)),
        0,
      ) +
    tx
      .filter(
        (item) =>
          item.type === type &&
          !rows.some(
            (plan) =>
              planType(plan) === type &&
              categoryKey(plan.category) === categoryKey(item.category),
          ),
      )
      .reduce((sum, item) => sum + item.amount, 0);
  return {
    opening,
    planned: opening + budget('income') - budget('expense'),
    projected: opening + projected('income') - projected('expense'),
    current: opening + actual('income') - actual('expense'),
  };
}
export function groupSummary(rows: Budget[], transactions: Transaction[]) {
  const active = rows.filter((plan) => plan.enabled);
  const budget = active.reduce((sum, plan) => sum + plan.amount, 0),
    used = active.reduce(
      (sum, plan) => sum + actualAmount(plan, transactions),
      0,
    );
  return {
    budget,
    used,
    left: budget - used,
    percent: budget ? Math.round(((budget - used) / budget) * 100) : 0,
    realized: active.filter(
      (plan) =>
        actualAmount(plan, transactions) > 0 &&
        actualAmount(plan, transactions) >= plan.amount,
    ).length,
    count: active.length,
  };
}
export function copyMonth(
  data: PlanningData,
  source: string,
  destination: string,
): PlanningData {
  if (!validMonth(destination)) throw Error('Choose a valid month');
  const months = data.months.some((entry) => entry.month === destination)
    ? data.months
    : [...data.months, { month: destination, opening: 0 }];
  const existing = new Set(
    data.items
      .filter((plan) => plan.month === destination)
      .map((plan) => `${planType(plan)}:${categoryKey(plan.category)}`),
  );
  const copies = data.items
    .filter(
      (plan) =>
        plan.month === source &&
        !plan.automatic &&
        !existing.has(`${planType(plan)}:${categoryKey(plan.category)}`),
    )
    .map((plan) => ({
      ...plan,
      id: crypto.randomUUID(),
      month: destination,
      amount: plan.group === 'monthly' ? 0 : plan.amount,
    }));
  return { months, items: [...data.items, ...copies] };
}
export function mergePlanning(
  current: PlanningData,
  incoming: PlanningData,
): PlanningData {
  validatePlanning(incoming);
  const months = [
    ...current.months,
    ...incoming.months.filter(
      (entry) => !current.months.some((old) => old.month === entry.month),
    ),
  ];
  const keys = new Set(
    current.items.map(
      (plan) => `${plan.month}:${planType(plan)}:${categoryKey(plan.category)}`,
    ),
  );
  return {
    months,
    items: [
      ...current.items,
      ...incoming.items
        .filter(
          (plan) =>
            !keys.has(
              `${plan.month}:${planType(plan)}:${categoryKey(plan.category)}`,
            ),
        )
        .map((plan) => ({ ...plan, id: crypto.randomUUID() })),
    ],
  };
}
export function moveBudgets(
  rows: Budget[],
  selected: Set<string>,
  targetId: string,
  after: boolean,
) {
  const target = rows.find((plan) => plan.id === targetId);
  if (!target || selected.has(targetId)) return rows;
  const group = rows.filter((plan) => plan.group === target.group),
    moved = group.filter((plan) => selected.has(plan.id));
  if (!moved.length) return rows;
  const ordered = group.filter((plan) => !selected.has(plan.id));
  ordered.splice(ordered.indexOf(target) + Number(after), 0, ...moved);
  let index = 0;
  return rows.map((plan) =>
    plan.group === target.group ? ordered[index++] : plan,
  );
}
export class PlanningRepository {
  constructor(
    public db: WorkspaceDB,
    public server: boolean,
    private active = () => true,
  ) {}
  private check() {
    if (!this.active()) throw Error('Workspace changed');
  }
  private async cache(state: PlanningState) {
    return this.db.transaction('rw', this.db.meta, async () => {
      this.check();
      const cached = readPlanningState(
        (await this.db.meta.get('planning'))?.value,
      );
      if (cached.revision > state.revision) return cached;
      await this.db.meta.put({ key: 'planning', value: state });
      return state;
    });
  }
  async list(online = true) {
    this.check();
    if (this.server && online) {
      const state = readPlanningState(await api('/finance/plans'));
      this.check();
      return this.cache(state);
    }
    const value = (await this.db.meta.get('planning'))?.value;
    this.check();
    return readPlanningState(value);
  }
  async write(state: PlanningState, data: PlanningData) {
    this.check();
    validatePlanning(data);
    if (this.server) {
      const saved = readPlanningState(
        await api('/finance/plans', 'PUT', {
          ...data,
          revision: state.revision,
        }),
      );
      this.check();
      return this.cache(saved);
    }
    return this.db.transaction('rw', this.db.meta, async () => {
      this.check();
      const current = readPlanningState(
        (await this.db.meta.get('planning'))?.value,
      );
      if (current.revision !== state.revision)
        throw Error('Plans changed in another tab. Reload and try again.');
      const saved = { ...structuredClone(data), revision: state.revision + 1 };
      await this.db.meta.put({ key: 'planning', value: saved });
      return saved;
    });
  }
  async merge(data: PlanningData) {
    const state = await this.list();
    return this.write(state, mergePlanning(state, data));
  }
}
