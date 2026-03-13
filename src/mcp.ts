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
import { Expense } from './types';
import { callOllama, checkOllamaHealth } from './ollama';
import { toolRegistry, tools } from './tools';
import { ToolCall } from './tools/types';

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
  lastToolResults?: Array<{ tool: string; result: unknown }>;
}

interface ConversationInterpretation {
  reply: string;
  tool_calls: ToolCall[];
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

function getLastToolResults(contextId: string): Array<{ tool: string; result: unknown }> {
  return contexts.get(contextId)?.lastToolResults || [];
}

function setLastToolResults(
  contextId: string,
  toolResults: Array<{ tool: string; result: unknown }>
) {
  const c = contexts.get(contextId);
  if (!c) return;
  c.lastToolResults = toolResults;
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

function buildToolRegistryText(): string {
  return tools
    .map((tool) => `- ${tool.name}: ${tool.description}`)
    .join('\n');
}

function buildToolUsageGuide(): string {
  return [
    '- create_expense: use when the user is adding a new expense and amount/description are clear.',
    '- update_expense: use when the user wants to change an existing expense and you know which one.',
    '- delete_expense: use when the user wants to remove an existing expense and you know which one.',
    '- list_expenses: use for questions about stored expenses, recent entries, expenses for a date range, category lookups, or to find a target before update/delete. It returns at most 4 expenses.',
    '- monthly_summary: use for questions about totals or category breakdowns for a month.',
  ].join('\n');
}

function logStep(label: string, startedAt: number, extra?: Record<string, unknown>) {
  const durationMs = Date.now() - startedAt;
  if (extra) {
    console.log(`[MCP] ${label} (${durationMs}ms)`, extra);
    return;
  }
  console.log(`[MCP] ${label} (${durationMs}ms)`);
}

function normalizeToolCalls(toolCalls: unknown): ToolCall[] {
  if (!Array.isArray(toolCalls)) return [];

  const normalized: ToolCall[] = [];

  for (const entry of toolCalls) {
    if (!entry || typeof entry !== 'object') continue;

    const tool = typeof (entry as any).tool === 'string' ? (entry as any).tool.trim() : '';
    const args = (entry as any).arguments;

    if (!tool || !toolRegistry.has(tool)) continue;
    if (!args || typeof args !== 'object' || Array.isArray(args)) continue;

    normalized.push({
      tool,
      arguments: args as Record<string, unknown>,
    });
  }

  return normalized;
}

function formatDollarsFromCents(amount: number): string {
  return `$${(amount / 100).toFixed(2)}`;
}

function summarizeToolResultsForReply(
  toolResults: Array<{ tool: string; result: unknown }>
): string {
  if (toolResults.length === 0) return '(none)';

  return toolResults
    .map((entry) => {
      if (entry.tool === 'list_expenses' && Array.isArray(entry.result)) {
        const expenses = entry.result as Expense[];
        if (expenses.length === 0) {
          return 'list_expenses: no expenses found';
        }

        const lines = expenses.map((expense, index) =>
          `${index + 1}. ${expense.description} - ${formatDollarsFromCents(expense.amount)}`
        );
        return `list_expenses:\n${lines.join('\n')}`;
      }

      if (entry.tool === 'monthly_summary' && entry.result && typeof entry.result === 'object') {
        const summary = entry.result as {
          total?: number;
          count?: number;
          byCategory?: Record<string, number>;
        };
        const categories = summary.byCategory
          ? Object.entries(summary.byCategory)
              .slice(0, 5)
              .map(([category, amount]) => `${category}: ${formatDollarsFromCents(amount)}`)
              .join(', ')
          : '';
        return `monthly_summary: total=${formatDollarsFromCents(summary.total || 0)}, count=${summary.count || 0}${categories ? `, categories=${categories}` : ''}`;
      }

      if (entry.tool === 'create_expense' && entry.result && typeof entry.result === 'object') {
        const expense = entry.result as Expense;
        return `create_expense: ${expense.description} - ${formatDollarsFromCents(expense.amount)}`;
      }

      if (entry.tool === 'update_expense' && entry.result && typeof entry.result === 'object') {
        const expense = entry.result as Partial<Expense>;
        return `update_expense: ${expense.description || 'expense'} ${typeof expense.amount === 'number' ? `- ${formatDollarsFromCents(expense.amount)}` : ''}`.trim();
      }

      if (entry.tool === 'delete_expense' && entry.result && typeof entry.result === 'object') {
        const result = entry.result as { deleted?: boolean; id?: string };
        return `delete_expense: ${result.deleted ? 'deleted' : 'not found'}${result.id ? ` (${result.id})` : ''}`;
      }

      return `${entry.tool}: ${JSON.stringify(entry.result)}`;
    })
    .join('\n');
}

async function generateFallbackReply(contextId: string, userText: string): Promise<string> {
  const recent = getRecentConversation(contextId)
    .slice(-4)
    .map((msg) => `${msg.role}: ${msg.content}`)
    .join('\n');
  const startedAt = Date.now();

  try {
    const reply = await callLLM({
      userText:
        `Conversation so far:\n${recent || '(empty)'}\n\n` +
        `Latest user message:\n${userText}\n\n` +
        `Reply naturally to the user.`,
      systemInstruction:
        `You are a friendly expense assistant. Reply naturally, briefly, and helpfully. ` +
        `Do not return JSON. Do not mention tools or internal processing. ` +
        `If the user is greeting you or making small talk, respond conversationally. ` +
        `If the user might be describing an expense but it is unclear, ask one short follow-up question.`,
      temperature: 0.4,
      maxOutputTokens: 80,
    });
    logStep('fallback_reply', startedAt);
    return reply;
  } catch (err: any) {
    logStep('fallback_reply_failed', startedAt, { error: String(err?.message || err) });
    console.error('[CHAT_FALLBACK] Reply failed:', String(err?.message || err));
    return `I'm having trouble replying right now. Please try again.`;
  }
}

async function generateToolAwareReply(
  contextId: string,
  userText: string,
  toolResults: Array<{ tool: string; result: unknown }>
): Promise<string> {
  const recent = getRecentConversation(contextId)
    .slice(-4)
    .map((msg) => `${msg.role}: ${msg.content}`)
    .join('\n');

  const toolHistory = summarizeToolResultsForReply(toolResults);
  const startedAt = Date.now();

  try {
    const reply = await callLLM({
      userText:
        `Conversation so far:\n${recent || '(empty)'}\n\n` +
        `Latest user message:\n${userText}\n\n` +
        `Tool results from this turn:\n${toolHistory}\n\n` +
        `Reply naturally to the user based on these tool results.`,
      systemInstruction:
        `You are a friendly expense assistant. Reply naturally, briefly, and helpfully. ` +
        `Do not return JSON. Do not mention tools or internal processing. ` +
        `Ground your reply in the actual tool results. ` +
        `Answer data questions directly from the tool results instead of deflecting or asking unnecessary follow-ups. ` +
        `If the tool result includes expenses, list the real descriptions and amounts. ` +
        `For list_expenses results, prefer a numbered list like "1. lunch - $12.00". ` +
        `Remember that list_expenses returns at most 4 expenses. ` +
        `When helping with delete or update, prefer human-readable entries like description and amount, not raw IDs. ` +
        `Only mention an ID if it is a real ID from the tool result and the user explicitly asked for IDs. ` +
        `For monthly_summary, mention the real total and count. ` +
        `For create/update/delete, confirm the real outcome. ` +
        `Never use placeholders like [Expense 1], [ID], or [Display details ...]. ` +
        `If nothing was found, say that clearly. ` +
        `If list_expenses returned entries, include all returned entries in your reply.`,
      temperature: 0.4,
      maxOutputTokens: 220,
    });
    logStep('tool_aware_reply', startedAt, { toolCount: toolResults.length });
    return reply;
  } catch (err: any) {
    logStep('tool_aware_reply_failed', startedAt, { error: String(err?.message || err) });
    console.error('[CHAT_TOOL_FALLBACK] Reply failed:', String(err?.message || err));
    return `I'm having trouble replying right now. Please try again.`;
  }
}

async function interpretConversationTurn(
  contextId: string,
  userText: string,
  toolResults: Array<{ tool: string; result: unknown }> = []
): Promise<ConversationInterpretation> {
  const recent = getRecentConversation(contextId)
    .slice(-6)
    .map((msg) => `${msg.role}: ${msg.content}`)
    .join('\n');

  const effectiveToolResults = toolResults.length > 0 ? toolResults : getLastToolResults(contextId);

  const toolHistory = effectiveToolResults.length > 0
    ? effectiveToolResults
        .map((entry) => `tool ${entry.tool}: ${JSON.stringify(entry.result)}`)
        .join('\n')
    : '(none)';
  const startedAt = Date.now();

  const systemInstruction =
    `You are an expense assistant with tool access. Interpret the latest user message using the conversation history and return ONLY valid JSON. ` +
    `Never answer with prose outside JSON. Never use markdown. ` +
    `Available tools:\n${buildToolRegistryText()}\n\n` +
    `When to use them:\n${buildToolUsageGuide()}\n\n` +
    `Use tool_calls when a tool should be executed. If you still need clarification, ask a natural follow-up question and return an empty tool_calls array. ` +
    `Let normal conversation stay conversational with an empty tool_calls array. ` +
    `If the user wants to add or modify expenses and you have enough detail, return the appropriate tool call with arguments. ` +
    `If the user asks questions about saved expense data, expense history, recent entries, dates, categories, or totals, call the relevant read tool instead of answering from memory. ` +
    `If the user wants to update or delete an expense but does not provide an id, first call list_expenses to find the matching expense. ` +
    `Use the list_expenses result to identify the expense id, then call update_expense or delete_expense in the next response. ` +
    `If the previous turn already returned a numbered expense list, use that previous tool result to resolve follow-ups like "delete 2", "the second one", or "remove the first expense". ` +
    `If multiple expenses could match, ask a short follow-up question instead of guessing. ` +
    `For delete/update disambiguation, present human-readable entries using description and amount. Do not ask the user to choose from placeholder IDs. ` +
    `Use list_expenses flexibly: use limit for "last 3 entries", relative_day for "today" or "yesterday", days_back for requests like "last 10 days", and date_from/date_to for specific date ranges. ` +
    `Do not request more than 4 expenses from list_expenses because it will only return up to 4. ` +
    `If the user asks "what do I have", "what expenses do you see", "show me my entries", "what did I spend on food", or similar data questions, use list_expenses or monthly_summary. ` +
    `If the user asks a fresh question like "what expenses do you see?", do not assume the old date filter still applies unless they restate it. ` +
    `When a tool result contains expenses, refer to the real descriptions and amounts from the tool result. Do not use placeholders like [Expense 1], [ID], or entry 1. ` +
    `Use the conversation history to understand natural follow-up replies, corrections, and extra details. Do not require yes/no or any fixed format. ` +
    `After tool results are provided, either ask the next follow-up question, call another tool, or give a final natural reply. ` +
    `The reply should be friendly and concise. ` +
    `Examples:
User: "hi"
Output: {"reply":"Hi. What can I help you with today?","tool_calls":[]}

User: "I spent $12 on lunch"
Output: {"reply":"I'll add that now.","tool_calls":[{"tool":"create_expense","arguments":{"description":"lunch","amount":12,"currency":"USD","category":"Food"}}]}

User: "20$ shoes, 10$ socks, 50$ food"
Output: {"reply":"I'll add those now.","tool_calls":[{"tool":"create_expense","arguments":{"description":"shoes","amount":20,"currency":"USD","category":"Shopping"}},{"tool":"create_expense","arguments":{"description":"socks","amount":10,"currency":"USD","category":"Shopping"}},{"tool":"create_expense","arguments":{"description":"food","amount":50,"currency":"USD","category":"Food"}}]}

User: "20 socks"
Output: {"reply":"Do you mean $20 for socks?","tool_calls":[]}

User: "i bought 100 of carpet"
Output: {"reply":"Do you mean $100 for carpet?","tool_calls":[]}

User: "How much did I spend this month?"
Output: {"reply":"Let me check this month for you.","tool_calls":[{"tool":"monthly_summary","arguments":{}}]}

User: "Show me my last 3 expenses"
Output: {"reply":"Sure, I'll pull the latest ones.","tool_calls":[{"tool":"list_expenses","arguments":{"limit":3}}]}

Tool result:
tool list_expenses: [{"id":"exp_3","description":"coffee","amount":450,"currency":"USD","date":"2026-03-12T09:00:00.000Z","category":"Food"},{"id":"exp_4","description":"socks","amount":1800,"currency":"USD","date":"2026-03-12T10:00:00.000Z","category":"Shopping"},{"id":"exp_5","description":"groceries","amount":4000,"currency":"USD","date":"2026-03-12T11:00:00.000Z","category":"Food"}]
Output: {"reply":"Here are your last 3 expenses:\n1. groceries - $40.00\n2. socks - $18.00\n3. coffee - $4.50","tool_calls":[]}

User: "last 3 expenses of yesterday"
Output: {"reply":"Sure, I'll check yesterday's last 3 expenses.","tool_calls":[{"tool":"list_expenses","arguments":{"relative_day":"yesterday","limit":3}}]}

User: "what about today?"
Output: {"reply":"I'll check today's expenses.","tool_calls":[{"tool":"list_expenses","arguments":{"relative_day":"today","limit":4}}]}

User: "show me expenses from the last 10 days"
Output: {"reply":"Sure, I'll check the last 10 days.","tool_calls":[{"tool":"list_expenses","arguments":{"days_back":10}}]}

User: "what expenses do you see?"
Output: {"reply":"I'll pull the recent expenses I can see.","tool_calls":[{"tool":"list_expenses","arguments":{"limit":4}}]}

User: "Delete the lunch expense from today"
Output: {"reply":"Let me find that first.","tool_calls":[{"tool":"list_expenses","arguments":{"limit":4}}]}

Tool result:
tool list_expenses: [{"id":"exp_1","description":"lunch","amount":1200,"currency":"USD","date":"2026-03-12T12:00:00.000Z","category":"Food"}]
Output: {"reply":"Okay, I'll remove that lunch expense.","tool_calls":[{"tool":"delete_expense","arguments":{"id":"exp_1"}}]}

Tool result:
tool delete_expense: {"deleted":true,"id":"exp_1"}
Output: {"reply":"Done, I removed that lunch expense.","tool_calls":[]}

User: "I want to delete an expense"
Output: {"reply":"Sure, I'll pull a few recent expenses so you can pick one.","tool_calls":[{"tool":"list_expenses","arguments":{"limit":3}}]}

Tool result:
tool list_expenses: [{"id":"exp_6","description":"books","amount":5000,"currency":"USD","date":"2026-03-12T09:00:00.000Z","category":"Books"},{"id":"exp_7","description":"apples","amount":10000,"currency":"USD","date":"2026-03-12T10:00:00.000Z","category":"Food"},{"id":"exp_8","description":"pens","amount":400,"currency":"USD","date":"2026-03-12T11:00:00.000Z","category":"Office"}]
Output: {"reply":"Here are your last 3 expenses:\n1. books - $50.00\n2. apples - $100.00\n3. pens - $4.00\nWhich one do you want me to delete?","tool_calls":[]}

Bad output:
{"reply":"Sure thing, here are the last three entries with their IDs:\n1. [ID]\n2. [ID]\n3. [ID]\nLet me know which ones you want to delete.","tool_calls":[]}
This is wrong because it uses placeholder IDs instead of the real descriptions and amounts from the tool result.

User: "Update my Nike expense to $35"
Output: {"reply":"Let me find the Nike expense first.","tool_calls":[{"tool":"list_expenses","arguments":{"limit":4}}]}

Tool result:
tool list_expenses: [{"id":"exp_2","description":"socks at Nike","amount":4000,"currency":"USD","date":"2026-03-12T12:00:00.000Z","category":"Shopping"}]
Output: {"reply":"I'll update that Nike expense now.","tool_calls":[{"tool":"update_expense","arguments":{"id":"exp_2","amount":35}}]}

Conversation:
assistant: "Do you mean $100 for carpet?"
user: "yeah that's right"
Output: {"reply":"Okay, I'll add it.","tool_calls":[{"tool":"create_expense","arguments":{"description":"carpet","amount":100,"currency":"USD","category":"Home"}}]}

Conversation:
assistant: "Do you mean $20 for socks?"
user: "not 20, it was closer to 18"
Output: {"reply":"Thanks, I'll add it as $18.","tool_calls":[{"tool":"create_expense","arguments":{"description":"socks","amount":18,"currency":"USD","category":"Shopping"}}]}

Conversation:
assistant: "What amount should I save for the socks?"
user: "it was from Nike"
Output: {"reply":"How much did you spend at Nike?","tool_calls":[]}

Tool result:
tool monthly_summary: {"month":3,"year":2026,"total":5200,"count":2,"byCategory":{"Food":1200,"Shopping":4000}}
Output: {"reply":"You spent $52.00 this month across 2 expenses. Food was $12.00 and Shopping was $40.00.","tool_calls":[]}

Return JSON in this exact shape:
{"reply":"string","tool_calls":[{"tool":"tool_name","arguments":{"key":"value"}}]}.`;

  try {
    const raw = await callLLM({
      userText:
        `Conversation so far:\n${recent || '(empty)'}\n\n` +
        `Latest user message:\n${userText}\n\n` +
        `Tool results from this turn:\n${toolHistory}`,
      systemInstruction,
      temperature: 0,
      maxOutputTokens: 220,
    });

    const parsed = extractJsonFromText(raw);

    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.reply === 'string'
    ) {
      logStep('interpret_turn', startedAt, {
        toolCalls: Array.isArray(parsed.tool_calls) ? parsed.tool_calls.length : 0,
      });
      return {
        reply: parsed.reply,
        tool_calls: normalizeToolCalls(parsed.tool_calls),
      };
    }
  } catch (err: any) {
    logStep('interpret_turn_failed', startedAt, { error: String(err?.message || err) });
    console.error('[CHAT_INTERPRET] Interpretation failed:', String(err?.message || err));
  }

  return {
    reply: await generateFallbackReply(contextId, userText),
    tool_calls: [],
  };
}

async function executeToolCalls(
  toolCalls: ToolCall[]
): Promise<{
  stored: Expense[];
  results: Array<{ tool: string; result: unknown }>;
}> {
  const stored: Expense[] = [];
  const results: Array<{ tool: string; result: unknown }> = [];

  for (const call of toolCalls) {
    const tool = toolRegistry.get(call.tool);
    if (!tool) continue;
    const startedAt = Date.now();

    try {
      const result = await tool.execute(call.arguments);
      logStep('tool_execute', startedAt, { tool: call.tool });
      results.push({ tool: call.tool, result });

      if (call.tool === 'create_expense' && result && typeof result === 'object') {
        stored.push(result as Expense);
      }
    } catch (err: any) {
      logStep('tool_execute_failed', startedAt, {
        tool: call.tool,
        error: String(err?.message || err),
      });
      console.error(
        '[TOOL_EXECUTE] Failed to execute tool:',
        String(err?.message || err)
      );
      results.push({
        tool: call.tool,
        result: { error: String(err?.message || err) },
      });
    }
  }

  return {
    stored,
    results,
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
  toolCalls: ToolCall[];
  toolResults: Array<{ tool: string; result: unknown }>;
}> {
  const startedAt = Date.now();
  let finalReply = '';
  let toolResults: Array<{ tool: string; result: unknown }> = [];
  let allStored: Expense[] = [];
  const allToolCalls: ToolCall[] = [];

  for (let step = 0; step < 4; step++) {
    const stepStartedAt = Date.now();
    const interpretation = await interpretConversationTurn(contextId, userText, toolResults);
    finalReply = interpretation.reply || 'Could you say a little more about that?';

    if (interpretation.tool_calls.length === 0) {
      const assistantText =
        toolResults.length > 0 &&
        finalReply === `I'm having trouble replying right now. Please try again.`
          ? await generateToolAwareReply(contextId, userText, toolResults)
          : finalReply;

      return {
        assistantText,
        stored: allStored,
        storeCount: allStored.length,
        detectedExpense: allStored.length > 0,
        toolCalls: allToolCalls,
        toolResults,
      };
    }

    allToolCalls.push(...interpretation.tool_calls);
    const executed = await executeToolCalls(interpretation.tool_calls);
    toolResults = executed.results;
    setLastToolResults(contextId, toolResults);
    allStored = allStored.concat(executed.stored);
    logStep('conversation_step', stepStartedAt, {
      step,
      toolCalls: interpretation.tool_calls.map((call) => call.tool),
    });
  }

  logStep('conversation_turn_complete', startedAt, {
    toolCalls: allToolCalls.map((call) => call.tool),
    stored: allStored.length,
  });
  return {
    assistantText:
      toolResults.length > 0
        ? await generateToolAwareReply(contextId, userText, toolResults)
        : finalReply || 'I ran into a problem finishing that request.',
    stored: allStored,
    storeCount: allStored.length,
    detectedExpense: allStored.length > 0,
    toolCalls: allToolCalls,
    toolResults,
  };
}
