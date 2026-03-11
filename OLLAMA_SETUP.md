# Ollama Integration Guide

This expense tracker now supports **local LLM models via Ollama**, allowing you to run models privately without API costs.

## Quick Start

### 1. Start Ollama in Docker

```bash
docker run -d -p 11434:11434 --name ollama ollama/ollama
```

This starts Ollama and exposes it on `http://localhost:11434`.

### 2. Pull a Model

```bash
# Pull Mistral (fast, 7B parameters, ~4.1GB)
curl http://localhost:11434/api/pull -d '{"name":"mistral"}'

# Or pull other models:
# Llama 2 (larger, better quality)
curl http://localhost:11434/api/pull -d '{"name":"llama2"}'

# Neural Chat (smaller, faster)
curl http://localhost:11434/api/pull -d '{"name":"neural-chat"}'

# Orca Mini (smallest, fastest)
curl http://localhost:11434/api/pull -d '{"name":"orca-mini"}'
```

Wait for the download to complete (can take a few minutes depending on model size and internet speed).

### 3. Update `.env` File

```properties
# Switch to Ollama
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=mistral

# Or keep Gemini
# LLM_PROVIDER=gemini
```

### 4. Restart Your App

```bash
npm run dev
```

The app will now use your local Ollama model instead of Gemini!

---

## Available Models

| Model | Size | Speed | Quality | Best For |
|-------|------|-------|---------|----------|
| **mistral** | 7B | ⚡⚡⚡ | ⭐⭐⭐ | General purpose (Recommended) |
| **neural-chat** | 7B | ⚡⚡⚡ | ⭐⭐ | Conversational, fast responses |
| **orca-mini** | 3B | ⚡⚡⚡⚡ | ⭐⭐ | Minimal resources, quick |
| **llama2** | 7B | ⚡⚡ | ⭐⭐⭐⭐ | Better understanding, slower |
| **dolphin-mixtral** | 46B | ⚡ | ⭐⭐⭐⭐⭐ | Best quality (requires GPU) |

---

## Usage Examples

### Test Expense Analysis with Ollama

```bash
# Start dev server
npm run dev

# In another terminal, test the API
curl -X POST http://localhost:4000/mcp/context \
  -H "Content-Type: application/json" \
  -d '{}'

# Send an expense message
CTX_ID="<context-id-from-above>"
curl -X POST "http://localhost:4000/mcp/$CTX_ID/msg" \
  -H "Content-Type: application/json" \
  -d '{"role":"user","content":"I spent $50 on groceries","askLLM":true}'
```

---

## Troubleshooting

### "Ollama is not running" Error

```bash
# Check if Ollama container is running
docker ps | grep ollama

# If not running, start it
docker run -d -p 11434:11434 --name ollama ollama/ollama

# Or if container exists but stopped
docker start ollama
```

### Model Download Slow?

- Large models (7B+) take time. Use `orca-mini` for faster testing
- Check your internet speed
- Models are cached after first download

### Out of Memory?

Use smaller models:
```bash
# Pull orca-mini (3B, ~2GB RAM)
curl http://localhost:11434/api/pull -d '{"name":"orca-mini"}'
```

Update `.env`:
```properties
OLLAMA_MODEL=orca-mini
```

### Want to Use Gemini Again?

Just change `.env`:
```properties
LLM_PROVIDER=gemini
```

Restart the app.

---

## Performance Tips

1. **Use GPU** (if available):
   ```bash
   docker run -d -p 11434:11434 --gpus all --name ollama ollama/ollama
   ```

2. **Reduce Token Limits** in code for faster responses:
   - Lower `maxOutputTokens` in `analyzeAndStoreExpense()`
   - Expense extraction doesn't need verbose responses

3. **Use Appropriate Model Size**:
   - 3B: Fastest, minimal resources
   - 7B: Good balance (recommended)
   - 13B+: Better quality, slower

4. **Warm Up** the model (first request is slowest):
   ```bash
   # After pulling, send a test request to warm up
   curl http://localhost:11434/api/generate \
     -d '{"model":"mistral","prompt":"test","stream":false}'
   ```

---

## How It Works

1. Your prompt goes to the unified `callLLM()` function
2. It checks `LLM_PROVIDER` env var
3. If `ollama`: calls `callOllama()` → `http://localhost:11434/api/generate`
4. If `gemini`: calls original `callGemini()` → Google API
5. Response is parsed and used for expense extraction/storage

---

## Privacy & Offline

✅ **With Ollama:**
- Models run locally on your machine
- No data sent to external APIs
- Works completely offline
- Free (after initial download)

❌ **With Gemini:**
- API calls sent to Google
- Requires internet
- Uses API quota/costs

---

## Next Steps

1. **Pull a model**: `curl http://localhost:11434/api/pull -d '{"name":"mistral"}'`
2. **Update `.env`**: Set `LLM_PROVIDER=ollama`
3. **Test it**: Send an expense message through the app
4. **Monitor**: Check `data/expenses.json` to see parsed results

Questions? Check the server logs for debugging info!
