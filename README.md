# Expense MVP

A small expense tracker with:

- a chat-first frontend
- MCP-style conversation context
- LLM-based routing between small talk, expense logging, and clarification
- JSON file persistence in [data/expenses.json](/Users/riyaphade/Projects/expense_tracker/expense-mvp/data/expenses.json)

## What It Does

You open the app, type naturally into the chat box, and the assistant decides whether to:

- respond as normal chat
- log one or more expenses
- ask a follow-up question when the message is ambiguous

Examples:

- `hi`
- `I spent $12 on lunch`
- `20$ shoes, 10$ socks, 50$ food`
- `I bought 100 of carpet`

If the expense is unclear, the assistant can keep a pending clarification in the chat context and use your next reply to decide whether to save it.

## Stack

- Node.js
- TypeScript
- Express
- Zod
- Ollama or Gemini for LLM calls
- file-based persistence in `data/expenses.json`

## Current Default LLM

The current `.env` is set to use Ollama with:

- `LLM_PROVIDER=ollama`
- `OLLAMA_MODEL=qwen2.5:3b`

This model performed better than `orca-mini` for the current JSON-routing prompt.

## Setup

1. Install dependencies

```bash
npm install
```

2. Make sure your `.env` contains valid values

Example:

```env
LLM_PROVIDER=ollama

GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-2.5-flash

OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:3b

PORT=4000
```

Note:

- even when using `LLM_PROVIDER=ollama`, the current startup code in [src/index.ts](/Users/riyaphade/Projects/expense_tracker/expense-mvp/src/index.ts) still requires `GEMINI_API_KEY` to be present
- if you want that removed, the startup validation should be adjusted

3. If using Ollama, make sure it is running locally

Example:

```bash
ollama serve
```

4. Pull the model if needed

```bash
ollama pull qwen2.5:3b
```

5. Start the app

```bash
npm run dev
```

Then open:

```text
http://localhost:4000
```

## UI Flow

The frontend lives in [frontend/](./frontend).

When the page loads:

- [frontend/app.js](/Users/riyaphade/Projects/expense_tracker/expense-mvp/frontend/app.js) creates a chat context with `POST /mcp/context`
- the returned context id is stored in the browser session
- the user types into the textarea and presses `Enter` to send
- `Shift+Enter` inserts a newline

## Request Flow

When you send a message:

1. [frontend/app.js](/Users/riyaphade/Projects/expense_tracker/expense-mvp/frontend/app.js) sends `POST /mcp/:contextId/msg`
2. [src/server.ts](/Users/riyaphade/Projects/expense_tracker/expense-mvp/src/server.ts) adds the user message to the in-memory context
3. [src/mcp.ts](/Users/riyaphade/Projects/expense_tracker/expense-mvp/src/mcp.ts) runs `handleConversationTurn(...)`
4. the LLM planner decides one action:
   - `small_talk`
   - `add_expense`
   - `clarify_expense`
5. if expenses are returned, they are stored through [src/db.ts](/Users/riyaphade/Projects/expense_tracker/expense-mvp/src/db.ts)
6. the assistant reply is added back into the same context and returned to the frontend

## Persistence

Expenses are stored in:

- [data/expenses.json](/Users/riyaphade/Projects/expense_tracker/expense-mvp/data/expenses.json)

The DB layer is in:

- [src/db.ts](/Users/riyaphade/Projects/expense_tracker/expense-mvp/src/db.ts)

It automatically creates the file if missing and resets it to `[]` if the file is empty or invalid JSON.

## API

Expense REST API:

- `GET /api/expenses`
- `GET /api/expenses/:id`
- `POST /api/expenses`
- `PUT /api/expenses/:id`
- `DELETE /api/expenses/:id`

MCP chat endpoints:

- `POST /mcp/context`
- `POST /mcp/:contextId/msg`

## Scripts

```bash
npm run dev
npm run build
npm start
npm test
```

## Tests

There is currently a basic DB test in:

- [tests/expenses.test.ts](/Users/riyaphade/Projects/expense_tracker/expense-mvp/tests/expenses.test.ts)

Run:

```bash
npm test -- --run
```

## Current Behavior Notes

- the app is now LLM-driven for conversation routing
- no local regex-based intent router is used for normal chat decisions
- if the LLM is unavailable, chat behavior will degrade because routing depends on the model
- `qwen2.5:3b` currently behaves better than `orca-mini` for this project

## Main Files

- [src/mcp.ts](/Users/riyaphade/Projects/expense_tracker/expense-mvp/src/mcp.ts): conversation logic, LLM routing, clarification flow
- [src/server.ts](/Users/riyaphade/Projects/expense_tracker/expense-mvp/src/server.ts): Express server and endpoints
- [src/db.ts](/Users/riyaphade/Projects/expense_tracker/expense-mvp/src/db.ts): JSON persistence
- [frontend/app.js](/Users/riyaphade/Projects/expense_tracker/expense-mvp/frontend/app.js): browser chat client
- [frontend/index.html](/Users/riyaphade/Projects/expense_tracker/expense-mvp/frontend/index.html): UI shell
