import { createExpenseTool } from './createExpense';
import { deleteExpenseTool } from './deleteExpense';
import { listExpensesTool } from './listExpenses';
import { monthlySummaryTool } from './monthlySummary';
import { updateExpenseTool } from './updateExpense';
import { ToolDefinition } from './types';

export const tools: ToolDefinition[] = [
  createExpenseTool,
  updateExpenseTool,
  deleteExpenseTool,
  listExpensesTool,
  monthlySummaryTool,
];

export const toolRegistry = new Map(tools.map((tool) => [tool.name, tool]));
