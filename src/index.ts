import dotenv from 'dotenv';
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['GEMINI_API_KEY'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

import { createServer } from './server';

const port = Number(process.env.PORT || 4000);

const app = createServer();

app.listen(port, () => {
  console.log(`Expense MVP server listening on http://localhost:${port}`);
});
