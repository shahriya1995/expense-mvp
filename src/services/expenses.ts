import { v4 as uuidv4 } from 'uuid';
import * as db from '../db';
import { ExpenseRecord } from '../types';

function toExpenseObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export async function listExpenses(limit?: number): Promise<ExpenseRecord[]> {
  const expenses = await db.getAllExpenses();
  const recentFirst = [...expenses].reverse();

  return typeof limit === 'number' ? recentFirst.slice(0, limit) : recentFirst;
}

export async function listExpensesRaw(): Promise<string> {
  const expenses = await db.getAllExpenses();
  return expenses.map((expense) => JSON.stringify(expense)).join('\n');
}

export async function getExpense(id: string): Promise<ExpenseRecord | undefined> {
  return db.getExpenseById(id);
}

export async function createExpense(payload: unknown): Promise<ExpenseRecord> {
  const input = toExpenseObject(payload);
  const created: ExpenseRecord = {
    ...input,
    id: uuidv4(),
    savedAt: new Date().toISOString(),
  };

  if (created.date == null) {
    created.date = created.savedAt;
  }

  return db.createExpense(created);
}

export async function updateExpense(
  id: string,
  patch: unknown
): Promise<ExpenseRecord | null> {
  return db.updateExpense(id, toExpenseObject(patch));
}

export async function deleteExpense(id: string): Promise<boolean> {
  return db.deleteExpense(id);
}
