import dotenv from 'dotenv';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as expensesService from '../services/expenses';
import * as remindersService from '../services/reminders';

dotenv.config();

const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || '0.0.0.0';

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function textResult(text: string) {
  return {
    content: [
      {
        type: 'text' as const,
        text,
      },
    ],
  };
}

export function createMcpServer() {
  const server = new McpServer({
    name: 'expense-mvp',
    version: '0.1.0',
  });

  server.tool(
    'list_expenses',
    'List recent expenses. Optionally pass a positive limit.',
    {
      limit: z.number().int().positive().optional(),
    },
    async ({ limit }) => textResult(formatJson(await expensesService.listExpenses(limit)))
  );

  server.tool(
    'get_expense',
    'Fetch one expense by id.',
    {
      id: z.string().min(1),
    },
    async ({ id }) => {
      const expense = await expensesService.getExpense(id);
      return textResult(expense ? formatJson(expense) : `Expense ${id} not found.`);
    }
  );

  server.tool(
    'create_expense',
    'Create a new expense record.',
    {
      description: z.string().min(1),
      amount: z.number(),
      category: z.string().optional(),
      notes: z.string().optional(),
      date: z.string().optional(),
    },
    async (input) => textResult(formatJson(await expensesService.createExpense(input)))
  );

  server.tool(
    'update_expense',
    'Update an expense by id.',
    {
      id: z.string().min(1),
      description: z.string().optional(),
      amount: z.number().optional(),
      category: z.string().optional(),
      notes: z.string().optional(),
      date: z.string().optional(),
    },
    async ({ id, ...patch }) => {
      const updated = await expensesService.updateExpense(id, patch);
      return textResult(updated ? formatJson(updated) : `Expense ${id} not found.`);
    }
  );

  server.tool(
    'delete_expense',
    'Delete an expense by id.',
    {
      id: z.string().min(1),
    },
    async ({ id }) =>
      textResult(
        (await expensesService.deleteExpense(id))
          ? `Deleted expense ${id}.`
          : `Expense ${id} not found.`
      )
  );

  server.tool(
    'list_reminders',
    'List recent reminders. Optionally pass a positive limit.',
    {
      limit: z.number().int().positive().optional(),
    },
    async ({ limit }) => textResult(formatJson(await remindersService.listReminders(limit)))
  );

  server.tool(
    'get_reminder',
    'Fetch one reminder by id.',
    {
      id: z.string().min(1),
    },
    async ({ id }) => {
      const reminder = await remindersService.getReminder(id);
      return textResult(reminder ? formatJson(reminder) : `Reminder ${id} not found.`);
    }
  );

  server.tool(
    'create_reminder',
    'Create a reminder. remindAt should be an exact parseable datetime when provided.',
    {
      text: z.string().min(1),
      remindAt: z.string().optional(),
      status: z.enum(['complete', 'not_complete']).optional(),
    },
    async (input) => {
      try {
        const created = await remindersService.createReminder(input);
        return textResult(formatJson(created));
      } catch (error) {
        if (error instanceof Error && error.message === 'invalid remindAt') {
          return textResult('invalid remindAt');
        }
        throw error;
      }
    }
  );

  server.tool(
    'update_reminder',
    'Update a reminder by id.',
    {
      id: z.string().min(1),
      text: z.string().optional(),
      remindAt: z.string().optional(),
      status: z.enum(['complete', 'not_complete']).optional(),
    },
    async ({ id, ...patch }) => {
      try {
        const updated = await remindersService.updateReminder(id, patch);
        return textResult(updated ? formatJson(updated) : `Reminder ${id} not found.`);
      } catch (error) {
        if (error instanceof Error && error.message === 'invalid remindAt') {
          return textResult('invalid remindAt');
        }
        throw error;
      }
    }
  );

  server.tool(
    'delete_reminder',
    'Delete a reminder by id.',
    {
      id: z.string().min(1),
    },
    async ({ id }) =>
      textResult(
        (await remindersService.deleteReminder(id))
          ? `Deleted reminder ${id}.`
          : `Reminder ${id} not found.`
      )
  );

  return server;
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>
) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) return undefined;

  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) return undefined;

  return JSON.parse(raw);
}

export function createHttpMcpServer() {
  return createServer(async (req, res) => {
    if (!req.url) {
      sendJson(res, 400, {
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Missing request URL.' },
        id: null,
      });
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/health') {
      sendJson(res, 200, {
        name: 'expense-mvp-mcp',
        status: 'ok',
        endpoint: '/mcp',
      });
      return;
    }

    if (url.pathname !== '/mcp') {
      sendJson(res, 404, {
        jsonrpc: '2.0',
        error: { code: -32004, message: 'Not found.' },
        id: null,
      });
      return;
    }

    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    try {
      await server.connect(transport);
      const parsedBody =
        req.method === 'POST' ? await readJsonBody(req) : undefined;
      await transport.handleRequest(req, res, parsedBody);
    } catch (error) {
      console.error('Error handling MCP request:', error);

      if (!res.headersSent) {
        sendJson(res, 500, {
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    } finally {
      await transport.close();
      await server.close();
    }
  });
}

async function main() {
  const server = createHttpMcpServer();

  await new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => {
      console.log(`Expense MCP server listening on http://${host}:${port}/mcp`);
      resolve();
    });
    server.once('error', reject);
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to start MCP server', error);
    process.exit(1);
  });
}
