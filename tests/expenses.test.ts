import { describe, expect, it } from 'vitest';
import * as db from '../src/db';
import { ExpenseRecord, ReminderRecord } from '../src/types';

describe('text store operations', () => {
  it('creates, reads, updates, and deletes a record', async () => {
    const record: ExpenseRecord = {
      id: 'test-id-1',
      savedAt: new Date().toISOString(),
      description: 'Test expense',
      amount: 12,
      category: 'test',
    };

    const created = await db.createExpense(record);
    expect(created.id).toBe(record.id);

    const all = await db.getAllExpenses();
    expect(all.find((entry) => entry.id === record.id)).toBeDefined();

    const updated = await db.updateExpense(record.id, { note: 'updated' });
    expect(updated?.note).toBe('updated');

    const deleted = await db.deleteExpense(record.id);
    expect(deleted).toBe(true);
  });

  it('creates, reads, updates, and deletes a reminder', async () => {
    const reminder: ReminderRecord = {
      id: 'reminder-test-1',
      savedAt: new Date().toISOString(),
      text: 'Pay rent',
      remindAt: new Date().toISOString(),
      status: 'not_complete',
    };

    const created = await db.createReminder(reminder);
    expect(created.id).toBe(reminder.id);

    const all = await db.getAllReminders();
    expect(all.find((entry) => entry.id === reminder.id)).toBeDefined();

    const updated = await db.updateReminder(reminder.id, { status: 'complete' });
    expect(updated?.status).toBe('complete');

    const deleted = await db.deleteReminder(reminder.id);
    expect(deleted).toBe(true);
  });
});
