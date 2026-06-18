import { Router } from 'express';
import * as db from '../db';
import {
  createExpense,
  deleteExpense,
  getMonthlySummary,
  listExpenses,
  updateExpense,
} from '../services/expenses';
import { validateExpenseInput, validateExpensePatchInput } from '../validation';

const router = Router();

function parseOptionalNumber(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

router.get('/', async (req, res) => {
  const expenses = await listExpenses({
    category: typeof req.query.category === 'string' ? req.query.category : undefined,
    limit: parseOptionalNumber(req.query.limit),
    month: parseOptionalNumber(req.query.month),
    year: parseOptionalNumber(req.query.year),
    date_from: typeof req.query.date_from === 'string' ? req.query.date_from : undefined,
    date_to: typeof req.query.date_to === 'string' ? req.query.date_to : undefined,
    relative_day:
      req.query.relative_day === 'today' || req.query.relative_day === 'yesterday'
        ? req.query.relative_day
        : undefined,
    days_back: parseOptionalNumber(req.query.days_back),
  });

  res.json(expenses);
});

router.get('/summary/monthly', async (req, res) => {
  const summary = await getMonthlySummary(
    parseOptionalNumber(req.query.month),
    parseOptionalNumber(req.query.year)
  );

  res.json(summary);
});

router.get('/:id', async (req, res) => {
  const e = await db.getExpenseById(req.params.id);
  if (!e) return res.status(404).json({ error: 'not found' });
  res.json(e);
});

router.post('/', async (req, res) => {
  try {
    const validated = validateExpenseInput(req.body);
    const created = await createExpense(validated);
    res.status(201).json(created);
  } catch (err: any) {
    const msg = err.errors?.[0]?.message || String(err);
    res.status(400).json({ error: msg });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const patch = validateExpensePatchInput(req.body);
    const updated = await updateExpense(req.params.id, patch);
    if (!updated) return res.status(404).json({ error: 'not found' });
    res.json(updated);
  } catch (err: any) {
    const msg = err.errors?.[0]?.message || String(err);
    res.status(400).json({ error: msg });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const patch = validateExpensePatchInput(req.body);
    const updated = await updateExpense(req.params.id, patch);
    if (!updated) return res.status(404).json({ error: 'not found' });
    res.json(updated);
  } catch (err: any) {
    const msg = err.errors?.[0]?.message || String(err);
    res.status(400).json({ error: msg });
  }
});

router.delete('/:id', async (req, res) => {
  const ok = await deleteExpense(req.params.id);
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.status(204).send();
});

export default router;
