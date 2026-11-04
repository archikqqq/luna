export type ThemeMode = "light" | "dark" | "system";
export interface Appearance {
  mode: ThemeMode;
  seed: string;
}
export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  models: string[];
  hasKey: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  // Future backend-managed asset reference. Never a File or browser URL.
  storageRef: string | null;
}
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
  role: "user" | "assistant";
  content: string;
  attachments: Attachment[];
  status: "complete" | "streaming" | "stopped" | "error";
  providerId: string;
  model: string;
  createdAt: string;
  error: string | null;
}
export interface SendRequest {
  provider: Provider;
  model: string;
  messages: Message[];
}
export interface StreamOptions {
  signal: AbortSignal;
  onChunk: (chunk: string) => void;
}
