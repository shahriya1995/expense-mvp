import { describe, expect, it } from 'vitest';
import { normalizeReminderDate } from '../src/utils/reminderDate';

describe('normalizeReminderDate', () => {
  it('normalizes ISO-like date strings to ISO timestamps', () => {
    expect(normalizeReminderDate('2026-06-20T09:00:00Z')).toBe('2026-06-20T09:00:00.000Z');
  });

  it('accepts local datetime strings and returns a stored ISO timestamp', () => {
    expect(normalizeReminderDate('2026-06-20T09:00')).toMatch(/^2026-06-20T/);
  });

  it('rejects invalid values', () => {
    expect(normalizeReminderDate('nextish Tuesday maybe')).toBeUndefined();
    expect(normalizeReminderDate({})).toBeUndefined();
  });
});
