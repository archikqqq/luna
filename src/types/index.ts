export type ThemeMode = "light" | "dark" | "system";

export type ProviderKind =
  | "openai-compatible"
  | "anthropic"
  | "gemini-native"
  | "azure-openai"
  | "bedrock"
  | "vertex"
  | "demo";

export interface Appearance {
  mode: ThemeMode;
  seed: string;
}

export interface ProviderPreset {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  keyUrl: string;
  keyRequired: boolean;
  examples: string[];
  confirmed: boolean;
  notes: string | null;
  environmentVariables: string[];
  keywords?: string[];
}

export interface Provider {
  id: string;
  presetId: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  models: string[];
  hasKey: boolean;
  keyRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  storageRef: string | null;
}

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ImageBlock {
  type: "image";
  mimeType: string;
  data: string;
}

export interface ToolCallBlock {
  type: "tool_call";
  id: string;
  name: string;
  arguments: string;
}

export interface ToolResultBlock {
  type: "tool_result";
  id: string;
  content: string;
  isError: boolean;
}

export type ContentBlock =
  | TextBlock
  | ImageBlock
  | ToolCallBlock
  | ToolResultBlock;

export interface Chat {
  id: string;
  title: string;
  providerId: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  chatId: string;
  role: "user" | "assistant" | "system" | "tool";
  blocks: ContentBlock[];
  attachments: Attachment[];
  status: "complete" | "streaming" | "stopped" | "error";
  providerId: string;
  model: string;
  createdAt: string;
  error: string | null;
  usage?: Usage;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface SendRequest {
  provider: Provider;
  model: string;
  messages: Message[];
}

export interface StreamEvent {
  type:
    | "text_delta"
    | "reasoning_delta"
    | "tool_call"
    | "usage"
    | "done"
    | "error";
  delta?: string;
  id?: string;
  name?: string;
  arguments?: string;
  usage?: Usage;
  message?: string;
}

export interface StreamOptions {
  signal: AbortSignal;
  onChunk: (chunk: string) => void;
  onEvent?: (event: StreamEvent) => void;
}
