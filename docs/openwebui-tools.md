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

### `create_reminder`

```text
POST /api/reminders
```

Send a small JSON object such as:

```json
{
  "text": "pay rent",
  "remindDate": "2026-06-20",
  "remindTime": "09:00",
  "status": "not_complete"
}
```

Prefer `remindDate` plus `remindTime` so the tool can build the final timestamp for the model.
Optional `remindTimezone` can override the default timezone.
`remindAt` is still supported, but only use it when you already have an exact timestamp.
The API normalizes valid values to ISO 8601 before storing them and rejects invalid values.

### `list_reminders`

```text
GET /api/reminders
```

Optional query params:

- `limit`

### `update_reminder`

```text
PATCH /api/reminders/:id
```

Send only the fields you want to change.

### `delete_reminder`

```text
DELETE /api/reminders/:id
```

## Practical Prompt Guidance

Tell the model:

- use `create_expense` when the user wants to save spending
- use `list_expenses` when it needs to find a previous record
- use `update_expense` and `delete_expense` only after it knows the target id
- use `create_reminder` when the user wants to remember something later
- prefer `remindDate` and `remindTime` over building `remindAt` manually
- call `get_current_datetime` before resolving relative phrases like `tomorrow`, `next Friday`, or `in two hours`
- use `list_reminders` before updating or deleting a reminder if the id is unknown
- reminder status should be either `complete` or `not_complete`
