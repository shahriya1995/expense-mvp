/**
 * Ollama LLM Integration
 * 
 * Provides a local LLM interface using Ollama running in Docker.
 * 
 * Prerequisites:
 * - Ollama running in Docker: docker run -d -p 11434:11434 ollama/ollama
 * - A model pulled: curl http://localhost:11434/api/pull -d '{"name":"mistral"}'
 * 
 * Environment variables:
 * - OLLAMA_BASE_URL: Base URL for Ollama (default: http://localhost:11434)
 * - OLLAMA_MODEL: Model name (default: mistral)
 */

function getFetch(): typeof fetch {
  const _fetch: typeof fetch | undefined = (globalThis as any).fetch;
  if (!_fetch) {
    throw new Error(
      'Runtime fetch() not available. Please run Node 18+ or install a fetch polyfill.'
    );
  }
  return _fetch;
}

function getOllamaUrl(): string {
  return process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
}

function getOllamaModel(): string {
  return process.env.OLLAMA_MODEL || 'mistral';
}

function getOllamaKeepAlive(): string {
  return process.env.OLLAMA_KEEP_ALIVE || '30m';
}

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Call Ollama API for text generation.
 * Uses the Ollama chat endpoint.
 */
export async function callOllama(opts: {
  userText?: string;
  messages?: OllamaChatMessage[];
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<string> {
  const baseUrl = getOllamaUrl();
  const model = getOllamaModel();
  const _fetch = getFetch();

  const url = `${baseUrl}/api/chat`;

  const messages =
    opts.messages && opts.messages.length > 0
      ? opts.messages
      : [
          ...(opts.systemInstruction
            ? [{ role: 'system' as const, content: opts.systemInstruction }]
            : []),
          ...(opts.userText
            ? [{ role: 'user' as const, content: opts.userText }]
            : []),
        ];

  const body = {
    model,
    messages,
    stream: false,
    keep_alive: getOllamaKeepAlive(),
    options: {
      temperature: opts.temperature ?? 0.7,
      num_predict: opts.maxOutputTokens ?? 512,
    },
  };

  try {
    const res = await _fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    return data.message?.content || '';
  } catch (err: any) {
    throw new Error(`Ollama request failed: ${String(err?.message || err)}`);
  }
}

/**
 * Check if Ollama is available and responsive.
 */
export async function checkOllamaHealth(): Promise<boolean> {
  const baseUrl = getOllamaUrl();
  const _fetch = getFetch();

  try {
    const res = await _fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Get list of available models in Ollama.
 */
export async function getOllamaModels(): Promise<string[]> {
  const baseUrl = getOllamaUrl();
  const _fetch = getFetch();

  try {
    const res = await _fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
    });

    if (!res.ok) {
      throw new Error(`Failed to get models: ${res.statusText}`);
    }

    const data = await res.json();
    return data.models?.map((m: any) => m.name) || [];
  } catch (err: any) {
    console.error('Failed to get Ollama models:', String(err?.message || err));
    return [];
  }
}

/**
 * Pull a model from Ollama hub.
 * Example: await pullOllamaModel('mistral')
 */
export async function pullOllamaModel(modelName: string): Promise<boolean> {
  const baseUrl = getOllamaUrl();
  const _fetch = getFetch();

  const url = `${baseUrl}/api/pull`;

  try {
    const res = await _fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: modelName }),
    });

    if (!res.ok) {
      throw new Error(`Failed to pull model: ${res.statusText}`);
    }

    console.log(`[OLLAMA] Model '${modelName}' pulled successfully`);
    return true;
  } catch (err: any) {
    console.error(`[OLLAMA] Failed to pull model '${modelName}':`, String(err?.message || err));
    return false;
  }
}
