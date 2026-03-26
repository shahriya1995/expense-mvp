# Expense MVP

A chat-first expense tracker built with Node.js, TypeScript, and Express. The app keeps a lightweight conversation context, lets an LLM choose internal tools, stores expenses in a JSON file, and renders both chat replies and structured data results in the UI.

## What It Does

You type naturally in the chat UI. The assistant can:

- add an expense
- update an expense
- delete an expense
- list stored expenses
- summarize the current month
- ask a short follow-up question when a request is unclear

Examples:

- `I spent $12 on lunch`
- `show me my last 3 expenses`
- `how much did I spend this month?`
- `delete office expenses`
- `update my lunch expense to $15`

## Architecture

The app uses an internal MCP-style tool loop:

1. the frontend sends a chat message to `POST /mcp/:contextId/msg`
2. `src/mcp.ts` sends recent conversation plus any relevant tool context to the LLM
3. the LLM returns JSON with:
   - `reply`
   - `tool_calls`
4. the server executes those tool calls
5. the LLM can be called again to produce a final natural-language reply grounded in the tool results
6. the frontend renders:
   - the assistant reply
   - a structured result block for things like expense lists and monthly summaries

### System Diagram

```mermaid
flowchart TD
    U[User Browser]
    NASIP[NAS IP Address]
    NAS[Synology NAS]
    DC[Docker / Container Manager]
    APP[Expense MVP Container<br/>Node.js + Express]
    FE[Frontend<br/>frontend/index.html, app.js, styles.css]
    API[Express Routes<br/>src/server.ts]
    MCP[MCP / Chat Orchestrator<br/>src/mcp.ts]
    TOOLS[Tool Layer<br/>src/tools/*]
    DB[JSON Persistence<br/>src/db.ts]
    FILE[data/expenses.json]
    GEM[Google Gemini API]

    U --> NASIP
    NASIP --> APP
    NAS --> DC
    DC --> APP
    APP --> FE
    APP --> API
    API --> MCP
    MCP --> TOOLS
    TOOLS --> DB
    DB --> FILE
    MCP --> GEM
```

### Architecture Flow

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant App as Expense MVP App
    participant MCP as src/mcp.ts
    participant Tools as Tool Layer
    participant DB as data/expenses.json
    participant Gemini as Gemini API

    User->>Browser: Type message
    Browser->>App: Open http://NAS_IP:4000
    Browser->>App: POST /mcp/:contextId/msg
    App->>MCP: handleConversationTurn(...)
    MCP->>Gemini: Send prompt
    Gemini-->>MCP: Reply + tool calls
    MCP->>Tools: Execute tools
    Tools->>DB: Read/write expenses.json
    DB-->>Tools: Return stored data
    Tools-->>MCP: Tool results
    MCP->>Gemini: Optional final reply
    Gemini-->>MCP: Final assistant text
    MCP-->>App: assistant + toolResults
    App-->>Browser: JSON response
    Browser-->>User: Render chat UI
```

## Tools

Internal tools live in `src/tools/`:

- `src/tools/createExpense.ts`
- `src/tools/updateExpense.ts`
- `src/tools/deleteExpense.ts`
- `src/tools/listExpenses.ts`
- `src/tools/monthlySummary.ts`

Important behavior:

- `list_expenses` is capped at **4 expenses max**
- the LLM is told not to ask `list_expenses` for more than 4
- follow-up delete/update replies like `delete 2` use the previous tool result context

## LLM Setup

The app currently uses Gemini for chat and tool orchestration.

Current `.env` example:

```env
LLM_PROVIDER=gemini

GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-2.5-flash

PORT=4000
```

Notes:

- Gemini is called remotely through Google’s API
- `src/index.ts` only requires Gemini credentials when `LLM_PROVIDER=gemini`
- local models can be added later if you want to run the LLM stack on your own machine or private infrastructure

## Setup

1. Configure `.env`

2. Start the app with Docker Compose

```bash
docker-compose up
```

Open:

```text
http://localhost:3000
```

The app is Dockerized and stores expense data in the local `data/` folder through a bind mount.

## Frontend

### UI Examples

![Expense MVP UI](expense%20mvp.png)

## Persistence

Expenses are stored in:

- `data/expenses.json`

The JSON DB layer is in:

- `src/db.ts`

It:

- creates the file if missing
- resets the store to `[]` if the file is empty or invalid

## API

Expense REST API:

- `GET /api/expenses`
- `GET /api/expenses/:id`
- `POST /api/expenses`
- `PUT /api/expenses/:id`
- `DELETE /api/expenses/:id`

Chat endpoints:

- `POST /mcp/context`
- `POST /mcp/:contextId/msg`

The chat response includes:

- `assistant`
- `stored`
- `storeCount`
- `detectedExpense`
- `toolCalls`
- `toolResults`

## Scripts

```bash
npm run dev
npm run build
npm start
npm test
```

## Tests

Tests currently cover:

- basic DB operations in `tests/expenses.test.ts`
- tool registry operations in `tests/tools.test.ts`

Run:

```bash
npm test -- --run
```
