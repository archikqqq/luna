import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { reducedMotion } from "../lib/motion";
import { useAppStore } from "../store/useAppStore";
import type { Message } from "../types";
import { Composer } from "./Composer";
import { Icon } from "./Icon";
import { Markdown } from "./Markdown";
import { Button, IconButton, MenuField } from "./UI";
import { Welcome } from "./Welcome";

const MessageView = memo(function MessageView({
  message,
}: {
  message: Message;
}) {
  const assistant = message.role === "assistant";
  const text = message.blocks
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
  const retry = useAppStore((state) => state.retry);

  return (
    <article
      className={`message ${message.role}`}
      aria-label={assistant ? "Ответ модели" : "Твоё сообщение"}
      aria-busy={assistant && message.status === "streaming"}
    >
      {assistant && (
        <div className="assistant-label">
          <Icon name="auto_awesome" />
          Luna <span>{message.model}</span>
        </div>
      )}

      {!assistant ? (
        <div className="user-bubble" data-motion-key={message.id}>
          {text && (
            <div className="user-text">{text}</div>
          )}

          {message.attachments.length > 0 && (
            <div className="chips" aria-label="Вложения">
              {message.attachments.map((attachment) => (
                <span className="chip" key={attachment.id}>
                  {attachment.name}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <Markdown
            content={text}
            streaming={message.status === "streaming"}
          />

          {message.status === "streaming" && (
            <span className="generation-status" role="status">
              <span className="thinking" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="sr-only">Модель генерирует ответ</span>
            </span>
          )}

          {message.status === "stopped" && (
            <small className="muted">Ответ остановлен</small>
          )}

          {message.status === "error" && (
            <div className="error-message">
              <p className="error" role="alert">{message.error}</p>
              <Button className="button outlined" onClick={() => void retry(message.id)}>
                Повторить
              </Button>
            </div>
          )}
        </>
      )}
    </article>
  );
});

export function ChatView({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const chats = useAppStore((state) => state.chats);
  const messages = useAppStore((state) => state.messages);
  const providers = useAppStore((state) => state.providers);
  const activeChatId = useAppStore((state) => state.activeChatId);
  const setChatModel = useAppStore((state) => state.setChatModel);
  const generatingChatId = useAppStore(
    (state) => state.generatingChatId,
  );

  const chat = useMemo(
    () => chats.find((item) => item.id === activeChatId),
    [activeChatId, chats],
  );
  const provider = useMemo(
    () => providers.find((item) => item.id === chat?.providerId),
    [chat?.providerId, providers],
  );
  const list = useMemo(
    () => messages.filter((message) => message.chatId === activeChatId),
    [activeChatId, messages],
  );
  const providerOptions = useMemo(
    () =>
      providers.map((item) => ({
        value: item.id,
        label: item.name,
      })),
    [providers],
  );
  const modelOptions = useMemo(
    () =>
      provider?.models.map((model) => ({ value: model, label: model })) ??
      [],
    [provider?.models],
  );

  const scroll = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const previousChat = useRef(activeChatId);
  const [showDown, setShowDown] = useState(false);
  const [suggestion, setSuggestion] = useState<{
    chatId: string;
    text: string;
    revision: number;
  } | null>(null);

  const scrollToEnd = useCallback((smooth = false) => {
    const element = scroll.current;
    if (!element) return;

    element.scrollTo({
      top: element.scrollHeight,
      behavior: smooth && !reducedMotion() ? "smooth" : "auto",
    });
  }, []);

  const lastMessage = list[list.length - 1];
  const scrollRevision = `${lastMessage?.id ?? ""}:${
    lastMessage?.blocks.length ?? 0
  }:${lastMessage?.blocks.map((block) => block.type === "text" ? block.text.length : 0).join(",")}:${lastMessage?.status ?? ""}`;

  useLayoutEffect(() => {
    const changed = previousChat.current !== activeChatId;

    if (changed) {
      previousChat.current = activeChatId;
      follow.current = true;
      setShowDown(false);
    }

    if (changed || follow.current) scrollToEnd();
  }, [activeChatId, scrollRevision, scrollToEnd]);

  useEffect(() => {
    const element = scroll.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      if (follow.current) scrollToEnd();
    });
    const content = element.firstElementChild;
    observer.observe(content ?? element);

    return () => observer.disconnect();
  }, [activeChatId, list.length, scrollToEnd]);

  const chooseSuggestion = useCallback(
    (text: string) => {
      setSuggestion((current) => ({
        chatId: activeChatId,
        text,
        revision: (current?.revision ?? 0) + 1,
      }));
    },
    [activeChatId],
  );

  if (!chat || !provider) {
    return (
      <main className="chat-main" aria-label="Настройка Luna">
        <Welcome onSuggestion={() => onOpenSettings?.()} onAddProvider={onOpenSettings} />
      </main>
    );
  }

  const generatingHere = generatingChatId === activeChatId;

  return (
    <main className="chat-main" aria-label="Чат Luna">
      <header className="chat-header" data-enter data-delay="60" data-flip>
        <strong className="topbar-brand">Luna</strong>

        <div className="model-pickers">
          <MenuField
            label="Провайдер"
            value={provider.id}
            disabled={generatingHere}
            options={providerOptions}
            onChange={(id) => {
              const selected = providers.find((item) => item.id === id);
              if (selected) setChatModel(selected.id, selected.models[0]);
            }}
          />

          <MenuField
            label="Модель"
            value={chat.model}
            disabled={generatingHere}
            options={modelOptions}
            onChange={(model) => setChatModel(provider.id, model)}
          />
        </div>

        {provider.kind === "demo" && <span className="demo-label">Demo</span>}
      </header>

      <div className="conversation-area">
        <div
          className="message-scroll"
          ref={scroll}
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          aria-busy={generatingHere}
          tabIndex={0}
          onScroll={(event) => {
            const element = event.currentTarget;
            const shouldFollow =
              element.scrollHeight - element.scrollTop - element.clientHeight <
              80;

            follow.current = shouldFollow;
            setShowDown((current) =>
              current === !shouldFollow ? current : !shouldFollow,
            );
          }}
        >
          {list.length === 0 ? (
            <Welcome onSuggestion={chooseSuggestion} />
          ) : (
            <div className="messages">
              {list.map((message) => (
                <MessageView key={message.id} message={message} />
              ))}
            </div>
          )}
        </div>

        {showDown && (
          <IconButton
            className="down-button"
            name="arrow_downward"
            label="К последнему сообщению"
            onClick={() => {
              follow.current = true;
              scrollToEnd(true);
              setShowDown(false);
            }}
          />
        )}
      </div>

      <Composer
        key={`${activeChatId}:${suggestion?.revision ?? 0}`}
        suggestion={
          suggestion?.chatId === activeChatId ? suggestion : null
        }
      />
    </main>
  );
}
