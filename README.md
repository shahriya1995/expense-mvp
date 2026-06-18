# Expense MVP API

A minimal backend for Open WebUI.

The idea is simple:

- Open WebUI and the model decide what an expense means
- this backend stores whatever structured JSON the tool sends
- expense and reminder records are saved as plain text lines in `data/expenses.txt` and `data/reminders.txt`

There is very little backend opinion now. The server mostly saves, lists, updates, and deletes records.

## Storage

Records are stored in:

- `data/expenses.txt`
- `data/reminders.txt`

Each line is one JSON object.

## API

- `GET /`
- `GET /api/expenses`
- `GET /api/expenses/raw`
- `GET /api/expenses/:id`
- `POST /api/expenses`
- `PATCH /api/expenses/:id`
- `PUT /api/expenses/:id`
- `DELETE /api/expenses/:id`
- `GET /api/reminders`
- `GET /api/reminders/raw`
- `GET /api/reminders/:id`
- `POST /api/reminders`
- `PATCH /api/reminders/:id`
- `PUT /api/reminders/:id`
- `DELETE /api/reminders/:id`

### Create

Send any JSON object you want to store.

Example:

```json
{
  "description": "lunch",
  "amount": 12,
  "category": "Food",
  "notes": "client meeting"
}
```

The backend adds:

- `id`
- `savedAt`
- `date` if you did not send one

### List

`GET /api/expenses`

Optional:

- `limit`

### Raw

`GET /api/expenses/raw`

Returns the text file view directly.

### Reminders

Send any JSON object you want to store as a reminder.

Example:

```json
{
  "text": "pay rent",
  "remindAt": "2026-06-20T09:00:00Z",
  "status": "not_complete"
}
```

The backend adds:

- `id`
- `savedAt`
- `status` as `not_complete` unless you set it to `complete`

## Open WebUI

Keep the tool interface lightweight. Let the model decide:

- description
- amount
- category
- notes
- reminder text
- reminder time
- reminder status as `complete` or `not_complete`

The backend just stores the resulting JSON.

## Scripts

```bash
npm run dev
npm run build
npm start
npm test -- --run
```
