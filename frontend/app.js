// Minimal MCP chat client — safer DOM handling and improved error handling
let contextId = null;

function safe(el) { return (el instanceof Element) ? el : null; }

function makeClient(els) {
  const { MESSAGES_EL, PROMPT_EL, SEND_BTN, NEW_CTX_BTN, EXPENSES_LIST_EL } = els;

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

  function isCurrentMonth(dateValue) {
    const date = new Date(dateValue || '');
    if (Number.isNaN(date.getTime())) return false;
    const now = new Date();
    return (
      date.getUTCFullYear() === now.getUTCFullYear() &&
      date.getUTCMonth() === now.getUTCMonth()
    );
  }

  async function refreshExpenses() {
    if (!EXPENSES_LIST_EL) return;

    try {
      const res = await fetch('/api/expenses');
      if (!res.ok) throw new Error(res.statusText);
      const expenses = await res.json();
      const monthly = Array.isArray(expenses) ? expenses.filter((expense) => isCurrentMonth(expense.date)) : [];
      const grouped = monthly.reduce((acc, expense) => {
        const key = expense.category || 'Uncategorized';
        acc[key] = (acc[key] || 0) + Number(expense.amount || 0);
        return acc;
      }, {});
      const rows = Object.entries(grouped).sort((a, b) => Number(b[1]) - Number(a[1]));

      EXPENSES_LIST_EL.innerHTML = '';

      if (rows.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'meta';
        empty.textContent = 'No expenses for this month yet.';
        EXPENSES_LIST_EL.appendChild(empty);
        return;
      }

      const total = monthly.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
      const totalItem = document.createElement('div');
      totalItem.className = 'expense-item';
      totalItem.innerHTML = `<div><div>Total</div><div class="meta">${monthly.length} expenses</div></div><strong>${formatCurrency(total)}</strong>`;
      EXPENSES_LIST_EL.appendChild(totalItem);

      rows.forEach(([category, amountCents]) => {
        const item = document.createElement('div');
        item.className = 'expense-item';

        const details = document.createElement('div');
        const title = document.createElement('div');
        title.textContent = category;

        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = 'Current month';

        details.appendChild(title);
        details.appendChild(meta);

        const amount = document.createElement('strong');
        amount.textContent = formatCurrency(amountCents);

        item.appendChild(details);
        item.appendChild(amount);
        EXPENSES_LIST_EL.appendChild(item);
      });
    } catch (err) {
      EXPENSES_LIST_EL.innerHTML = '';
      const error = document.createElement('div');
      error.className = 'meta';
      error.textContent = 'Could not load expenses.';
      EXPENSES_LIST_EL.appendChild(error);
    }
  }

  function setLoading(state) {
    if (SEND_BTN) SEND_BTN.disabled = state;
    if (PROMPT_EL) PROMPT_EL.disabled = state;
    if (SEND_BTN) SEND_BTN.textContent = state ? 'Entering…' : 'Enter';
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
        await refreshExpenses();
      } else if (payload.message && payload.message.role === 'assistant' && payload.message.content) {
        appendMessage('assistant', payload.message.content);
        await refreshExpenses();
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
      await refreshExpenses();
    } catch (err) {
      appendMessage('system', 'I could not start a new chat. ' + String(err));
    }
  });

  // create initial context
  (async () => {
    try {
      await createContext('initial');
      appendMessage('assistant', 'Hi. Tell me what you spent, or ask me anything about your expenses.');
      await refreshExpenses();
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
    EXPENSES_LIST_EL: safe(document.getElementById('expenses-list')),
  };
  makeClient(els);
});
