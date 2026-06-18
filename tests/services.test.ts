import { describe, expect, it } from 'vitest';
import {
  createExpense,
  deleteExpense,
  getMonthlySummary,
  listExpenses,
  updateExpense,
} from '../src/services/expenses';

describe('expense services', () => {
  it('creates, updates, lists, summarizes, and deletes expenses', async () => {
    const created = await createExpense({
      amount: 12.34,
      description: 'service test coffee',
      category: 'Food',
    });

    expect(created.description).toBe('service test coffee');
    expect(created.amount).toBe(1234);

    const updated = await updateExpense(created.id, {
      amount: 15,
      notes: 'updated by service test',
    });

    expect(updated).not.toBeNull();
    expect(updated!.amount).toBe(1500);
    expect(updated!.notes).toBe('updated by service test');

    const listed = await listExpenses({ limit: 10 });
    expect(listed.some((expense) => expense.id === created.id)).toBe(true);

    const createdDate = new Date(created.date);
    const summary = await getMonthlySummary(
      createdDate.getUTCMonth() + 1,
      createdDate.getUTCFullYear()
    );

    expect(summary.total).toBeGreaterThanOrEqual(1500);
    expect(summary.count).toBeGreaterThan(0);

    const deleted = await deleteExpense(created.id);
    expect(deleted).toBe(true);
  });
});
