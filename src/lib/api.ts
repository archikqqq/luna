import { Channel, invoke } from "@tauri-apps/api/core";
import type {
  Provider,
  SendRequest,
  StreamEvent,
  StreamOptions,
} from "../types";

const demoMarkdown = [
  "## Привет! Это Luna",
  "",
  "Ответ создан провайдером Demo. Подключите свой провайдер в настройках, чтобы отправлять реальные запросы.",
  "",
  "### Что можно проверить",
  "- Markdown, таблицы и подсветку кода.",
  "- Остановку генерации и автоскролл.",
  "- Переключение чатов и моделей.",
].join("\n");

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function errorText(error: unknown) {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Не удалось выполнить запрос.";
}

function providerInput(provider: Provider) {
  return {
    id: provider.id,
    kind: provider.kind,
    baseUrl: provider.baseUrl,
    model: "",
  };
}

function emit(options: StreamOptions, event: StreamEvent) {
  options.onEvent?.(event);
  if (event.type === "text_delta" && event.delta) options.onChunk(event.delta);
}

function normalizeEvent(raw: StreamEvent & Record<string, unknown>): StreamEvent {
  if (raw.type === "usage") {
    return {
      type: "usage",
      usage: {
        inputTokens: Number(raw.input_tokens ?? 0),
        outputTokens: Number(raw.output_tokens ?? 0),
        totalTokens: Number(raw.total_tokens ?? 0),
      },
    };
  }
  return raw;
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Stopped", "AbortError"));
    };
    if (signal.aborted) abort();
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function sendMessage(
  request: SendRequest,
  options: StreamOptions,
): Promise<void> {
  if (import.meta.env.DEV && (request.provider.kind === "demo" || !isTauri)) {
    for (let index = 0; index < demoMarkdown.length; index += 20) {
      await delay(30, options.signal);
      emit(options, {
        type: "text_delta",
        delta: demoMarkdown.slice(index, index + 20),
      });
    }
    emit(options, { type: "done" });
    return;
  }

  const requestId = crypto.randomUUID();
  const channel = new Channel<StreamEvent>();
  channel.onmessage = (event) => emit(options, normalizeEvent(event as StreamEvent & Record<string, unknown>));

  const abort = () => {
    void invoke("cancel_request", { requestId }).catch(() => undefined);
  };
  options.signal.addEventListener("abort", abort, { once: true });

  try {
    await invoke("send_message", {
      provider: { ...providerInput(request.provider), model: request.model },
      messages: request.messages.map((message) => ({
        role: message.role,
        blocks: message.blocks,
      })),
      requestId,
      onEvent: channel,
    });
  } catch (error) {
    if (!options.signal.aborted) {
      const message = errorText(error);
      emit(options, { type: "error", message });
      throw error;
    }
  } finally {
    options.signal.removeEventListener("abort", abort);
  }
}

export async function saveProviderKey(
  providerId: string,
  key: string,
): Promise<{ hasKey: boolean }> {
  if (!key.trim()) throw new Error("Введите API-ключ.");
  if (!isTauri) return { hasKey: true };
  return { hasKey: await invoke<boolean>("save_key", { providerId, key }) };
}

export async function deleteProviderKey(providerId: string) {
  if (isTauri) await invoke("delete_key", { providerId });
}

export async function hasProviderKey(providerId: string) {
  return isTauri
    ? invoke<boolean>("has_key", { providerId })
    : false;
}

export async function listModels(provider: Provider, draftKey = "") {
  if (import.meta.env.DEV && (provider.kind === "demo" || !isTauri)) return provider.models;
  return invoke<string[]>("list_models", {
    provider: providerInput(provider),
    draftKey: draftKey.trim() || null,
  });
}

export async function checkConnection(
  provider: Provider,
  draftKey: string,
  simulateError = false,
): Promise<{ message: string }> {
  if (simulateError) throw new Error("Проверка подключения завершилась ошибкой.");
  if (import.meta.env.DEV && (provider.kind === "demo" || !isTauri)) {
    await delay(300, new AbortController().signal);
    return { message: "Провайдер Demo доступен." };
  }
  const message = await invoke<string>("test_connection", {
    provider: providerInput(provider),
    draftKey: draftKey.trim() || null,
  });
  return { message };
}
