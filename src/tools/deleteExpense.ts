import { deleteExpense } from '../db';
import { ToolDefinition } from './types';

interface DeleteExpenseArgs {
  id: string;
}

export const deleteExpenseTool: ToolDefinition<DeleteExpenseArgs, { deleted: boolean; id: string }> = {
  name: 'delete_expense',
  description: 'Delete an expense record by id',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string' },
    },
    required: ['id'],
  },
  execute: async ({ id }) => {
    return { deleted: await deleteExpense(id), id };
  },
};
