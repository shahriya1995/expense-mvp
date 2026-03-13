import { getAllExpenses } from '../db';
import { ToolDefinition } from './types';

interface MonthlySummaryArgs {
  month?: number;
  year?: number;
}

export const monthlySummaryTool: ToolDefinition<MonthlySummaryArgs, {
  month: number;
  year: number;
  total: number;
  count: number;
  byCategory: Record<string, number>;
}> = {
  name: 'monthly_summary',
  description: 'Summarize spending for a month',
  parameters: {
    type: 'object',
    properties: {
      month: { type: 'number', description: '1-12' },
      year: { type: 'number' },
    },
  },
  execute: async ({ month, year }) => {
    const now = new Date();
    const targetMonth = month || now.getUTCMonth() + 1;
    const targetYear = year || now.getUTCFullYear();
    const expenses = await getAllExpenses();
    const monthly = expenses.filter((expense) => {
      const date = new Date(expense.date);
      return !Number.isNaN(date.getTime()) &&
        date.getUTCMonth() + 1 === targetMonth &&
        date.getUTCFullYear() === targetYear;
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
  },
};
