import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import * as api from "../lib/api";
import { loadPersistedState, persistState } from "../lib/db";
import { DEFAULT_SEED } from "../lib/palette";
import { demoProvider } from "../lib/providers";
import type {
  Appearance,
  Attachment,
  Chat,
  ContentBlock,
  Message,
  Provider,
} from "../types";

const now = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();

const initialProviders: Provider[] = import.meta.env.DEV
  ? [demoProvider]
  : [];

const firstChat: Chat | null = initialProviders[0]
  ? {
      id: newId(),
      title: "Новый чат",
      providerId: initialProviders[0].id,
      model: initialProviders[0].models[0],
      createdAt: now(),
      updatedAt: now(),
    }
  : null;

let running: {
  id: string;
  controller: AbortController;
} | null = null;

function textBlock(text: string): ContentBlock {
  return { type: "text", text };
}

function textFromBlocks(blocks: ContentBlock[]) {
  return blocks
    .filter((block): block is Extract<ContentBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function appendText(blocks: ContentBlock[], delta: string) {
  const next = [...blocks];
  const last = next[next.length - 1];
  if (last?.type === "text") {
    next[next.length - 1] = { ...last, text: last.text + delta };
  } else {
    next.push(textBlock(delta));
  }
  return next;
}

interface AppState {
  providers: Provider[];
  chats: Chat[];
  messages: Message[];
  activeChatId: string;
  appearance: Appearance;
  generatingChatId: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  newChat: () => void;
  selectChat: (id: string) => void;
  renameChat: (id: string, title: string) => void;
  deleteChat: (id: string) => void;
  setChatModel: (providerId: string, model: string) => void;
  upsertProvider: (provider: Provider) => void;
  setAppearance: (patch: Partial<Appearance>) => void;
  send: (text: string, attachments: Attachment[]) => Promise<void>;
  retry: (messageId: string) => Promise<void>;
  stop: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      const persistCurrent = () => {
        const state = get();
        persistState({
          providers: state.providers,
          chats: state.chats,
          messages: state.messages,
          appearance: state.appearance,
        });
      };

      return {
        providers: initialProviders,
        chats: firstChat ? [firstChat] : [],
        messages: [],
        activeChatId: firstChat?.id ?? "",
        appearance: { mode: "dark", seed: DEFAULT_SEED },
        generatingChatId: null,
        hydrated: false,

        hydrate: async () => {
          if (get().hydrated) return;
          try {
            const saved = await loadPersistedState();
            if (saved?.chats.length && saved.providers.length) {
              const activeChatId = saved.chats.some((chat) => chat.id === get().activeChatId)
                ? get().activeChatId
                : saved.chats[0].id;
              set({
                providers: saved.providers,
                chats: saved.chats,
                messages: saved.messages,
                activeChatId,
                appearance: saved.appearance ?? get().appearance,
                hydrated: true,
              });
            } else {
              set({ hydrated: true });
              persistCurrent();
            }
          } catch {
            set({ hydrated: true });
          }
        },

        newChat: () => {
          if (get().generatingChatId) get().stop();
          const current = get().chats.find((chat) => chat.id === get().activeChatId);
          const provider = get().providers.find((item) => item.id === current?.providerId) ?? get().providers[0];
          if (!provider) return;
          const chat: Chat = {
            id: newId(),
            title: "Новый чат",
            providerId: provider.id,
            model: current && provider.models.includes(current.model) ? current.model : provider.models[0] ?? "",
            createdAt: now(),
            updatedAt: now(),
          };
          set((state) => ({ chats: [chat, ...state.chats], activeChatId: chat.id }));
          persistCurrent();
        },

        selectChat: (id) => {
          if (id === get().activeChatId) return;
          if (get().generatingChatId) get().stop();
          set({ activeChatId: id });
        },

        renameChat: (id, title) => {
          const trimmed = title.trim().slice(0, 100);
          if (!trimmed) return;
          set((state) => ({
            chats: state.chats.map((chat) => chat.id === id ? { ...chat, title: trimmed, updatedAt: now() } : chat),
          }));
          persistCurrent();
        },

        deleteChat: (id) => {
          if (get().generatingChatId === id) get().stop();
          set((state) => {
            const chats = state.chats.filter((chat) => chat.id !== id);
            return {
              chats,
              messages: state.messages.filter((message) => message.chatId !== id),
              activeChatId: state.activeChatId === id ? chats[0]?.id ?? "" : state.activeChatId,
            };
          });
          if (!get().chats.length) get().newChat();
          persistCurrent();
        },

        setChatModel: (providerId, model) => {
          if (!get().providers.some((provider) => provider.id === providerId && provider.models.includes(model))) return;
          set((state) => ({
            chats: state.chats.map((chat) => chat.id === state.activeChatId ? { ...chat, providerId, model, updatedAt: now() } : chat),
          }));
          persistCurrent();
        },

        upsertProvider: (provider) => {
          set((state) => ({
            providers: state.providers.some((item) => item.id === provider.id)
              ? state.providers.map((item) => item.id === provider.id ? provider : item)
              : [...state.providers, provider],
            chats: state.chats.length === 0
              ? [{ id: newId(), title: "Новый чат", providerId: provider.id, model: provider.models[0] ?? "", createdAt: now(), updatedAt: now() }]
              : state.chats.map((chat) => chat.providerId === provider.id && provider.models.length && !provider.models.includes(chat.model)
              ? { ...chat, model: provider.models[0], updatedAt: now() }
              : chat),
          }));
          persistCurrent();
        },

        setAppearance: (patch) => {
          set((state) => ({ appearance: { ...state.appearance, ...patch } }));
          persistCurrent();
        },

        stop: () => {
          const job = running;
          if (!job) return;
          running = null;
          job.controller.abort();
          set((state) => ({
            generatingChatId: null,
            messages: state.messages.map((message) => message.id === job.id ? { ...message, status: "stopped" } : message),
          }));
          persistCurrent();
        },

        send: async (text, attachments) => {
          if (running || (!text.trim() && !attachments.length)) return;
          const state = get();
          const chat = state.chats.find((item) => item.id === state.activeChatId);
          const provider = state.providers.find((item) => item.id === chat?.providerId);
          if (!chat || !provider || !chat.model) return;

          const base = { chatId: chat.id, providerId: provider.id, model: chat.model, createdAt: now(), error: null };
          const user: Message = { ...base, id: newId(), role: "user", blocks: text.trim() ? [textBlock(text.trim())] : [], attachments: attachments.map((item) => ({ ...item })), status: "complete" };
          const assistant: Message = { ...base, id: newId(), role: "assistant", blocks: [], attachments: [], status: "streaming" };
          const controller = new AbortController();
          running = { id: assistant.id, controller };
          const isFirst = !state.messages.some((message) => message.chatId === chat.id);

          set((current) => ({
            generatingChatId: chat.id,
            messages: [...current.messages, user, assistant],
            chats: current.chats.map((item) => item.id === chat.id ? { ...item, title: isFirst && item.title === "Новый чат" ? (text.trim() || attachments[0]?.name || "Вложения").slice(0, 42) : item.title, updatedAt: now() } : item),
          }));
          persistCurrent();

          try {
            await api.sendMessage({ provider, model: chat.model, messages: [...state.messages.filter((message) => message.chatId === chat.id), user] }, {
              signal: controller.signal,
              onChunk: () => undefined,
              onEvent: (event) => {
                if (running?.id !== assistant.id) return;
                set((current) => ({
                  messages: current.messages.map((message) => {
                    if (message.id !== assistant.id) return message;
                    if (event.type === "text_delta" && event.delta) return { ...message, blocks: appendText(message.blocks, event.delta) };
                    if (event.type === "usage" && event.usage) return { ...message, usage: event.usage };
                    if (event.type === "error") return { ...message, status: "error", error: event.message ?? "Ошибка провайдера." };
                    return message;
                  }),
                }));
              },
            });
            if (running?.id === assistant.id) {
              set((current) => ({ messages: current.messages.map((message) => message.id === assistant.id ? { ...message, status: "complete" } : message) }));
            }
          } catch (error) {
            if (running?.id === assistant.id && !controller.signal.aborted) {
              set((current) => ({ messages: current.messages.map((message) => message.id === assistant.id ? { ...message, status: "error", error: error instanceof Error ? error.message : "Не удалось получить ответ." } : message) }));
            }
          } finally {
            if (running?.id === assistant.id) {
              running = null;
              set({ generatingChatId: null });
            }
            persistCurrent();
          }
        },

        retry: async (messageId) => {
          const message = get().messages.find((item) => item.id === messageId);
          if (!message || message.role !== "assistant") return;
          const chat = get().chats.find((item) => item.id === message.chatId);
          const provider = get().providers.find((item) => item.id === chat?.providerId);
          const userMessages = get().messages.filter((item) => item.chatId === message.chatId && item.role === "user");
          const lastUser = userMessages[userMessages.length - 1];
          if (!chat || !provider || !lastUser) return;
          set((state) => ({ messages: state.messages.filter((item) => item.id !== messageId && item.id !== lastUser.id) }));
          await get().send(textFromBlocks(lastUser.blocks), lastUser.attachments);
        },
      };
    },
    {
      name: "luna-appearance-v2",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ appearance: state.appearance }),
    },
  ),
);
