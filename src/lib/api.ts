import type { Provider, SendRequest, StreamOptions } from "../types";

// Stage 1: no network, Tauri imports, storage, or actual key retention.
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Stopped", "AbortError"));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new DOMException("Stopped", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export const demoMarkdown = [
  "## Привет! Это Luna",
  "",
  "Сейчас работает **локальная имитация ответа**. Запросы к нейросетям не отправляются.",
  "",
  "### Что уже можно проверить",
  "- Переключение чатов и моделей.",
  "- Markdown, таблицы и подсветку кода.",
  "- Остановку генерации и поведение прокрутки.",
  "",
  "```typescript",
  "interface Greeting {",
  "  name: string;",
  "}",
  "",
  "function greet({ name }: Greeting): string {",
  "  return `Привет, ${name}!`;",
  "}",
  "",
  "console.log(greet({ name: 'Luna' }));",
  "```",
  "",
  "| Возможность | Статус |",
  "| :--- | :--- |",
  "| Интерфейс | Готов к проверке |",
  "| Подключение API | Следующий этап |",
  "| Хранение ключей | Следующий этап |",
  "",
  "> Вложения сейчас представлены только именами и метаданными. Содержимое файлов не читается.",
  "",
  "Можно продолжить разговор или выбрать другой цвет в настройках.",
].join("\n");

export async function sendMessage(
  request: SendRequest,
  options: StreamOptions,
): Promise<void> {
  if (!request.provider.models.includes(request.model)) {
    throw new Error("Модель не найдена в настройках провайдера.");
  }
  await delay(350, options.signal);
  for (let i = 0; i < demoMarkdown.length; i += 20) {
    await delay(30, options.signal);
    options.onChunk(demoMarkdown.slice(i, i + 20));
  }
}

export async function saveProviderKey(
  providerId: string,
  key: string,
): Promise<{ hasKey: boolean }> {
  if (!providerId || !key.trim()) throw new Error("Введите API-ключ.");
  await delay(200);
  // Deliberately do not save, log, or return the key.
  return { hasKey: true };
}

export async function checkConnection(
  provider: Provider,
  draftKey: string,
  simulateError: boolean,
): Promise<{ message: string }> {
  await delay(650);
  const url = new URL(provider.baseUrl);
  if (!["https:", "http:"].includes(url.protocol)) {
    throw new Error("Base URL должен использовать HTTP или HTTPS.");
  }
  if (simulateError) throw new Error("Демо-ошибка: провайдер недоступен.");
  if (!provider.models.length) throw new Error("Укажите хотя бы одну модель.");
  if (!provider.hasKey && !draftKey.trim()) {
    throw new Error("Демо-проверка: сначала введите ключ.");
  }
  return { message: "Демо-успех. Реального подключения не было." };
}
