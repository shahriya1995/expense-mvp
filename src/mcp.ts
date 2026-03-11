/**
 * MCP (Model Context Protocol) with dual LAGC support:
 * - Google Gemini (API-based)
 * - Ollama (Local, running in Docker)
 *
 * Requirements:
 * - For Gemini: Set GEMINI_API_KEY in .env
 * - For Ollama: Run Docker: docker run -d -p 11434:11434 ollama/ollama
 * - Set LLM_PROVIDER in .env (gemini or ollama)
 * - Node 18+ (global fetch)
 */

import { v4 as uuidv4 } from 'uuid';
import { createExpense } from './db';
import { Expense } from './types';
import { callOllama, checkOllamaHealth } from './ollama';

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
  pendingExpense?: PendingExpense;
}

interface PendingExpense {
  originalText: string;
  expense: Omit<Expense, 'id'>;
  question: string;
}

type ConversationAction = 'small_talk' | 'add_expense' | 'clarify_expense';

interface ConversationPlan {
  action: ConversationAction;
  reply: string;
  expenses: Array<Partial<Omit<Expense, 'id'>>>;
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

function getRecentConversation(contextId: string, limit = 8): Message[] {
  const c = contexts.get(contextId);
  if (!c) return [];
  return c.messages.slice(-limit);
}

function getPendingExpense(contextId: string): PendingExpense | undefined {
  return contexts.get(contextId)?.pendingExpense;
}

function setPendingExpense(contextId: string, pending?: PendingExpense) {
  const c = contexts.get(contextId);
  if (!c) return;
  c.pendingExpense = pending;
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
  const base = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent`;

  if (bearer) return base;
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY or GEMINI_BEARER_TOKEN');

  return `${base}?key=${encodeURIComponent(apiKey)}`;
}

function buildHeaders(bearer?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (bearer) {
    headers.Authorization = `Bearer ${bearer}`;
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

  const cleaned = text
    .replace(/^```(?:json)?\s*/gm, '')
    .replace(/```\s*$/gm, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // continue
  }

  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');

  let start = -1;
  if (firstBrace === -1 && firstBracket === -1) return null;
  if (firstBrace === -1) start = firstBracket;
  else if (firstBracket === -1) start = firstBrace;
  else start = Math.min(firstBrace, firstBracket);

  const candidate = cleaned.slice(start);

  for (let end = candidate.length; end > 0; end--) {
    const sub = candidate.slice(0, end).trim();
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
 * Unified LLM caller - routes to Gemini or Ollama based on LLM_PROVIDER env var.
 */
async function callLLM(opts: {
  userText: string;
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<string> {
  const provider = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();

  if (provider === 'ollama') {
    try {
      const isHealthy = await checkOllamaHealth();
      if (!isHealthy) {
        throw new Error(
          'Ollama is not running. Start it with: docker run -d -p 11434:11434 ollama/ollama'
        );
      }

      return await callOllama(opts);
    } catch (err: any) {
      console.error('[LLM] Ollama call failed:', String(err?.message || err));
      throw err;
    }
  }

  if (provider === 'gemini') {
    const data = await callGemini({
      userText: opts.userText,
      systemInstruction: opts.systemInstruction,
      temperature: opts.temperature,
      maxOutputTokens: opts.maxOutputTokens,
    });

    const text = extractAssistantText(data);
    if (text) return text;

    return `Gemini response: ${JSON.stringify(data).slice(0, 500)}`;
  }

  throw new Error(`Unknown LLM_PROVIDER: ${provider}. Use 'gemini' or 'ollama'.`);
}

/**
 * Simple text generation.
 */
export async function handleLLMRequest(prompt: string): Promise<string> {
  try {
    return await callLLM({
      userText: prompt,
      temperature: 0.7,
      maxOutputTokens: 512,
    });
  } catch (err: any) {
    return `LLM request failed: ${String(err?.message || err)}`;
  }
}

function formatAmount(cents: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

function buildExpenseSummary(expense: Expense): string {
  const parts = [
    `${expense.description} for ${formatAmount(expense.amount, expense.currency || 'USD')}`,
  ];

  if (expense.category) {
    parts.push(`category: ${expense.category}`);
  }

  return parts.join(' ');
}

function buildExpenseReply(stored: Expense[], freeText: string): string {
  if (stored.length === 0) {
    return `I looked at "${freeText}", but I couldn't find a clear amount to save. Try something like "I spent $18 on lunch" or "Coffee was 4.50".`;
  }

  if (stored.length === 1) {
    return `Logged ${buildExpenseSummary(stored[0])}.`;
  }

  const summary = stored.map(buildExpenseSummary).join('; ');
  return `Logged ${stored.length} expenses: ${summary}.`;
}

export async function generateFriendlyReply(
  contextId: string,
  userText: string
): Promise<string> {
  const recent = getRecentConversation(contextId)
    .map((msg) => `${msg.role}: ${msg.content}`)
    .join('\n');

  try {
    return await callLLM({
      userText:
        `Recent conversation:\n${recent || '(empty)'}\n\n` +
        `Reply to the latest user message naturally:\n${userText}`,
      systemInstruction:
        `You are a friendly expense assistant. Keep replies warm, concise, and helpful. ` +
        `Do not mention internal tools, JSON, analysis steps, or storage unless the user asks. ` +
        `If the user is making small talk, respond conversationally. ` +
        `If an expense sounds unclear, ask one short follow-up question instead of guessing. ` +
        `Adapt to the user's phrasing naturally and help them clarify amounts or merchants when needed.`,
      temperature: 0.7,
      maxOutputTokens: 220,
    });
  } catch (err: any) {
    console.error('[CHAT] Friendly reply failed:', String(err?.message || err));
    return `I'm having trouble replying right now. Please try again.`;
  }
}

function normalizePlannedExpenses(
  expenses: Array<Partial<Omit<Expense, 'id'>>> | undefined
): Omit<Expense, 'id'>[] {
  if (!Array.isArray(expenses)) return [];

  const normalized: Omit<Expense, 'id'>[] = [];

  for (const expense of expenses) {
    const description = String(expense.description || '').trim();
    const amount = toCents(expense.amount);

    if (!description || amount <= 0) continue;

    const currency = String(expense.currency || 'USD');
    const dateValue = expense.date ? new Date(String(expense.date)) : new Date();
    const safeDate = Number.isNaN(dateValue.getTime())
      ? new Date().toISOString()
      : dateValue.toISOString();

    normalized.push({
      description,
      amount,
      currency,
      date: safeDate,
      category: expense.category ? String(expense.category) : undefined,
      notes: expense.notes ? String(expense.notes) : undefined,
    });
  }

  return normalized;
}

async function planConversationTurn(
  contextId: string,
  userText: string
): Promise<ConversationPlan> {
  const pending = getPendingExpense(contextId);
  const recent = getRecentConversation(contextId)
    .map((msg) => `${msg.role}: ${msg.content}`)
    .join('\n');

  const pendingBlock = pending
    ? `Pending expense awaiting confirmation:
${JSON.stringify(pending.expense)}
Question asked: ${pending.question}
`
    : 'No pending expense.\n';

  const systemInstruction =
    `You are an intent router for an expense tracking chat. ` +
    `Your job is to classify the latest user message and return ONLY valid JSON. ` +
    `Never answer with prose outside JSON. Never use markdown. ` +
    `Allowed actions are exactly: "small_talk", "add_expense", "clarify_expense". ` +
    `Choose "small_talk" for greetings, casual chat, questions, thanks, and general conversation. ` +
    `Choose "add_expense" when the user clearly describes one or more expenses that should be saved now. ` +
    `Choose "clarify_expense" when the user likely means an expense but some part is ambiguous or needs confirmation. ` +
    `Use semantic understanding, not just explicit phrases. Short informal messages may still refer to expenses. ` +
    `When action is "clarify_expense", include your best structured guess in expenses[0] whenever you can infer one. ` +
    `If there is a pending expense and the user confirms it, choose "add_expense" and include the confirmed expense in expenses. ` +
    `If there is a pending expense and the user corrects it, choose "add_expense" when the corrected expense is clear, otherwise choose "clarify_expense". ` +
    `If action is "add_expense", expenses must contain one or more objects with description and amount in dollars. ` +
    `If action is "clarify_expense", expenses should usually contain exactly one best-guess expense object. ` +
    `If action is "small_talk", expenses must be an empty array. ` +
    `The reply should be friendly and concise. ` +
    `Examples:
User: "hi"
Output: {"action":"small_talk","reply":"Hi. What would you like to do?","expenses":[]}

User: "I spent $12 on lunch"
Output: {"action":"add_expense","reply":"Logged lunch for $12.","expenses":[{"description":"lunch","amount":12,"currency":"USD","category":"Food"}]}

User: "20$ shoes, 10$ socks, 50$ food"
Output: {"action":"add_expense","reply":"Logged 3 expenses.","expenses":[{"description":"shoes","amount":20,"currency":"USD","category":"Shopping"},{"description":"socks","amount":10,"currency":"USD","category":"Shopping"},{"description":"food","amount":50,"currency":"USD","category":"Food"}]}

User: "20 socks"
Output: {"action":"clarify_expense","reply":"Do you mean $20 for socks?","expenses":[{"description":"socks","amount":20,"currency":"USD"}]}

User: "i bought 100 of carpet"
Output: {"action":"clarify_expense","reply":"Do you mean $100 for carpet?","expenses":[{"description":"carpet","amount":100,"currency":"USD","category":"Home"}]}

User with pending expense asked "Do you mean $100 for carpet?" then replies "yes"
Output: {"action":"add_expense","reply":"Logged carpet for $100.","expenses":[{"description":"carpet","amount":100,"currency":"USD","category":"Home"}]}

Return JSON in this exact shape:
{"action":"small_talk|add_expense|clarify_expense","reply":"string","expenses":[{"description":"string","amount":12.34,"currency":"USD","date":"optional ISO string","category":"optional string","notes":"optional string"}]}.`;

  try {
    const raw = await callLLM({
      userText:
        `Conversation so far:\n${recent || '(empty)'}\n\n` +
        `${pendingBlock}\n` +
        `Latest user message:\n${userText}`,
      systemInstruction,
      temperature: 0,
      maxOutputTokens: 300,
    });

    const parsed = extractJsonFromText(raw);

    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.action === 'string' &&
      typeof parsed.reply === 'string'
    ) {
      const action = parsed.action as ConversationAction;

      if (
        action === 'small_talk' ||
        action === 'add_expense' ||
        action === 'clarify_expense'
      ) {
        return {
          action,
          reply: parsed.reply,
          expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
        };
      }
    }
  } catch (err: any) {
    console.error('[CHAT_PLAN] Planning failed:', String(err?.message || err));
  }

  return {
    action: 'small_talk',
    reply: await generateFriendlyReply(contextId, userText),
    expenses: [],
  };
}

async function storeParsedExpenses(entries: Omit<Expense, 'id'>[]): Promise<Expense[]> {
  const stored: Expense[] = [];

  for (const entry of entries) {
    const expense: Expense = {
      id: uuidv4(),
      ...entry,
    };

    try {
      stored.push(await createExpense(expense));
    } catch (err: any) {
      console.error(
        '[EXPENSE_STORE] Failed to store parsed expense:',
        String(err?.message || err)
      );
    }
  }

  return stored;
}

async function handlePendingExpenseReply(
  contextId: string,
  userText: string
): Promise<{
  assistantText: string;
  stored: Expense[];
  storeCount: number;
  detectedExpense: boolean;
} | null> {
  const pending = getPendingExpense(contextId);
  if (!pending) return null;

  const plan = await planConversationTurn(contextId, userText);
  const plannedExpenses = normalizePlannedExpenses(plan.expenses);

  if (plan.action === 'add_expense') {
    const expensesToStore = plannedExpenses.length > 0 ? plannedExpenses : [pending.expense];
    const stored = await storeParsedExpenses(expensesToStore);
    setPendingExpense(contextId, undefined);

    return {
      assistantText: plan.reply || buildExpenseReply(stored, pending.originalText),
      stored,
      storeCount: stored.length,
      detectedExpense: true,
    };
  }

  if (plan.action === 'clarify_expense') {
    const nextExpense = plannedExpenses[0] || pending.expense;
    const question = plan.reply || pending.question;

    setPendingExpense(contextId, {
      originalText: pending.originalText,
      expense: nextExpense,
      question,
    });

    return {
      assistantText: question,
      stored: [],
      storeCount: 0,
      detectedExpense: false,
    };
  }

  setPendingExpense(contextId, undefined);
  return {
    assistantText: plan.reply,
    stored: [],
    storeCount: 0,
    detectedExpense: false,
  };
}

export async function handleConversationTurn(
  contextId: string,
  userText: string
): Promise<{
  assistantText: string;
  stored: Expense[];
  storeCount: number;
  detectedExpense: boolean;
}> {
  const pendingResult = await handlePendingExpenseReply(contextId, userText);
  if (pendingResult) return pendingResult;

  const plan = await planConversationTurn(contextId, userText);
  const plannedExpenses = normalizePlannedExpenses(plan.expenses);

  if (plan.action === 'small_talk') {
    return {
      assistantText: plan.reply,
      stored: [],
      storeCount: 0,
      detectedExpense: false,
    };
  }

  if (plan.action === 'clarify_expense') {
    const firstExpense = plannedExpenses[0];

    if (!firstExpense) {
      const assistantText = plan.reply || `Could you clarify that expense a little more?`;
      return {
        assistantText,
        stored: [],
        storeCount: 0,
        detectedExpense: false,
      };
    }

    const question = plan.reply || `Could you confirm the expense details?`;

    setPendingExpense(contextId, {
      originalText: userText,
      expense: firstExpense,
      question,
    });

    return {
      assistantText: question,
      stored: [],
      storeCount: 0,
      detectedExpense: false,
    };
  }

  if (plannedExpenses.length === 0) {
    const assistantText = plan.reply || `I couldn't extract a valid expense to save from that.`;
    return {
      assistantText,
      stored: [],
      storeCount: 0,
      detectedExpense: false,
    };
  }

  const stored = await storeParsedExpenses(plannedExpenses);
  const replyText = plan.reply || buildExpenseReply(stored, userText);

  return {
    assistantText: replyText,
    stored,
    storeCount: stored.length,
    detectedExpense: true,
  };
}

/**
 * Analyze free-form expense text with the selected LLM, extract structured expense(s), and store them.
 */
export async function analyzeAndStoreExpense(
  freeText: string
): Promise<{ stored: Expense[]; assistantText: string }> {
  const systemInstruction =
    `Extract expense information from this text. Return ONLY valid JSON (no markdown, no code blocks, no explanation). ` +
    `The JSON must be a valid object with an "expenses" array containing expense objects. ` +
    `If the text does not clearly describe an expense with an amount, return {"expenses":[]}. ` +
    `Each expense must have: description (string), amount (number in dollars), currency (string, default USD), ` +
    `date (ISO string, default today), category (string, optional), notes (string, optional). ` +
    `Example: {"expenses":[{"description":"coffee","amount":5,"currency":"USD","date":"2026-03-11","category":"Food"}]} ` +
    `IMPORTANT: Return only the JSON object, nothing else.`;

  let assistantText = '';

  try {
    assistantText = await callLLM({
      userText: `Text to analyze: "${freeText}"`,
      systemInstruction,
      temperature: 0,
      maxOutputTokens: 512,
    });
  } catch (err: any) {
    console.error('[EXPENSE_ANALYZE] LLM call failed:', String(err?.message || err));
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
      root = typeof root === 'object' && root !== null ? [root] : [];
    }

    for (const obj of root) {
      if (typeof obj !== 'object' || obj === null) continue;

      const desc = obj.description ?? freeText;
      const amt = toCents(obj.amount ?? obj.total ?? obj.price);

      if (amt <= 0) continue;

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
      } catch (err: any) {
        console.error('[EXPENSE_ANALYZE] Failed to store expense:', String(err?.message || err));
      }
    }
  }

  return { stored: toStore, assistantText };
}