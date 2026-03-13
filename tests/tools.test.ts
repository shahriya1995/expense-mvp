import { describe, expect, it } from 'vitest';
import { toolRegistry } from '../src/tools';
import { Expense } from '../src/types';

describe('tool registry operations', () => {
  it('creates, updates, lists, summarizes, and deletes expenses', async () => {
    const create = toolRegistry.get('create_expense');
    const update = toolRegistry.get('update_expense');
    const list = toolRegistry.get('list_expenses');
    const monthly = toolRegistry.get('monthly_summary');
    const del = toolRegistry.get('delete_expense');

    expect(create).toBeDefined();
    expect(update).toBeDefined();
    expect(list).toBeDefined();
    expect(monthly).toBeDefined();
    expect(del).toBeDefined();

    const created = await create!.execute({
      amount: 12.34,
      description: 'tool test coffee',
      category: 'Food',
    }) as Expense;

    expect(created.description).toBe('tool test coffee');
    expect(created.amount).toBe(1234);

    const updated = await update!.execute({
      id: created.id,
      amount: 15,
      notes: 'updated by tools test',
    }) as Expense | null;

    expect(updated).not.toBeNull();
    expect(updated!.description).toBe('tool test coffee');
    expect(updated!.amount).toBe(1500);
    expect(updated!.notes).toBe('updated by tools test');

    const listed = await list!.execute({ limit: 10 }) as Expense[];
    expect(listed.some((expense) => expense.id === created.id)).toBe(true);

    const createdDate = new Date(created.date);
    const summary = await monthly!.execute({
      month: createdDate.getUTCMonth() + 1,
      year: createdDate.getUTCFullYear(),
    }) as {
      month: number;
      year: number;
      total: number;
      count: number;
      byCategory: Record<string, number>;
    };

    expect(summary.total).toBeGreaterThanOrEqual(1500);
    expect(summary.count).toBeGreaterThan(0);

    const deleted = await del!.execute({ id: created.id }) as { deleted: boolean; id: string };
    expect(deleted.deleted).toBe(true);
    expect(deleted.id).toBe(created.id);
  });
});
