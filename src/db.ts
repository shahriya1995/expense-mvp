import { promises as fs } from 'fs';
import path from 'path';
import { Expense } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'expenses.json');

async function ensureDB() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.access(DB_PATH);
  } catch (err) {
    await fs.writeFile(DB_PATH, JSON.stringify([]));
  }
}

async function readAll(): Promise<Expense[]> {
  await ensureDB();
  const raw = await fs.readFile(DB_PATH, 'utf-8');
  return JSON.parse(raw) as Expense[];
}

async function writeAll(list: Expense[]) {
  await fs.writeFile(DB_PATH, JSON.stringify(list, null, 2));
}

export async function getAllExpenses(): Promise<Expense[]> {
  return readAll();
}

export async function getExpenseById(id: string): Promise<Expense | undefined> {
  const all = await readAll();
  return all.find((e) => e.id === id);
}

export async function createExpense(expense: Expense): Promise<Expense> {
  const all = await readAll();
  all.push(expense);
  await writeAll(all);
  return expense;
}

export async function updateExpense(id: string, patch: Partial<Expense>): Promise<Expense | null> {
  const all = await readAll();
  const idx = all.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  const updated = { ...all[idx], ...patch } as Expense;
  all[idx] = updated;
  await writeAll(all);
  return updated;
}

export async function deleteExpense(id: string): Promise<boolean> {
  const all = await readAll();
  const filtered = all.filter((e) => e.id !== id);
  if (filtered.length === all.length) return false;
  await writeAll(filtered);
  return true;
}
