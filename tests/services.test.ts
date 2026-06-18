import { describe, expect, it } from 'vitest';
import { createServer } from '../src/server';

describe('server shape', () => {
  it('builds an express app', () => {
    const app = createServer();
    expect(app).toBeDefined();
  });
});
