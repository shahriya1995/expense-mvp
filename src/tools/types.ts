export interface ToolDefinition<TArgs = any, TResult = any> {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: TArgs) => Promise<TResult>;
}

export interface ToolCall {
  tool: string;
  arguments: Record<string, unknown>;
}
