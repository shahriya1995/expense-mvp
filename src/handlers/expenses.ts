import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as db from '../db';
import { ExpenseRecord } from '../types';

const router = Router();

function parseLimit(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;

  return Math.floor(parsed);
}

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

router.get('/', async (req, res) => {
  const limit = parseLimit(req.query.limit);
  const expenses = await db.getAllExpenses();
  const recentFirst = [...expenses].reverse();

  res.json(limit ? recentFirst.slice(0, limit) : recentFirst);
});

router.get('/raw', async (_req, res) => {
  const expenses = await db.getAllExpenses();
  res.type('text/plain').send(expenses.map((expense) => JSON.stringify(expense)).join('\n'));
});

router.get('/:id', async (req, res) => {
  const expense = await db.getExpenseById(req.params.id);
  if (!expense) return res.status(404).json({ error: 'not found' });
  res.json(expense);
});

router.post('/', async (req, res) => {
  const payload = toObject(req.body);
  const created: ExpenseRecord = {
    ...payload,
    id: uuidv4(),
    savedAt: new Date().toISOString(),
  };

  if (created.date == null) {
    created.date = created.savedAt;
  }

  const stored = await db.createExpense(created);
  res.status(201).json(stored);
});

router.patch('/:id', async (req, res) => {
  const updated = await db.updateExpense(req.params.id, toObject(req.body));
  if (!updated) return res.status(404).json({ error: 'not found' });
  res.json(updated);
});

router.put('/:id', async (req, res) => {
  const updated = await db.updateExpense(req.params.id, toObject(req.body));
  if (!updated) return res.status(404).json({ error: 'not found' });
  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  const deleted = await db.deleteExpense(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'not found' });
  res.status(204).send();
});

export default router;
