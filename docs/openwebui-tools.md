# Open WebUI Tool Notes

This backend is intentionally minimal.

Open WebUI should decide how to interpret the user request. The backend just stores or returns JSON records.

## Base URL

```text
http://localhost:4000
```

## Minimal Tool Mapping

### `create_expense`

```text
POST /api/expenses
```

Send a small JSON object such as:

```json
{
  "description": "lunch",
  "amount": 12,
  "category": "Food",
  "notes": "optional"
}
```

### `list_expenses`

```text
GET /api/expenses
```

Optional query params:

- `limit`

### `get_expense`

```text
GET /api/expenses/:id
```

### `update_expense`

```text
PATCH /api/expenses/:id
```

Send only the fields you want to change.

### `delete_expense`

```text
DELETE /api/expenses/:id
```

## Practical Prompt Guidance

Tell the model:

- use `create_expense` when the user wants to save spending
- use `list_expenses` when it needs to find a previous record
- use `update_expense` and `delete_expense` only after it knows the target id
