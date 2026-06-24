import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as db from '../db';
import { ReminderRecord } from '../types';
import { normalizeReminderDate } from '../utils/reminderDate';

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

function normalizeStatus(value: unknown): 'complete' | 'not_complete' {
  if (value === true) return 'complete';
  if (value === false) return 'not_complete';
  if (typeof value !== 'string') return 'not_complete';

  const normalized = value.trim().toLowerCase();
  return normalized === 'complete' ? 'complete' : 'not_complete';
}

router.get('/', async (req, res) => {
  const limit = parseLimit(req.query.limit);
  const reminders = await db.getAllReminders();
  const recentFirst = [...reminders].reverse();

  res.json(limit ? recentFirst.slice(0, limit) : recentFirst);
});

router.get('/raw', async (_req, res) => {
  const reminders = await db.getAllReminders();
  res.type('text/plain').send(reminders.map((reminder) => JSON.stringify(reminder)).join('\n'));
});

router.get('/:id', async (req, res) => {
  const reminder = await db.getReminderById(req.params.id);
  if (!reminder) return res.status(404).json({ error: 'not found' });
  res.json(reminder);
});

router.post('/', async (req, res) => {
  const payload = toObject(req.body);
  const normalizedRemindAt = normalizeReminderDate(payload.remindAt);

  if ('remindAt' in payload && payload.remindAt != null && payload.remindAt !== '' && !normalizedRemindAt) {
    return res.status(400).json({ error: 'invalid remindAt' });
  }

  const created: ReminderRecord = {
    ...payload,
    id: uuidv4(),
    savedAt: new Date().toISOString(),
    status: normalizeStatus(payload.status),
  };

  if (normalizedRemindAt) {
    created.remindAt = normalizedRemindAt;
  }

  if (created.remindAt == null && created.when == null && created.date == null) {
    created.date = created.savedAt;
  }

  const stored = await db.createReminder(created);
  res.status(201).json(stored);
});

router.patch('/:id', async (req, res) => {
  const patch = toObject(req.body);
  if ('status' in patch) {
    patch.status = normalizeStatus(patch.status);
  }
  if ('remindAt' in patch) {
    if (patch.remindAt == null || patch.remindAt === '') {
      delete patch.remindAt;
    } else {
      const normalizedRemindAt = normalizeReminderDate(patch.remindAt);
      if (!normalizedRemindAt) {
        return res.status(400).json({ error: 'invalid remindAt' });
      }
      patch.remindAt = normalizedRemindAt;
    }
  }

  const updated = await db.updateReminder(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'not found' });
  res.json(updated);
});

router.put('/:id', async (req, res) => {
  const patch = toObject(req.body);
  if ('status' in patch) {
    patch.status = normalizeStatus(patch.status);
  }
  if ('remindAt' in patch) {
    if (patch.remindAt == null || patch.remindAt === '') {
      delete patch.remindAt;
    } else {
      const normalizedRemindAt = normalizeReminderDate(patch.remindAt);
      if (!normalizedRemindAt) {
        return res.status(400).json({ error: 'invalid remindAt' });
      }
      patch.remindAt = normalizedRemindAt;
    }
  }

  const updated = await db.updateReminder(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'not found' });
  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  const deleted = await db.deleteReminder(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'not found' });
  res.status(204).send();
});

export default router;
