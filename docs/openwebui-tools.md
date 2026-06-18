# Open WebUI Tool Mapping

This backend is meant to sit behind Open WebUI. Open WebUI should own:

- the model
- the chat UI
- the system prompt
- tool calling

This API should own:

- expense validation
- expense storage
- expense business logic

## Backend Base URL

Use your running API base URL, for example:

```text
http://localhost:4000
```

## Suggested Tools

### `create_expense`

Method:

```text
POST /api/expenses
```

Body:

```json
{
  "description": "Lunch",
  "amount": 12.5,
  "currency": "USD",
  "category": "Food",
  "notes": "optional",
  "date": "2026-06-17T19:30:00.000Z"
}
```

### `list_expenses`

Method:

```text
GET /api/expenses
```

Optional query params:

- `category`
- `limit`
- `month`
- `year`
- `date_from`
- `date_to`
- `relative_day`
- `days_back`

Examples:

```text
GET /api/expenses?limit=3
GET /api/expenses?relative_day=today
GET /api/expenses?category=Food&days_back=7
```

### `get_expense`

Method:

```text
GET /api/expenses/:id
```

### `update_expense`

Method:

```text
PATCH /api/expenses/:id
```

Body:

```json
{
  "description": "Lunch with client",
  "amount": 18,
  "category": "Meals",
  "notes": "optional",
  "date": "2026-06-17T19:30:00.000Z"
}
```

### `delete_expense`

Method:

```text
DELETE /api/expenses/:id
```

### `monthly_summary`

Method:

```text
GET /api/expenses/summary/monthly
```

Optional query params:

- `month`
- `year`

Example:

```text
GET /api/expenses/summary/monthly?month=6&year=2026
```

## Prompt Guidance for Open WebUI

Your Open WebUI system prompt should tell the model:

- use `create_expense` when the user clearly wants to add an expense
- use `list_expenses` for recent expenses, category lookups, or finding a target before update/delete
- use `monthly_summary` for totals and monthly spending breakdowns
- if a user wants to update or delete an expense but no `id` is known, call `list_expenses` first
- ask a short clarification question if amount, description, or target expense is ambiguous

## Important Data Notes

- API `amount` inputs are in dollars
- stored amounts are kept in cents internally
- summary totals are returned in cents
- expense dates should be ISO timestamps
