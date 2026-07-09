# Expense MVP MCP Server

A minimal HTTP MCP expense and reminder server for Open WebUI and other MCP-compatible AI clients.

## Architecture

The project is intentionally simple:

- MCP tools are defined in [src/mcp/server.ts](/Users/riyashah/newProjects/expense-mvp/src/mcp/server.ts)
- business logic lives in [src/services/expenses.ts](/Users/riyashah/newProjects/expense-mvp/src/services/expenses.ts) and [src/services/reminders.ts](/Users/riyashah/newProjects/expense-mvp/src/services/reminders.ts)
- records are stored as line-delimited JSON in:
  - `data/expenses.txt`
  - `data/reminders.txt`

There is no REST API layer anymore. The MCP server is the primary interface, exposed over HTTP at `/mcp`.

## MCP Tools

- `list_expenses`
- `get_expense`
- `create_expense`
- `update_expense`
- `delete_expense`
- `list_reminders`
- `get_reminder`
- `create_reminder`
- `update_reminder`
- `delete_reminder`

Reminder inputs support `remindAt` as a parseable datetime string. Valid values are normalized to ISO 8601 before storage.

## Scripts

```bash
npm run dev
npm run build
npm start
npx vitest run
```

## MCP Client Setup

Start the server:

```bash
npm run build
npm start
```

By default it serves:

```text
http://localhost:4000/mcp
```

Health check:

```text
http://localhost:4000/health
```

Example Open WebUI-style MCP URL target:

```text
http://localhost:4000/mcp
```

## Testing

Quick verification flow:

```bash
npm run build
npx vitest run
npm start
```

Then connect an MCP client to `http://localhost:4000/mcp` and try:

1. `create_expense`
2. `list_expenses`
3. `create_reminder`
4. `list_reminders`
5. `update_reminder`
6. `delete_reminder`

## Docker

Build the MCP image:

```bash
docker build -t expense-mvp-mcp .
```

Run it:

```bash
docker compose up --build
```
