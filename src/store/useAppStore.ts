import { DEFAULT_SEED } from "../lib/palette";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import * as api from "../lib/api";
import type {
  Appearance,
  Attachment,
  Chat,
  Message,
  Provider,
} from "../types";

const now = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();

const initialProviders: Provider[] = [
  {
    id: "demo-openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o-mini", "gpt-4o"],
    hasKey: false,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "demo-local",
    name: "Локальная модель",
    baseUrl: "http://localhost:11434/v1",
    models: ["local-model"],
    hasKey: false,
    createdAt: now(),
    updatedAt: now(),
  },
];

const firstChat: Chat = {
  id: newId(),
  title: "Новый чат",
  providerId: initialProviders[0].id,
  model: initialProviders[0].models[0],
  createdAt: now(),
  updatedAt: now(),
};

let running: {
  id: string;
  controller: AbortController;
} | null = null;

interface AppState {
  providers: Provider[];
  chats: Chat[];
  messages: Message[];
  activeChatId: string;
  appearance: Appearance;
  generatingChatId: string | null;
  newChat: () => void;
  selectChat: (id: string) => void;
  renameChat: (id: string, title: string) => void;
  deleteChat: (id: string) => void;
  setChatModel: (providerId: string, model: string) => void;
  upsertProvider: (provider: Provider) => void;
  setAppearance: (patch: Partial<Appearance>) => void;
  send: (text: string, attachments: Attachment[]) => Promise<void>;
  stop: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      providers: initialProviders,
      chats: [firstChat],
      messages: [],
      activeChatId: firstChat.id,
      appearance: { mode: "dark", seed: DEFAULT_SEED },
      generatingChatId: null,

      newChat: () => {
        const current = get().chats.find(
          (chat) => chat.id === get().activeChatId,
        );

        const provider =
          get().providers.find(
            (item) => item.id === current?.providerId,
          ) ?? get().providers[0];

        const chat: Chat = {
          id: newId(),
          title: "Новый чат",
          providerId: provider.id,
          model:
            current && provider.models.includes(current.model)
              ? current.model
              : provider.models[0],
          createdAt: now(),
          updatedAt: now(),
        };

        set((state) => ({
          chats: [chat, ...state.chats],
          activeChatId: chat.id,
        }));
      },

      selectChat: (id) => set({ activeChatId: id }),

      renameChat: (id, title) => {
        const trimmed = title.trim().slice(0, 100);

        if (trimmed) {
          set((state) => ({
            chats: state.chats.map((chat) =>
              chat.id === id
                ? { ...chat, title: trimmed, updatedAt: now() }
                : chat,
            ),
          }));
        }
      },

      deleteChat: (id) => {
        if (get().generatingChatId === id) get().stop();

        set((state) => {
          const chats = state.chats.filter(
            (chat) => chat.id !== id,
          );

          return {
            chats,
            messages: state.messages.filter(
              (message) => message.chatId !== id,
            ),
            activeChatId:
              state.activeChatId === id
                ? (chats[0]?.id ?? "")
                : state.activeChatId,
          };
        });

        if (!get().chats.length) get().newChat();
      },

      setChatModel: (providerId, model) => {
        if (
          !get().providers.some(
            (provider) =>
              provider.id === providerId &&
              provider.models.includes(model),
          )
        ) {
          return;
        }

        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.id === state.activeChatId
              ? {
                  ...chat,
                  providerId,
                  model,
                  updatedAt: now(),
                }
              : chat,
          ),
        }));
      },

      upsertProvider: (provider) =>
        set((state) => ({
          providers: state.providers.some(
            (item) => item.id === provider.id,
          )
            ? state.providers.map((item) =>
                item.id === provider.id ? provider : item,
              )
            : [...state.providers, provider],
          chats: state.chats.map((chat) =>
            chat.providerId === provider.id &&
            !provider.models.includes(chat.model)
              ? { ...chat, model: provider.models[0], updatedAt: now() }
              : chat,
          ),
        })),

      setAppearance: (patch) =>
        set((state) => ({
          appearance: { ...state.appearance, ...patch },
        })),

      stop: () => {
        const job = running;
        if (!job) return;

        running = null;
        job.controller.abort();

        set((state) => ({
          generatingChatId: null,
          messages: state.messages.map((message) =>
            message.id === job.id
              ? { ...message, status: "stopped" }
              : message,
          ),
        }));
      },

      send: async (text, attachments) => {
        if (running || (!text.trim() && !attachments.length)) return;

        const state = get();
        const chat = state.chats.find(
          (item) => item.id === state.activeChatId,
        );
        const provider = state.providers.find(
          (item) => item.id === chat?.providerId,
        );

        if (!chat || !provider) return;

        const base = {
          chatId: chat.id,
          providerId: provider.id,
          model: chat.model,
          createdAt: now(),
          error: null,
        };

        const user: Message = {
          ...base,
          id: newId(),
          role: "user",
          content: text.trim(),
          attachments: attachments.map((item) => ({ ...item })),
          status: "complete",
        };

        const assistant: Message = {
          ...base,
          id: newId(),
          role: "assistant",
          content: "",
          attachments: [],
          status: "streaming",
        };

        const controller = new AbortController();
        running = { id: assistant.id, controller };

        const isFirst = !state.messages.some(
          (message) => message.chatId === chat.id,
        );

        set((current) => ({
          generatingChatId: chat.id,
          messages: [...current.messages, user, assistant],
          chats: current.chats.map((item) =>
            item.id === chat.id
              ? {
                  ...item,
                  title:
                    isFirst && item.title === "Новый чат"
                      ? (
                          text.trim() ||
                          attachments[0]?.name ||
                          "Вложения"
                        ).slice(0, 42)
                      : item.title,
                  updatedAt: now(),
                }
              : item,
          ),
        }));

        try {
          await api.sendMessage(
            {
              provider,
              model: chat.model,
              messages: [
                ...state.messages.filter(
                  (message) => message.chatId === chat.id,
                ),
                user,
              ],
            },
            {
              signal: controller.signal,
              onChunk: (chunk) => {
                if (running?.id !== assistant.id) return;

                set((current) => ({
                  messages: current.messages.map((message) =>
                    message.id === assistant.id
                      ? {
                          ...message,
                          content: message.content + chunk,
                        }
                      : message,
                  ),
                }));
              },
            },
          );

          if (running?.id === assistant.id) {
            set((current) => ({
              messages: current.messages.map((message) =>
                message.id === assistant.id
                  ? { ...message, status: "complete" }
                  : message,
              ),
            }));
          }
        } catch (error: unknown) {
          if (
            running?.id === assistant.id &&
            !controller.signal.aborted
          ) {
            const message =
              error instanceof Error
                ? error.message
                : "Не удалось получить ответ.";

            set((current) => ({
              messages: current.messages.map((item) =>
                item.id === assistant.id
                  ? { ...item, status: "error", error: message }
                  : item,
              ),
            }));
          }
        } finally {
          if (running?.id === assistant.id) {
            running = null;
            set({ generatingChatId: null });
          }
        }
      },
    }),
    {
      name: "luna-appearance-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        appearance: state.appearance,
      }),

      merge: (persisted: unknown, current) => {
        if (
          !persisted ||
          typeof persisted !== "object" ||
          !("appearance" in persisted)
        ) {
          return current;
        }

        const appearance = persisted.appearance;

        if (
          !appearance ||
          typeof appearance !== "object" ||
          !("mode" in appearance) ||
          !("seed" in appearance)
        ) {
          return current;
        }

        const mode =
          appearance.mode === "light" ||
          appearance.mode === "dark" ||
          appearance.mode === "system"
            ? appearance.mode
            : "system";

        const seed =
          typeof appearance.seed === "string" &&
          /^#[0-9a-f]{6}$/i.test(appearance.seed)
            ? appearance.seed
            : DEFAULT_SEED;

        return {
          ...current,
          appearance: {
            mode,
            seed: ["#6750a4", "#d0f89d"].includes(
              seed.toLowerCase(),
            )
              ? DEFAULT_SEED
              : seed,
          },
        };
      },
    },
  ),
);
