import { updateExpense } from '../db';
import { Expense } from '../types';
import { ToolDefinition } from './types';

interface UpdateExpenseArgs {
  id: string;
  amount?: number;
  description?: string;
  category?: string;
  note?: string;
  notes?: string;
  currency?: string;
  date?: string;
}

export const updateExpenseTool: ToolDefinition<UpdateExpenseArgs, Expense | null> = {
  name: 'update_expense',
  description: 'Update an existing expense record',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      amount: { type: 'number', description: 'Amount in dollars' },
      description: { type: 'string' },
      category: { type: 'string' },
      note: { type: 'string' },
      notes: { type: 'string' },
      currency: { type: 'string' },
      date: { type: 'string', description: 'ISO date string' },
    },
    required: ['id'],
  },
  execute: async ({ id, amount, description, category, note, notes, currency, date }) => {
    const patch: Partial<Expense> = {};

    if (typeof description === 'string') patch.description = description;
    if (typeof amount === 'number') patch.amount = Math.round(amount * 100);
    if (typeof category === 'string') patch.category = category;
    if (typeof notes === 'string' || typeof note === 'string') patch.notes = notes || note;
    if (typeof currency === 'string') patch.currency = currency;
    if (typeof date === 'string') patch.date = date;

    return updateExpense(id, patch);
  },
};
