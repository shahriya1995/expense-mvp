import { v4 as uuidv4 } from 'uuid';
import * as db from '../db';
import { Expense } from '../types';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface ExpenseListFilters {
  category?: string;
  limit?: number;
  month?: number;
  year?: number;
  date_from?: string;
  date_to?: string;
  relative_day?: 'today' | 'yesterday';
  days_back?: number;
}

export interface ExpenseCreateInput {
  description: string;
  amount: number;
  currency?: string;
  date?: string;
  category?: string;
  notes?: string;
}

export interface ExpenseUpdateInput {
  description?: string;
  amount?: number;
  currency?: string;
  date?: string;
  category?: string;
  notes?: string;
}

function matchesMonth(expense: Expense, month?: number, year?: number): boolean {
  if (!month && !year) return true;

  const date = new Date(expense.date);
  if (Number.isNaN(date.getTime())) return false;
  if (typeof month === 'number' && date.getUTCMonth() + 1 !== month) return false;
  if (typeof year === 'number' && date.getUTCFullYear() !== year) return false;

  return true;
}

function getRelativeDayRange(relativeDay: 'today' | 'yesterday'): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (relativeDay === 'yesterday') {
    start.setDate(start.getDate() - 1);
  }

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
}

function matchesDateRange(
  expense: Expense,
  filters: ExpenseListFilters
): boolean {
  const expenseDate = new Date(expense.date);
  if (Number.isNaN(expenseDate.getTime())) return false;

  let start: Date | undefined;
  let end: Date | undefined;

  if (filters.relative_day === 'today' || filters.relative_day === 'yesterday') {
    const range = getRelativeDayRange(filters.relative_day);
    start = range.start;
    end = range.end;
  }

  if (
    typeof filters.days_back === 'number' &&
    Number.isFinite(filters.days_back) &&
    filters.days_back > 0
  ) {
    const now = new Date();
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - Math.floor(filters.days_back) + 1);
    end = new Date(now);
    end.setDate(end.getDate() + 1);
  }

  if (filters.date_from) {
    const parsedStart = new Date(filters.date_from);
    if (!Number.isNaN(parsedStart.getTime())) {
      start = parsedStart;
    }
  }

  if (filters.date_to) {
    const parsedEnd = new Date(filters.date_to);
    if (!Number.isNaN(parsedEnd.getTime())) {
      end = parsedEnd;
    }
  }

  if (start && expenseDate < start) return false;
  if (end && expenseDate >= end) return false;

  return true;
}

export async function listExpenses(filters: ExpenseListFilters = {}): Promise<Expense[]> {
  const all = await db.getAllExpenses();
  const filtered = all.filter((expense) => {
    if (
      filters.category &&
      expense.category?.toLowerCase() !== filters.category.toLowerCase()
    ) {
      return false;
    }

    if (!matchesMonth(expense, filters.month, filters.year)) return false;

    return matchesDateRange(expense, filters);
  });

  const requestedLimit =
    typeof filters.limit === 'number' && Number.isFinite(filters.limit)
      ? Math.max(0, Math.floor(filters.limit))
      : DEFAULT_LIMIT;
  const safeLimit = Math.min(requestedLimit, MAX_LIMIT);

  return filtered.slice(-safeLimit).reverse();
}

export async function getMonthlySummary(month?: number, year?: number) {
  const now = new Date();
  const targetMonth = month || now.getUTCMonth() + 1;
  const targetYear = year || now.getUTCFullYear();
  const expenses = await db.getAllExpenses();
  const monthly = expenses.filter((expense) => {
    const date = new Date(expense.date);
    return (
      !Number.isNaN(date.getTime()) &&
      date.getUTCMonth() + 1 === targetMonth &&
      date.getUTCFullYear() === targetYear
    );
  });

  const byCategory: Record<string, number> = {};
  let total = 0;

  for (const expense of monthly) {
    total += expense.amount;
    const key = expense.category || 'uncategorized';
    byCategory[key] = (byCategory[key] || 0) + expense.amount;
  }

  return {
    month: targetMonth,
    year: targetYear,
    total,
    count: monthly.length,
    byCategory,
  };
}

export async function createExpense(input: ExpenseCreateInput): Promise<Expense> {
  const parsedDate = new Date(input.date || new Date().toISOString());

  return db.createExpense({
    id: uuidv4(),
    description: input.description.trim(),
    amount: Math.round(input.amount * 100),
    currency: input.currency || 'USD',
    date: Number.isNaN(parsedDate.getTime())
      ? new Date().toISOString()
      : parsedDate.toISOString(),
    category: input.category || 'uncategorized',
    notes: input.notes || '',
  });
}

export async function updateExpense(id: string, patch: ExpenseUpdateInput) {
  const normalizedPatch: Partial<Expense> = {};

  if (typeof patch.description === 'string') normalizedPatch.description = patch.description;
  if (typeof patch.amount === 'number') normalizedPatch.amount = Math.round(patch.amount * 100);
  if (typeof patch.category === 'string') normalizedPatch.category = patch.category;
  if (typeof patch.notes === 'string') normalizedPatch.notes = patch.notes;
  if (typeof patch.currency === 'string') normalizedPatch.currency = patch.currency;
  if (typeof patch.date === 'string') normalizedPatch.date = patch.date;

  return db.updateExpense(id, normalizedPatch);
}

export async function deleteExpense(id: string) {
  return db.deleteExpense(id);
}
