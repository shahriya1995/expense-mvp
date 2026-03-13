import { getAllExpenses } from '../db';
import { Expense } from '../types';
import { ToolDefinition } from './types';

const MAX_EXPENSE_RESULTS = 4;

interface ListExpensesArgs {
  category?: string;
  limit?: number;
  month?: number;
  year?: number;
  date_from?: string;
  date_to?: string;
  relative_day?: 'today' | 'yesterday';
  days_back?: number;
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
  dateFrom?: string,
  dateTo?: string,
  relativeDay?: 'today' | 'yesterday',
  daysBack?: number
): boolean {
  const expenseDate = new Date(expense.date);
  if (Number.isNaN(expenseDate.getTime())) return false;

  let start: Date | undefined;
  let end: Date | undefined;

  if (relativeDay === 'today' || relativeDay === 'yesterday') {
    const range = getRelativeDayRange(relativeDay);
    start = range.start;
    end = range.end;
  }

  if (typeof daysBack === 'number' && Number.isFinite(daysBack) && daysBack > 0) {
    const now = new Date();
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - Math.floor(daysBack) + 1);
    end = new Date(now);
    end.setDate(end.getDate() + 1);
  }

  if (dateFrom) {
    const parsedStart = new Date(dateFrom);
    if (!Number.isNaN(parsedStart.getTime())) {
      start = parsedStart;
    }
  }

  if (dateTo) {
    const parsedEnd = new Date(dateTo);
    if (!Number.isNaN(parsedEnd.getTime())) {
      end = parsedEnd;
    }
  }

  if (start && expenseDate < start) return false;
  if (end && expenseDate >= end) return false;
  return true;
}

export const listExpensesTool: ToolDefinition<ListExpensesArgs, Expense[]> = {
  name: 'list_expenses',
  description: 'List expenses, optionally filtered by category, month, date range, or recent day window. Returns at most 4 expenses.',
  parameters: {
    type: 'object',
    properties: {
      category: { type: 'string' },
      limit: { type: 'number' },
      month: { type: 'number' },
      year: { type: 'number' },
      date_from: { type: 'string', description: 'ISO date string inclusive lower bound' },
      date_to: { type: 'string', description: 'ISO date string exclusive upper bound' },
      relative_day: { type: 'string', enum: ['today', 'yesterday'] },
      days_back: { type: 'number', description: 'Include expenses from the last N calendar days including today' },
    },
  },
  execute: async ({ category, limit, month, year, date_from, date_to, relative_day, days_back }) => {
    const all = await getAllExpenses();
    const filtered = all.filter((expense) => {
      if (category && expense.category?.toLowerCase() !== category.toLowerCase()) return false;
      if (!matchesMonth(expense, month, year)) return false;
      return matchesDateRange(expense, date_from, date_to, relative_day, days_back);
    });
    const requestedLimit = typeof limit === 'number' ? Math.max(0, Math.floor(limit)) : MAX_EXPENSE_RESULTS;
    const safeLimit = Math.min(requestedLimit, MAX_EXPENSE_RESULTS);
    return filtered.slice(-safeLimit);
  },
};
