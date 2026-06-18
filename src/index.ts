import dotenv from 'dotenv';
dotenv.config();

import { createServer } from './server';

const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || '0.0.0.0';

const app = createServer();

app.listen(port, host, () => {
  console.log(`Expense MVP server listening on http://${host}:${port}`);
});
