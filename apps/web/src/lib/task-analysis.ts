import type { Task } from './tasks';

export function taskAnalysis(items: Task[], now = new Date()) {
  const key = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const today = key(now);
  const end = new Date(now);
  end.setDate(end.getDate() + 7);
  const nextWeek = key(end);
  const deadlines = { overdue: 0, today: 0, week: 0, later: 0, undated: 0 };
  let completed = 0;
  for (const task of items) {
    if (task.done) {
      completed++;
      continue;
    }
    if (!task.date) deadlines.undated++;
    else if (task.date < today) deadlines.overdue++;
    else if (task.date === today) deadlines.today++;
    else if (task.date <= nextWeek) deadlines.week++;
    else deadlines.later++;
  }
  return {
    total: items.length,
    completed,
    pending: items.length - completed,
    percent: items.length ? Math.round((completed / items.length) * 100) : 0,
    deadlines,
  };
}
