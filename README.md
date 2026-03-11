# Expense MVP (TypeScript + Node + Gemini LLM)

This is a fully functional MVP expense tracker written in TypeScript with **Google Gemini LLM integration** for automatic expense categorization and extraction.

Features:
- REST API for expenses (CRUD operations)
- JSON-file persistence (data/expenses.json)
- Gemini LLM integration for natural language expense parsing
- MCP endpoints for context-aware conversation
- Frontend SPA for easy interaction
- Input validation using Zod

Getting started

1. Install dependencies

```bash
cd /Users/riyaphade/Projects/expense_tracker/expense-mvp
npm install
```

2. Create a `.env` file with your Gemini API credentials:

```env
GEMINI_API_KEY=your_google_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
PORT=4000
```

Get your API key from [Google AI Studio](https://studio.google.ai/).

3. Run in dev

```bash
npm run dev
```

API endpoints

- GET  /api/expenses          - list all expenses
- GET  /api/expenses/:id      - get single expense
- POST /api/expenses          - create expense (body JSON)
- PUT  /api/expenses/:id      - update expense
- DELETE /api/expenses/:id    - delete expense

MCP endpoints (skeleton)

- POST /mcp/context           - create context
- POST /mcp/:contextId/msg    - add message to context / optionally forward to LLM

Notes / Next steps

- Add a real DB (SQLite/Postgres) for production
- Wire an LLM provider in `src/mcp.ts` using an API key
- Add authentication and validation

Frontend

- A minimal single-page frontend is available under `frontend/` and is served by the server automatically.
- Start the server (`npm run dev`) and open http://localhost:4000/ to use the app. It uses the `/api/expenses` endpoints.


