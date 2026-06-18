import { z } from 'zod';

/**
 * Validation schemas for API payloads
 */

// Expense creation/update payload
export const ExpenseSchema = z.object({
  description: z.string().min(1, 'description required').max(500, 'description too long'),
  amount: z.number().min(0, 'amount must be positive').max(9999999999, 'amount too large'),
  currency: z.string().length(3, 'currency must be 3-letter code').default('USD').optional(),
  date: z.string().datetime('invalid ISO date').default(() => new Date().toISOString()).optional(),
  category: z.string().max(100, 'category too long').default('uncategorized').optional(),
  notes: z.string().max(1000, 'notes too long').default('').optional(),
});

export const ExpensePatchSchema = ExpenseSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'at least one field is required'
);

export type ExpenseInput = z.infer<typeof ExpenseSchema>;

/**
 * Validate and coerce an expense payload
 */
export function validateExpenseInput(data: unknown): ExpenseInput {
  return ExpenseSchema.parse(data);
}

export function validateExpensePatchInput(data: unknown) {
  return ExpensePatchSchema.parse(data);
}
