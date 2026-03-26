// Minimal MCP chat client — safer DOM handling and improved error handling
let contextId = null;

function safe(el) { return (el instanceof Element) ? el : null; }

function makeClient(els) {
  const { MESSAGES_EL, PROMPT_EL, SEND_BTN, NEW_CTX_BTN } = els;

  function autoResizePrompt() {
    if (!PROMPT_EL) return;
    PROMPT_EL.style.height = '0px';
    const nextHeight = Math.min(PROMPT_EL.scrollHeight, 180);
    PROMPT_EL.style.height = `${Math.max(nextHeight, 56)}px`;
  }

  function appendMessage(role, text, extraClass = '') {
    if (!MESSAGES_EL) return;
    const wrap = document.createElement('div');
    wrap.className = `msg ${role}${extraClass ? ` ${extraClass}` : ''}`;
    const p = document.createElement('div');
    p.className = 'msg-text';
    p.textContent = text;
    wrap.appendChild(p);
    MESSAGES_EL.appendChild(wrap);
    MESSAGES_EL.scrollTop = MESSAGES_EL.scrollHeight;
  }

  function formatCurrency(amountCents) {
    return `$${(Number(amountCents || 0) / 100).toFixed(2)}`;
  }

  function formatStructuredResponse(toolResults) {
    if (!Array.isArray(toolResults) || toolResults.length === 0) return null;

    for (const entry of toolResults) {
      if (entry.tool === 'list_expenses' && Array.isArray(entry.result)) {
        if (entry.result.length === 0) {
          return 'No matching expenses found.';
        }

        return [
          'Expenses:',
          ...entry.result.map((expense, index) =>
            `${index + 1}. ${expense.description || 'Untitled'} - ${formatCurrency(expense.amount)}`
          ),
        ].join('\n');
      }

      if (entry.tool === 'monthly_summary' && entry.result && typeof entry.result === 'object') {
        const summary = entry.result;
        const categories = Object.entries(summary.byCategory || {})
          .sort((a, b) => Number(b[1]) - Number(a[1]))
          .map(([category, amount]) => `${category}: ${formatCurrency(amount)}`);

        return [
          `This month: ${formatCurrency(summary.total || 0)} across ${summary.count || 0} expenses`,
          ...categories,
        ].join('\n');
      }
    }

    return null;
  }

  function isLowQualityListReply(text) {
    if (!text) return true;
    const normalized = String(text).trim();
    if (!normalized) return true;

    const blankListPattern = /1\.\s*(?:\n|$)\s*2\.\s*(?:\n|$)\s*3\.\s*(?:\n|$)/;
    if (blankListPattern.test(normalized)) return true;

    const placeholderPattern = /\[\s*(id|expense|entry|display details)/i;
    if (placeholderPattern.test(normalized)) return true;

    return false;
  }

  function setLoading(state) {
    if (SEND_BTN) SEND_BTN.disabled = state;
    if (PROMPT_EL) PROMPT_EL.disabled = state;
    if (SEND_BTN) SEND_BTN.innerHTML = state
      ? '<span class="send-icon" aria-hidden="true">…</span>'
      : '<span class="send-icon" aria-hidden="true">↑</span>';
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
    autoResizePrompt();
    setLoading(true);

    try {
      const res = await fetch(`/mcp/${encodeURIComponent(contextId)}/msg`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'user', content: text, askLLM: true }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        appendMessage('system', `I hit an error: ${payload.error || res.statusText}`);
        return;
      }
      const payload = await res.json().catch(() => ({}));
      // payload may contain { message, assistant } where assistant is assistant text
      if (payload.assistant) {
        const structuredText = formatStructuredResponse(payload.toolResults);
        const shouldSuppressAssistant =
          structuredText && isLowQualityListReply(payload.assistant);

        if (!shouldSuppressAssistant) {
          appendMessage('assistant', payload.assistant);
        }

        if (structuredText) {
          appendMessage('assistant', structuredText, 'data');
        }
      } else if (payload.message && payload.message.role === 'assistant' && payload.message.content) {
        appendMessage('assistant', payload.message.content);
      } else {
        // try to infer assistant text from common fields
        const inferred = payload?.message?.content || payload?.text || payload?.response || null;
        if (inferred) appendMessage('assistant', String(inferred));
        else appendMessage('system', 'No assistant reply (empty payload)');
      }
    } catch (err) {
      appendMessage('system', 'I could not send that message. ' + String(err));
    } finally {
      setLoading(false);
      PROMPT_EL?.focus();
    }
  }

  function clearMessages() {
    if (MESSAGES_EL) MESSAGES_EL.innerHTML = '';
  }

  // Wire events
  if (SEND_BTN) SEND_BTN.addEventListener('click', sendPrompt);
  if (PROMPT_EL) {
    autoResizePrompt();
    PROMPT_EL.addEventListener('input', autoResizePrompt);
    PROMPT_EL.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendPrompt();
      }
    });
  }
  if (NEW_CTX_BTN) NEW_CTX_BTN.addEventListener('click', async () => {
    try {
      await createContext('user-created');
      clearMessages();
      appendMessage('assistant', 'Fresh start. Tell me about an expense, or we can just chat.');
    } catch (err) {
      appendMessage('system', 'I could not start a new chat. ' + String(err));
    }
  });

  // create initial context
  (async () => {
    try {
      await createContext('initial');
      appendMessage('assistant', 'Hi. Tell me what you spent, or ask me anything about your expenses.');
    } catch (err) {
      appendMessage('system', 'I could not start the chat. ' + String(err));
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
