import express from 'express';
import bodyParser from 'body-parser';
import expenses from './handlers/expenses';
import { getStorePath } from './db';

export function createServer() {
  const app = express();
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  });
  app.use(bodyParser.json());
  app.get('/', (_req, res) =>
    res.json({
      name: 'expense-mvp-api',
      status: 'ok',
      endpoints: {
        list: 'GET /api/expenses',
        raw: 'GET /api/expenses/raw',
        get: 'GET /api/expenses/:id',
        create: 'POST /api/expenses',
        update: 'PATCH /api/expenses/:id',
        remove: 'DELETE /api/expenses/:id',
      },
      storage: getStorePath(),
    })
  );

  app.use('/api/expenses', expenses);

  return app;
}
