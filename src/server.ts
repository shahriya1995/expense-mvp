import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import expenses from './handlers/expenses';
import * as mcp from './mcp';

export function createServer() {
  const app = express();
  app.use(bodyParser.json());
  // Serve frontend static files from /frontend
  const FRONTEND_DIR = path.join(process.cwd(), 'frontend');
  app.use(express.static(FRONTEND_DIR));

  app.get('/', (req, res) => res.send('Expense MVP')); 

  app.use('/api/expenses', expenses);

  // MCP endpoints (minimal)
  app.post('/mcp/context', (req, res) => {
    const { title } = req.body || {};
    const c = mcp.createContext(title);
    res.status(201).json(c);
  });

  app.post('/mcp/:contextId/msg', async (req, res) => {
    const { contextId } = req.params;
    const { role, content, askLLM } = req.body || {};
    const msg = mcp.addMessage(contextId, role || 'user', content || '');
    if (!msg) return res.status(404).json({ error: 'context not found' });

    if (askLLM) {
      // Always try to analyze and store as an expense first
      try {
        const result = await mcp.analyzeAndStoreExpense(content || '');
        mcp.addMessage(contextId, 'assistant', result.assistantText || '');
        return res.json({ 
          message: msg, 
          assistant: result.assistantText, 
          stored: result.stored,
          storeCount: result.stored.length 
        });
      } catch (err: any) {
        const e = String(err);
        console.error('[SERVER] analyzeAndStoreExpense failed:', e);
        mcp.addMessage(contextId, 'assistant', e);
        return res.status(500).json({ error: e });
      }
    }

    res.status(201).json({ message: msg });
  });

  // For SPA client-side routing: fallback to index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
  });

  return app;
}
