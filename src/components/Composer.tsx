import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { newId, useAppStore } from "../store/useAppStore";
import type { Attachment } from "../types";
import { IconButton } from "./ui";

export function Composer({
  suggestion,
}: {
  suggestion: {
    text: string;
    revision: number;
  } | null;
}) {
  const { send, stop, generatingChatId, activeChatId } =
    useAppStore();

  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>(
    [],
  );

  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (suggestion) {
      setText(suggestion.text);
      textarea.current?.focus();
    }
  }, [suggestion]);

  const busy = generatingChatId !== null;
  const here = generatingChatId === activeChatId;

  useLayoutEffect(() => {
    const element = textarea.current;

    if (element) {
      element.style.height = "auto";
      element.style.height =
        Math.min(element.scrollHeight, 180) + "px";
    }
  }, [text]);

  function submit() {
    if (busy || (!text.trim() && !attachments.length)) return;

    void send(text, attachments);
    setText("");
    setAttachments([]);
    textarea.current?.focus();
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing &&
      event.nativeEvent.keyCode !== 229
    ) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="composer-wrap">
      <div className={`composer ${text.trim() ? "has-text" : ""}`}>
        {attachments.length > 0 && (
          <div className="chips">
            {attachments.map((attachment) => (
              <span className="chip" key={attachment.id}>
                <span title={attachment.name}>
                  {attachment.name}
                </span>
                <IconButton
                  name="close"
                  label={`Убрать ${attachment.name}`}
                  onClick={() =>
                    setAttachments((current) =>
                      current.filter(
                        (item) => item.id !== attachment.id,
                      ),
                    )
                  }
                />
              </span>
            ))}
          </div>
        )}

        <textarea
          ref={textarea}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={keyDown}
          rows={1}
          placeholder="Напиши что-нибудь…"
          aria-label="Сообщение"
        />

        <div className="composer-bottom">
          <input
            ref={fileInput}
            type="file"
            hidden
            multiple
            onChange={(event) => {
              const selected = Array.from(
                event.target.files ?? [],
              ).map((file) => ({
                id: newId(),
                name: file.name,
                size: file.size,
                mimeType: file.type,
                storageRef: null,
              }));

              setAttachments((current) => [
                ...current,
                ...selected,
              ]);

              event.target.value = "";
            }}
          />

          <IconButton
            name="attach_file"
            label="Прикрепить файлы"
            onClick={() => fileInput.current?.click()}
          />

          <span className="composer-hint">
            {busy && !here
              ? "Ответ генерируется в другом чате"
              : "Enter отправляет · Shift+Enter переносит строку"}
          </span>

          <IconButton
            className={`filled send-button ${
              busy ? "is-generating" : ""
            }`}
            name={busy ? "stop" : "arrow_upward"}
            filled={busy}
            label={
              busy ? "Остановить генерацию" : "Отправить"
            }
            onClick={busy ? stop : submit}
            disabled={
              !busy && !text.trim() && !attachments.length
            }
          />
        </div>
      </div>

      <p className="footnote">
        Демо-режим · нет запросов к API · содержимое вложений
        не читается
      </p>
    </div>
  );
}
