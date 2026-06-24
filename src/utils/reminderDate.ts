export function normalizeReminderDate(value: unknown): string | undefined {
  if (value == null || value === '') return undefined;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined;
    return value.toISOString();
  }

  if (typeof value === 'number') {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    return date.toISOString();
  }

  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;

  return parsed.toISOString();
}
