// Minimal MCP chat client — safer DOM handling and improved error handling
let contextId = null;

function safe(el) { return (el instanceof Element) ? el : null; }

function makeClient(els) {
  const { MESSAGES_EL, PROMPT_EL, SEND_BTN, NEW_CTX_BTN } = els;

  function appendMessage(role, text) {
    if (!MESSAGES_EL) return;
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + role;
    const p = document.createElement('div');
    p.className = 'msg-text';
    p.textContent = text;
    wrap.appendChild(p);
    MESSAGES_EL.appendChild(wrap);
    MESSAGES_EL.scrollTop = MESSAGES_EL.scrollHeight;
  }

  function setLoading(state) {
    if (SEND_BTN) SEND_BTN.disabled = state;
    if (PROMPT_EL) PROMPT_EL.disabled = state;
    if (SEND_BTN) SEND_BTN.textContent = state ? 'Sending…' : 'Send';
  }

  async function createContext(title = 'frontend-context') {
    const res = await fetch('/mcp/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) throw new Error('Failed to create context');
    const ctx = await res.json();
    contextId = ctx.id;
    appendMessage('system', `New context created: ${contextId}`);
    return ctx;
  }

  async function sendPrompt() {
    const text = (PROMPT_EL?.value || '').trim();
    if (!text) return;
    if (!contextId) {
      try {
        await createContext();
      } catch (err) {
        alert('Could not create context: ' + String(err));
        return;
      }
    }

    appendMessage('user', text);
    if (PROMPT_EL) PROMPT_EL.value = '';
    setLoading(true);

    try {
      const res = await fetch(`/mcp/${encodeURIComponent(contextId)}/msg`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'user', content: text, askLLM: true }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        appendMessage('system', `Error: ${payload.error || res.statusText}`);
        return;
      }
      const payload = await res.json().catch(() => ({}));
      // payload may contain { message, assistant } where assistant is assistant text
      if (payload.assistant) {
        appendMessage('assistant', payload.assistant);
      } else if (payload.message && payload.message.role === 'assistant' && payload.message.content) {
        appendMessage('assistant', payload.message.content);
      } else {
        // try to infer assistant text from common fields
        const inferred = payload?.message?.content || payload?.text || payload?.response || null;
        if (inferred) appendMessage('assistant', String(inferred));
        else appendMessage('system', 'No assistant reply (empty payload)');
      }
    } catch (err) {
      appendMessage('system', 'Request failed: ' + String(err));
    } finally {
      setLoading(false);
    }
  }

  function clearMessages() {
    if (MESSAGES_EL) MESSAGES_EL.innerHTML = '';
  }

  // Wire events
  if (SEND_BTN) SEND_BTN.addEventListener('click', sendPrompt);
  if (PROMPT_EL) {
    PROMPT_EL.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        sendPrompt();
      }
    });
  }
  if (NEW_CTX_BTN) NEW_CTX_BTN.addEventListener('click', async () => {
    try {
      await createContext('user-created');
      clearMessages();
    } catch (err) {
      appendMessage('system', 'Could not create context: ' + String(err));
    }
  });

  // create initial context
  (async () => {
    try {
      await createContext('initial');
    } catch (err) {
      appendMessage('system', 'Could not create initial context: ' + String(err));
    }
  })();

  return { createContext, sendPrompt };
}

document.addEventListener('DOMContentLoaded', () => {
  const els = {
    MESSAGES_EL: safe(document.getElementById('messages')),
    PROMPT_EL: safe(document.getElementById('prompt')),
    SEND_BTN: safe(document.getElementById('send')),
    NEW_CTX_BTN: safe(document.getElementById('new-context')),
  };
  makeClient(els);
});
