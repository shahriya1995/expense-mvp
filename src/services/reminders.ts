import { v4 as uuidv4 } from 'uuid';
import * as db from '../db';
import { ReminderRecord } from '../types';
import { normalizeReminderDate } from '../utils/reminderDate';

function toReminderObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function normalizeReminderStatus(value: unknown): 'complete' | 'not_complete' {
  if (value === true) return 'complete';
  if (value === false) return 'not_complete';
  if (typeof value !== 'string') return 'not_complete';

  const normalized = value.trim().toLowerCase();
  return normalized === 'complete' ? 'complete' : 'not_complete';
}

export async function listReminders(limit?: number): Promise<ReminderRecord[]> {
  const reminders = await db.getAllReminders();
  const recentFirst = [...reminders].reverse();

  return typeof limit === 'number' ? recentFirst.slice(0, limit) : recentFirst;
}

export async function listRemindersRaw(): Promise<string> {
  const reminders = await db.getAllReminders();
  return reminders.map((reminder) => JSON.stringify(reminder)).join('\n');
}

export async function getReminder(id: string): Promise<ReminderRecord | undefined> {
  return db.getReminderById(id);
}

export function prepareReminderCreate(payload: unknown): ReminderRecord {
  const input = toReminderObject(payload);
  const normalizedRemindAt = normalizeReminderDate(input.remindAt);

  if ('remindAt' in input && input.remindAt != null && input.remindAt !== '' && !normalizedRemindAt) {
    throw new Error('invalid remindAt');
  }

  const created: ReminderRecord = {
    ...input,
    id: uuidv4(),
    savedAt: new Date().toISOString(),
    status: normalizeReminderStatus(input.status),
  };

  if (normalizedRemindAt) {
    created.remindAt = normalizedRemindAt;
  }

  if (created.remindAt == null && created.when == null && created.date == null) {
    created.date = created.savedAt;
  }

  return created;
}

export async function createReminder(payload: unknown): Promise<ReminderRecord> {
  return db.createReminder(prepareReminderCreate(payload));
}

export function prepareReminderPatch(payload: unknown): Record<string, unknown> {
  const patch = toReminderObject(payload);

  if ('status' in patch) {
    patch.status = normalizeReminderStatus(patch.status);
  }

  if ('remindAt' in patch) {
    if (patch.remindAt == null || patch.remindAt === '') {
      delete patch.remindAt;
    } else {
      const normalizedRemindAt = normalizeReminderDate(patch.remindAt);
      if (!normalizedRemindAt) {
        throw new Error('invalid remindAt');
      }
      patch.remindAt = normalizedRemindAt;
    }
  }

  return patch;
}

export async function updateReminder(
  id: string,
  patch: unknown
): Promise<ReminderRecord | null> {
  return db.updateReminder(id, prepareReminderPatch(patch));
}

export async function deleteReminder(id: string): Promise<boolean> {
  return db.deleteReminder(id);
}
