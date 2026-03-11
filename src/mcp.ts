/**
 * MCP (Model Context Protocol) wired to Google Gemini (Generative Language API).
 *
 * Requirements:
 * - Set GEMINI_API_KEY in .env or environment
 * - Optional: set GEMINI_MODEL (default: gemini-3-flash-preview)
 * - Node 18+ (global fetch)
 */

import { v4 as uuidv4 } from 'uuid';
import { createExpense } from './db';
import { Expense } from './types';

export type Role = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
}

export interface Context {
  id: string;
  title?: string;
  messages: Message[];
  createdAt: string;
}

const contexts = new Map<string, Context>();

export function createContext(title?: string) {
  const id = uuidv4();
  const c: Context = { id, title, messages: [], createdAt: new Date().toISOString() };
  contexts.set(id, c);
  return c;
}

export function getContext(id: string) {
  return contexts.get(id);
}

export function addMessage(contextId: string, role: Role, content: string) {
  const c = contexts.get(contextId);
  if (!c) return null;
  const m: Message = {
    id: uuidv4(),
    role,
    content,
    createdAt: new Date().toISOString(),
  };
  c.messages.push(m);
  return m;
}

function getFetch(): typeof fetch {
  const _fetch: typeof fetch | undefined = (globalThis as any).fetch;
  if (!_fetch) {
    throw new Error(
      'Runtime fetch() not available. Please run Node 18+ or install a fetch polyfill.'
    );
  }
  return _fetch;
}

function getModel(): string {
  return process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
}

/**
 * Accept either:
 * - "gemini-3-flash-preview"
 * - "models/gemini-3-flash-preview"
 *
 * Normalize to "models/..."
 */
function normalizeModel(model: string): string {
  return model.startsWith('models/') ? model : `models/${model}`;
}

function buildGeminiUrl(model: string, apiKey?: string, bearer?: string): string {
  const modelPath = normalizeModel(model);

  // Current Google REST docs show the generateContent endpoint on models/*
  // Example docs currently use v1beta for REST.
  const base = `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL}:generateContent`;

  if (bearer) return base;
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY or GEMINI_BEARER_TOKEN');

  return `${base}?key=${encodeURIComponent(apiKey)}`;
}

function buildHeaders(bearer?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (bearer) {
    headers['Authorization'] = `Bearer ${bearer}`;
  }

  return headers;
}

/**
 * Gemini returns text in:
 * data.candidates[0].content.parts[].text
 */
function extractAssistantText(data: any): string | null {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const text = parts
      .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
      .join('');
    if (text) return text;
  }

  if (typeof data?.text === 'string') return data.text;
  if (typeof data?.generated_text === 'string') return data.generated_text;

  return null;
}

function extractJsonFromText(text: string): any | null {
  if (!text) return null;

  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');

  let start = -1;
  if (firstBrace === -1 && firstBracket === -1) return null;
  if (firstBrace === -1) start = firstBracket;
  else if (firstBracket === -1) start = firstBrace;
  else start = Math.min(firstBrace, firstBracket);

  const candidate = text.slice(start);

  for (let end = candidate.length; end > 0; end--) {
    const sub = candidate.slice(0, end);
    try {
      return JSON.parse(sub);
    } catch {
      // keep trying
    }
  }

  return null;
}

function toCents(amount: any): number {
  if (amount == null) return 0;
  if (typeof amount === 'number') return Math.round(amount * 100);

  const s = String(amount)
    .replace(/[,\s]/g, '')
    .replace(/[^0-9.\-]/g, '');

  const n = Number(s);
  if (Number.isFinite(n)) return Math.round(n * 100);

  return 0;
}

/**
 * Low-level Gemini caller.
 * Uses current request shape:
 * - contents
 * - optional systemInstruction
 * - generationConfig
 *
 * Google documents structured outputs / JSON mode for schema-constrained JSON.
 */
async function callGemini(opts: {
  userText: string;
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseSchema?: any;
}): Promise<any> {
  const key = process.env.GEMINI_API_KEY;
  const bearer = process.env.GEMINI_BEARER_TOKEN;
  const model = getModel();

  if (!key && !bearer) {
    throw new Error('Missing GEMINI_API_KEY or GEMINI_BEARER_TOKEN');
  }

  const _fetch = getFetch();
  const url = buildGeminiUrl(model, key, bearer);
  const headers = buildHeaders(bearer);

  const generationConfig: Record<string, any> = {
    temperature: opts.temperature ?? 0.7,
    maxOutputTokens: opts.maxOutputTokens ?? 512,
  };

  if (opts.responseMimeType) {
    generationConfig.responseMimeType = opts.responseMimeType;
  }

  if (opts.responseSchema) {
    generationConfig.responseSchema = opts.responseSchema;
  }

  const body: Record<string, any> = {
    contents: [
      {
        role: 'user',
        parts: [{ text: opts.userText }],
      },
    ],
    generationConfig,
  };

  if (opts.systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: opts.systemInstruction }],
    };
  }

  const res = await _fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }

  return res.json();
}

/**
 * Simple text generation.
 */
export async function handleLLMRequest(prompt: string): Promise<string> {
  try {
    const data = await callGemini({
      userText: prompt,
      temperature: 0.7,
      maxOutputTokens: 512,
    });

    const text = extractAssistantText(data);
    if (text) return text;

    return `Gemini response parsing fallback: ${JSON.stringify(data).slice(0, 1000)}`;
  } catch (err: any) {
    return `Gemini request failed: ${String(err?.message || err)}`;
  }
}

/**
 * Analyze free-form expense text with Gemini, extract structured expense(s), and store them.
 * Returns: { stored: Expense[], assistantText }
 */
export async function analyzeAndStoreExpense(freeText: string): Promise<{ stored: Expense[]; assistantText: string }> {
  const systemInstr =
    `Extract expense information from this text. Return ONLY a valid JSON object with an "expenses" array. ` +
    `Each expense must have: description (string), amount (number in dollars), currency (string, default USD), ` +
    `date (ISO string, default today), category (string, optional), notes (string, optional). ` +
    `Example response: {"expenses":[{"description":"coffee","amount":5,"currency":"USD","date":"2026-03-11","category":"Food"}]}`;

  let assistantText = '';
  
  try {
    const data = await callGemini({
      userText: `${systemInstr}\n\nText to analyze: "${freeText}"`,
      temperature: 0,
      maxOutputTokens: 512,
    });

    assistantText = extractAssistantText(data) ?? JSON.stringify(data);
  } catch (err: any) {
    console.error('[EXPENSE_ANALYZE] Gemini call failed:', String(err?.message || err));
    assistantText = `Failed to analyze expense: ${String(err?.message || err)}`;
  }

  let parsed: any = null;
  try {
    parsed = JSON.parse(assistantText);
  } catch {
    parsed = extractJsonFromText(assistantText);
  }

  const toStore: Expense[] = [];

  if (parsed && typeof parsed === 'object') {
    let root = parsed.expenses
      ? parsed.expenses
      : Array.isArray(parsed)
        ? parsed
        : [parsed];

    if (!Array.isArray(root)) {
      console.warn('[EXPENSE_ANALYZE] Expected array or expenses array, got:', typeof root);
      // Try to treat single object as root
      if (typeof root === 'object' && root !== null) {
        root = [root];
      } else {
        root = [];
      }
    }

    for (const obj of root) {
      // Validate object structure
      if (typeof obj !== 'object' || obj === null) {
        console.warn('[EXPENSE_ANALYZE] Skipping invalid expense object:', obj);
        continue;
      }

      const desc = obj.description ?? freeText;
      const amt = toCents(obj.amount ?? obj.total ?? obj.price);
      
      // Skip if amount is 0 or missing (likely parse failure)
      if (amt <= 0) {
        console.warn('[EXPENSE_ANALYZE] Skipping expense with zero/invalid amount:', desc);
        continue;
      }

      const currency = obj.currency ?? obj.ccy ?? 'USD';
      const rawDate = obj.date ?? new Date().toISOString();
      const parsedDate = new Date(rawDate);
      const safeDate = Number.isNaN(parsedDate.getTime())
        ? new Date().toISOString()
        : parsedDate.toISOString();

      const category = obj.category ?? obj.cat ?? undefined;
      const notes = obj.notes ?? obj.note ?? undefined;

      const expense: Expense = {
        id: uuidv4(),
        description: String(desc),
        amount: amt,
        currency: String(currency),
        date: safeDate,
        category,
        notes,
      };

      try {
        const stored = await createExpense(expense);
        toStore.push(stored);
        console.debug('[EXPENSE_ANALYZE] Stored expense:', stored.id, '-', stored.description);
      } catch (err: any) {
        console.error('[EXPENSE_ANALYZE] Failed to store expense:', String(err?.message || err));
      }
    }
  } else {
    // No valid JSON parsed, create a placeholder
    console.warn('[EXPENSE_ANALYZE] Could not parse expense data, creating placeholder');
    const expense: Expense = {
      id: uuidv4(),
      description: freeText,
      amount: 0,
      currency: 'USD',
      date: new Date().toISOString(),
    };

    try {
      const stored = await createExpense(expense);
      toStore.push(stored);
    } catch (err: any) {
      console.error('[EXPENSE_ANALYZE] Failed to store placeholder expense:', String(err?.message || err));
    }
  }

  return { stored: toStore, assistantText };
}

/**
 * Detect if user text is about an expense using Gemini.
 * Returns true if the text appears to be describing an expense transaction.
 * Returns false otherwise (e.g., general conversation, questions, etc).
 */
// export async function isExpenseRelated(userText: string): Promise<boolean> {
//   try {
//     const systemInstr =
//       `You are an expense detection system. Given a user message, determine if it describes a financial transaction (expense). ` +
//       `Answer with only "true" or "false". ` +
//       `Examples of expenses: "I spent $50 on groceries", "lunch was $12", "bought coffee for 4 dollars". ` +
//       `Examples of non-expenses: "what is the weather?", "tell me a joke", "what's 2+2?", "how do I cook pasta?".`;

//     const data = await callGemini({
//       userText,
//       systemInstruction: systemInstr,
//       temperature: 0,
//       maxOutputTokens: 10,
//     });

//     const text = extractAssistantText(data)?.toLowerCase().trim() ?? '';
//     console.log(`[DEBUG_EXPENSE] Gemini response: "${text}"`);
//     const result = text.includes('true');
//     console.log(`[DEBUG_EXPENSE] Detection result: ${result}`);
//     return result;
//   } catch (err: any) {
//     // On error, be conservative and don't assume it's an expense
//     console.error('isExpenseRelated check failed:', String(err?.message || err));
//     return false;
// }
//}