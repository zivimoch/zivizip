import { describe, it, expect } from 'vitest';
import { taskAnalysis } from '../src/lib/task-analysis';
import type { Task } from '../src/lib/tasks';
const task = (date: string, done = false, archived = false): Task => ({
  id: date || 'undated',
  title: 'Task',
  date,
  done,
  archived,
  amount: 0,
  createdAt: 0,
});
describe('task analysis', () => {
  it('uses local calendar boundaries and excludes completed tasks from upcoming workload', () => {
    const data = taskAnalysis(
      [
        task('2026-10-17'),
        task('2026-10-18'),
        task('2026-10-19'),
        task('2026-10-25'),
        task('2026-10-26'),
        task(''),
        task('2026-10-01', true, true),
        task('', true),
      ],
      new Date(2026, 9, 18, 23, 59),
    );
    expect(data).toEqual({
      total: 8,
      completed: 2,
      pending: 6,
      percent: 25,
      deadlines: { overdue: 1, today: 1, week: 2, later: 1, undated: 1 },
    });
  });
  it('handles empty workspaces and a week crossing into another year', () => {
    expect(taskAnalysis([]).percent).toBe(0);
    expect(
      taskAnalysis(
        [task('2027-01-04'), task('2027-01-05')],
        new Date(2026, 11, 28),
      ).deadlines,
    ).toMatchObject({ week: 1, later: 1 });
  });
});
