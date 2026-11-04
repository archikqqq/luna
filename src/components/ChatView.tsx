import { useLayoutEffect, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { Composer } from "./Composer";
import { Markdown } from "./Markdown";
import { Icon } from "./Icon";
import { Welcome } from "./Welcome";
import { IconButton, MenuField } from "./ui";

export function ChatView() {
  const {
    chats,
    messages,
    providers,
    activeChatId,
    setChatModel,
    generatingChatId,
  } = useAppStore();

  const chat = chats.find((item) => item.id === activeChatId);
  const provider = providers.find(
    (item) => item.id === chat?.providerId,
  );
  const list = messages.filter(
    (message) => message.chatId === activeChatId,
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

  function chooseSuggestion(text: string) {
    setSuggestion((current) => ({
      chatId: activeChatId,
      text,
      revision: (current?.revision ?? 0) + 1,
    }));
  }

  useLayoutEffect(() => {
    const element = scroll.current;
    if (!element) return;

    const changed = previousChat.current !== activeChatId;

    if (changed) {
      previousChat.current = activeChatId;
      follow.current = true;
      setShowDown(false);
    }

    if (changed || follow.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [activeChatId, messages]);

  if (!chat || !provider) {
    return (
      <main className="chat-main">
        Нет доступного провайдера.
      </main>
    );
  }

  return (
    <main className="chat-main">
      <header className="chat-header">
        <strong className="topbar-brand">Luna</strong>

        <div className="model-pickers">
          <MenuField
            label="Провайдер"
            value={provider.id}
            disabled={generatingChatId === activeChatId}
            options={providers.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
            onChange={(id) => {
              const selected = providers.find(
                (item) => item.id === id,
              );
              if (selected) {
                setChatModel(selected.id, selected.models[0]);
              }
            }}
          />

          <MenuField
            label="Модель"
            value={chat.model}
            disabled={generatingChatId === activeChatId}
            options={provider.models.map((model) => ({
              value: model,
              label: model,
            }))}
            onChange={(model) =>
              setChatModel(provider.id, model)
            }
          />
        </div>

        <span className="demo-label">Локальный прототип</span>
      </header>

      <div className="conversation-area">
        <div
          className="message-scroll"
          ref={scroll}
          onScroll={() => {
            const element = scroll.current;
            if (!element) return;

            follow.current =
              element.scrollHeight -
                element.scrollTop -
                element.clientHeight <
              80;

            setShowDown(!follow.current);
          }}
        >
          {list.length === 0 ? (
            <Welcome onSuggestion={chooseSuggestion} />
          ) : (
            <div className="messages">
              {list.map((message) => (
                <article
                  key={message.id}
                  className={`message ${message.role}`}
                  aria-label={
                    message.role === "user"
                      ? "Твоё сообщение"
                      : "Ответ модели"
                  }
                >
                  {message.role === "assistant" && (
                    <div className="assistant-label">
                      <Icon name="auto_awesome" />
                      Luna <span>{message.model}</span>
                    </div>
                  )}

                  {message.role === "user" ? (
                    <div className="user-bubble">
                      {message.content && (
                        <div className="user-text">
                          {message.content}
                        </div>
                      )}

                      {message.attachments.length > 0 && (
                        <div className="chips">
                          {message.attachments.map(
                            (attachment) => (
                              <span
                                className="chip"
                                key={attachment.id}
                              >
                                {attachment.name}
                              </span>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <Markdown content={message.content} />

                      {message.status === "streaming" && (
                        <span
                          className="generation-status"
                          role="status"
                        >
                          Генерация…
                        </span>
                      )}

                      {message.status === "stopped" && (
                        <small className="muted">
                          Ответ остановлен
                        </small>
                      )}

                      {message.status === "error" && (
                        <p className="error" role="alert">
                          {message.error}
                        </p>
                      )}
                    </>
                  )}
                </article>
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

              if (scroll.current) {
                scroll.current.scrollTop =
                  scroll.current.scrollHeight;
              }

              setShowDown(false);
            }}
          />
        )}
      </div>

      <Composer
        key={activeChatId}
        suggestion={
          suggestion?.chatId === activeChatId
            ? suggestion
            : null
        }
      />
    </main>
  );
}
