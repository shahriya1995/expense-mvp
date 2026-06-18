import express from 'express';
import bodyParser from 'body-parser';
import expenses from './handlers/expenses';
import reminders from './handlers/reminders';
import { getStorePaths } from './db';

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
        expenses: {
          list: 'GET /api/expenses',
          raw: 'GET /api/expenses/raw',
          get: 'GET /api/expenses/:id',
          create: 'POST /api/expenses',
          update: 'PATCH /api/expenses/:id',
          remove: 'DELETE /api/expenses/:id',
        },
        reminders: {
          list: 'GET /api/reminders',
          raw: 'GET /api/reminders/raw',
          get: 'GET /api/reminders/:id',
          create: 'POST /api/reminders',
          update: 'PATCH /api/reminders/:id',
          remove: 'DELETE /api/reminders/:id',
        },
      },
      storage: getStorePaths(),
    })
  );

  app.use('/api/expenses', expenses);
  app.use('/api/reminders', reminders);

  return app;
}
