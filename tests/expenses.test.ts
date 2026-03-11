import { describe, it, expect } from 'vitest';
import * as db from '../src/db';
import { Expense } from '../src/types';

describe('db basic operations', async () => {
  it('creates, reads, updates, and deletes an expense', async () => {
    const e: Expense = {
      id: 'test-id-1',
      description: 'Test expense',
      amount: 1234,
      currency: 'USD',
      date: new Date().toISOString(),
      category: 'test',
      notes: ''
    };

    // create
    const created = await db.createExpense(e);
    expect(created.id).toBe(e.id);

    // read
    const all = await db.getAllExpenses();
    expect(all.find(x => x.id === e.id)).toBeDefined();

    // update
    const updated = await db.updateExpense(e.id, { notes: 'updated' });
    expect(updated?.notes).toBe('updated');

    // delete
    const ok = await db.deleteExpense(e.id);
    expect(ok).toBe(true);
  });
});
