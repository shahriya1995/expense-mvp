import { v4 as uuidv4 } from 'uuid';
import { createExpense } from '../db';
import { Expense } from '../types';
import { ToolDefinition } from './types';

interface CreateExpenseArgs {
  amount: number;
  description: string;
  category?: string;
  notes?: string;
  currency?: string;
  date?: string;
}

export const createExpenseTool: ToolDefinition<CreateExpenseArgs, Expense> = {
  name: 'create_expense',

  description:
    'Create a new expense entry in the expense database. Use this when a user says they spent money on something.',

  parameters: {
    type: 'object',
    properties: {
      amount: {
        type: 'number',
        description: 'Amount spent in dollars (example: 12.5)',
      },
      description: {
        type: 'string',
        description: 'What the money was spent on',
      },
      category: {
        type: 'string',
        description: 'Optional expense category',
      },
      notes: {
        type: 'string',
        description: 'Optional notes about the expense',
      },
      currency: {
        type: 'string',
        description: 'Currency code (default USD)',
      },
      date: {
        type: 'string',
        description: 'ISO date string (optional)',
      },
    },
    required: ['amount', 'description'],
  },

  execute: async ({ amount, description, category, notes, currency, date }) => {
    if (!amount || amount <= 0) {
      throw new Error('Amount must be greater than zero');
    }

    const parsedDate = new Date(date || new Date().toISOString());

    const expense: Expense = {
      id: uuidv4(),
      description: description.trim(),
      amount: Math.round(amount * 100),
      currency: currency || 'USD',
      date: Number.isNaN(parsedDate.getTime())
        ? new Date().toISOString()
        : parsedDate.toISOString(),
      category,
      notes,
    };

    return createExpense(expense);
  },
};