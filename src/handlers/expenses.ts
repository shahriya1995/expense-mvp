import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as db from '../db';
import { Expense } from '../types';
import { validateExpenseInput } from '../validation';

const router = Router();

router.get('/', async (req, res) => {
  const all = await db.getAllExpenses();
  res.json(all);
});

router.get('/:id', async (req, res) => {
  const e = await db.getExpenseById(req.params.id);
  if (!e) return res.status(404).json({ error: 'not found' });
  res.json(e);
});

router.post('/', async (req, res) => {
  try {
    const validated = validateExpenseInput(req.body);
    const expense: Expense = {
      id: uuidv4(),
      description: validated.description,
      amount: validated.amount,
      currency: validated.currency || 'USD',
      date: validated.date || new Date().toISOString(),
      category: validated.category || 'uncategorized',
      notes: validated.notes || '',
    };
    const created = await db.createExpense(expense);
    res.status(201).json(created);
  } catch (err: any) {
    const msg = err.errors?.[0]?.message || String(err);
    res.status(400).json({ error: msg });
  }
});

router.put('/:id', async (req, res) => {
  const patch = req.body as Partial<Expense>;
  const updated = await db.updateExpense(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'not found' });
  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  const ok = await db.deleteExpense(req.params.id);
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.status(204).send();
});

export default router;
