import { promises as fs } from 'fs';
import path from 'path';
import { ExpenseRecord } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'expenses.txt');

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, '', 'utf-8');
  }
}

async function writeAll(records: ExpenseRecord[]) {
  const body = records.map((record) => JSON.stringify(record)).join('\n');
  await fs.writeFile(DB_PATH, body ? `${body}\n` : '', 'utf-8');
}

export async function getAllExpenses(): Promise<ExpenseRecord[]> {
  await ensureStore();
  const raw = await fs.readFile(DB_PATH, 'utf-8');

  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as ExpenseRecord];
      } catch {
        return [];
      }
    });
}

export async function getExpenseById(id: string): Promise<ExpenseRecord | undefined> {
  const all = await getAllExpenses();
  return all.find((expense) => expense.id === id);
}

export async function createExpense(record: ExpenseRecord): Promise<ExpenseRecord> {
  await ensureStore();
  await fs.appendFile(DB_PATH, `${JSON.stringify(record)}\n`, 'utf-8');
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
  await writeAll(all);
  return updated;
}

export async function deleteExpense(id: string): Promise<boolean> {
  const all = await getAllExpenses();
  const filtered = all.filter((expense) => expense.id !== id);

  if (filtered.length === all.length) return false;

  await writeAll(filtered);
  return true;
}

export function getStorePath() {
  return DB_PATH;
}
