import dotenv from 'dotenv';
dotenv.config();

const provider = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();

if (provider === 'gemini' && !process.env.GEMINI_API_KEY && !process.env.GEMINI_BEARER_TOKEN) {
  throw new Error('Missing required environment variable: GEMINI_API_KEY or GEMINI_BEARER_TOKEN');
}

import { createServer } from './server';

const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || '0.0.0.0';

const app = createServer();

app.listen(port, host, () => {
  console.log(`Expense MVP server listening on http://${host}:${port}`);
});
