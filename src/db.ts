import { promises as fs } from 'fs';
import path from 'path';
import { ExpenseRecord, ReminderRecord } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const EXPENSES_PATH = path.join(DATA_DIR, 'expenses.txt');
const REMINDERS_PATH = path.join(DATA_DIR, 'reminders.txt');

async function ensureStore(filePath: string) {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, '', 'utf-8');
  }
}

async function writeAll<T extends { id: string }>(filePath: string, records: T[]) {
  const body = records.map((record) => JSON.stringify(record)).join('\n');
  await fs.writeFile(filePath, body ? `${body}\n` : '', 'utf-8');
}

async function readAll<T>(filePath: string): Promise<T[]> {
  await ensureStore(filePath);
  const raw = await fs.readFile(filePath, 'utf-8');

  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as T];
      } catch {
        return [];
      }
    });
}

export async function getAllExpenses(): Promise<ExpenseRecord[]> {
  return readAll<ExpenseRecord>(EXPENSES_PATH);
}

export async function getExpenseById(id: string): Promise<ExpenseRecord | undefined> {
  const all = await getAllExpenses();
  return all.find((expense) => expense.id === id);
}

export async function createExpense(record: ExpenseRecord): Promise<ExpenseRecord> {
  await ensureStore(EXPENSES_PATH);
  await fs.appendFile(EXPENSES_PATH, `${JSON.stringify(record)}\n`, 'utf-8');
  return record;
}

export async function updateExpense(
  id: string,
  patch: Record<string, unknown>
): Promise<ExpenseRecord | null> {
  const all = await getAllExpenses();
  const index = all.findIndex((expense) => expense.id === id);

  if (index === -1) return null;

  const updated: ExpenseRecord = {
    ...all[index],
    ...patch,
    id,
    savedAt: all[index].savedAt,
    updatedAt: new Date().toISOString(),
  };

  all[index] = updated;
  await writeAll(EXPENSES_PATH, all);
  return updated;
}

export async function deleteExpense(id: string): Promise<boolean> {
  const all = await getAllExpenses();
  const filtered = all.filter((expense) => expense.id !== id);

  if (filtered.length === all.length) return false;

  await writeAll(EXPENSES_PATH, filtered);
  return true;
}

export async function getAllReminders(): Promise<ReminderRecord[]> {
  return readAll<ReminderRecord>(REMINDERS_PATH);
}

export async function getReminderById(id: string): Promise<ReminderRecord | undefined> {
  const all = await getAllReminders();
  return all.find((reminder) => reminder.id === id);
}

export async function createReminder(record: ReminderRecord): Promise<ReminderRecord> {
  await ensureStore(REMINDERS_PATH);
  await fs.appendFile(REMINDERS_PATH, `${JSON.stringify(record)}\n`, 'utf-8');
  return record;
}

export async function updateReminder(
  id: string,
  patch: Record<string, unknown>
): Promise<ReminderRecord | null> {
  const all = await getAllReminders();
  const index = all.findIndex((reminder) => reminder.id === id);

  if (index === -1) return null;

  const updated: ReminderRecord = {
    ...all[index],
    ...patch,
    id,
    savedAt: all[index].savedAt,
    updatedAt: new Date().toISOString(),
  };

  all[index] = updated;
  await writeAll(REMINDERS_PATH, all);
  return updated;
}

export async function deleteReminder(id: string): Promise<boolean> {
  const all = await getAllReminders();
  const filtered = all.filter((reminder) => reminder.id !== id);

  if (filtered.length === all.length) return false;

  await writeAll(REMINDERS_PATH, filtered);
  return true;
}

export function getStorePaths() {
  return {
    expenses: EXPENSES_PATH,
    reminders: REMINDERS_PATH,
  };
}
