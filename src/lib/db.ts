import Database from "@tauri-apps/plugin-sql";
import type {
  Appearance,
  Chat,
  ContentBlock,
  Message,
  Provider,
  Usage,
} from "../types";

export interface PersistedState {
  providers: Provider[];
  chats: Chat[];
  messages: Message[];
  appearance: Appearance | null;
}

export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type ProviderRow = Omit<Provider, "models"> & { models_json: string };
type MessageRow = Omit<Message, "blocks" | "attachments" | "usage"> & {
  blocks_json: string;
  attachments_json: string;
  usage_json: string | null;
};
type SettingRow = { value_json: string };

let database: Promise<Database> | null = null;
let writeQueue = Promise.resolve();

function getDatabase() {
  database ??= Database.load("sqlite:luna.db");
  return database;
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function loadPersistedState(): Promise<PersistedState | null> {
  if (!isTauri) return null;

  const db = await getDatabase();
  const [providers, chats, messages, settings] = await Promise.all([
    db.select<ProviderRow[]>("SELECT id, preset_id as presetId, name, kind, base_url as baseUrl, models_json, has_key as hasKey, key_required as keyRequired, created_at as createdAt, updated_at as updatedAt FROM providers ORDER BY updated_at DESC"),
    db.select<Chat[]>("SELECT id, title, provider_id as providerId, model, created_at as createdAt, updated_at as updatedAt FROM chats ORDER BY updated_at DESC"),
    db.select<MessageRow[]>("SELECT id, chat_id as chatId, role, blocks_json, attachments_json, status, provider_id as providerId, model, created_at as createdAt, error, usage_json FROM messages ORDER BY created_at ASC"),
    db.select<SettingRow[]>("SELECT value_json FROM settings WHERE key = $1", ["appearance"]),
  ]);

  return {
    providers: providers.map((row) => ({
      id: row.id,
      presetId: row.presetId,
      name: row.name,
      kind: row.kind,
      baseUrl: row.baseUrl,
      models: parseJson<string[]>(row.models_json, []),
      hasKey: Boolean(row.hasKey),
      keyRequired: Boolean(row.keyRequired),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
    chats,
    messages: messages.map((row) => ({
      id: row.id,
      chatId: row.chatId,
      role: row.role,
      blocks: parseJson<ContentBlock[]>(row.blocks_json, []),
      attachments: parseJson(row.attachments_json, []),
      status: row.status,
      providerId: row.providerId,
      model: row.model,
      createdAt: row.createdAt,
      error: row.error,
      ...(row.usage_json
        ? { usage: parseJson<Usage>(row.usage_json, { inputTokens: 0, outputTokens: 0, totalTokens: 0 }) }
        : {}),
    })),
    appearance: settings[0]
      ? parseJson<Appearance | null>(settings[0].value_json, null)
      : null,
  };
}

export function persistState(state: PersistedState) {
  if (!isTauri) return;

  writeQueue = writeQueue
    .then(async () => {
      const db = await getDatabase();
      await db.execute("BEGIN");
      try {
        await db.execute("DELETE FROM providers");
        await db.execute("DELETE FROM chats");
        await db.execute("DELETE FROM messages");

        for (const provider of state.providers) {
          await db.execute(
            "INSERT INTO providers (id, preset_id, name, kind, base_url, models_json, has_key, key_required, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
            [provider.id, provider.presetId, provider.name, provider.kind, provider.baseUrl, JSON.stringify(provider.models), provider.hasKey ? 1 : 0, provider.keyRequired ? 1 : 0, provider.createdAt, provider.updatedAt],
          );
        }
        for (const chat of state.chats) {
          await db.execute(
            "INSERT INTO chats (id, title, provider_id, model, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6)",
            [chat.id, chat.title, chat.providerId, chat.model, chat.createdAt, chat.updatedAt],
          );
        }
        for (const message of state.messages) {
          await db.execute(
            "INSERT INTO messages (id, chat_id, role, blocks_json, attachments_json, status, provider_id, model, created_at, error, usage_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
            [message.id, message.chatId, message.role, JSON.stringify(message.blocks), JSON.stringify(message.attachments), message.status, message.providerId, message.model, message.createdAt, message.error, message.usage ? JSON.stringify(message.usage) : null],
          );
        }
        if (state.appearance) {
          await db.execute(
            "INSERT INTO settings (key, value_json) VALUES ($1,$2) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
            ["appearance", JSON.stringify(state.appearance)],
          );
        }
        await db.execute("COMMIT");
      } catch (error) {
        await db.execute("ROLLBACK");
        throw error;
      }
    })
    .catch(() => undefined);
}
