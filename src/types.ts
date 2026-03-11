export interface Expense {
  id: string;
  description: string;
  amount: number; // cents
  currency?: string;
  date: string; // ISO
  category?: string;
  notes?: string;
}
