import { describe, expect, it } from 'vitest';
import { createMcpServer } from '../src/mcp/server';

describe('mcp server shape', () => {
  it('builds an mcp server', () => {
    const server = createMcpServer();
    expect(server).toBeDefined();
  });
});
