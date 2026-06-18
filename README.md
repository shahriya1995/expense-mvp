# Expense MVP API

A minimal backend for Open WebUI.

The idea is simple:

- Open WebUI and the model decide what an expense means
- this backend stores whatever structured JSON the tool sends
- expense records are saved as plain text lines in `data/expenses.txt`

There is very little backend opinion now. The server mostly saves, lists, updates, and deletes records.

## Storage

Records are stored in:

- `data/expenses.txt`

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

## Open WebUI

Keep the tool interface lightweight. Let the model decide:

- description
- amount
- category
- notes

The backend just stores the resulting JSON.

## Scripts

```bash
npm run dev
npm run build
npm start
npm test -- --run
```
