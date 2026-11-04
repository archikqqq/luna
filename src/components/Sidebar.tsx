import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useAppStore } from "../store/useAppStore";
import { Icon } from "./Icon";
import { Button, IconButton, TextField } from "./ui";
import { useNotify } from "./Notifications";

export function Sidebar({
  collapsed,
  onToggle,
  onSettings,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onSettings: () => void;
}) {
  const {
    chats,
    activeChatId,
    selectChat,
    newChat,
    renameChat,
    deleteChat,
  } = useAppStore();

  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [title, setTitle] = useState("");

  const renameDialog = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const notify = useNotify();

  useEffect(() => {
    if (editing) renameDialog.current?.showModal();
    else renameDialog.current?.close();
  }, [editing]);

  useEffect(() => {
    if (deleting) deleteDialog.current?.showModal();
    else deleteDialog.current?.close();
  }, [deleting]);

  function rename(event: FormEvent) {
    event.preventDefault();

    if (editing && title.trim()) {
      renameChat(editing, title);
      setEditing(null);
      notify("Название чата изменено");
    }
  }

  const active = chats.find((chat) => chat.id === activeChatId);

  return (
    <>
      <aside
        className={`sidebar ${collapsed ? "collapsed" : ""}`}
      >
        <div className="sidebar-top">
          <IconButton
            name={collapsed ? "menu" : "menu_open"}
            filled={!collapsed}
            label={
              collapsed ? "Развернуть панель" : "Свернуть панель"
            }
            aria-expanded={!collapsed}
            onClick={onToggle}
          />
          {!collapsed && (
            <span className="drawer-title">Чаты</span>
          )}
        </div>

        <Button
          className="button tonal new-chat"
          aria-label="Новый чат"
          onClick={newChat}
        >
          <Icon name="add" size={24} />
          {!collapsed && <span>Новый чат</span>}
        </Button>

        <nav className="chat-list" aria-label="Чаты">
          {chats.map((chat) => (
            <div
              className={`chat-row ${
                chat.id === activeChatId ? "active" : ""
              }`}
              key={chat.id}
            >
              <Button
                className="chat-select"
                onClick={() => selectChat(chat.id)}
                aria-label={chat.title}
                aria-current={
                  chat.id === activeChatId ? "page" : undefined
                }
              >
                <Icon
                  name="chat_bubble"
                  filled={chat.id === activeChatId}
                />
                <span>{chat.title}</span>
              </Button>

              {!collapsed && (
                <div className="chat-actions">
                  <IconButton
                    name="edit"
                    label={`Переименовать ${chat.title}`}
                    onClick={() => {
                      setTitle(chat.title);
                      setEditing(chat.id);
                    }}
                  />
                  <IconButton
                    name="delete"
                    label={`Удалить ${chat.title}`}
                    onClick={() => setDeleting(chat.id)}
                  />
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="rail-actions">
          <IconButton
            name="edit"
            label="Переименовать активный чат"
            onClick={() => {
              if (active) {
                setTitle(active.title);
                setEditing(active.id);
              }
            }}
          />
          <IconButton
            name="delete"
            label="Удалить активный чат"
            onClick={() => active && setDeleting(active.id)}
          />
        </div>

        <Button
          className="button text settings-button"
          onClick={onSettings}
        >
          Настройки
        </Button>
      </aside>

      <dialog
        className="small-dialog"
        ref={renameDialog}
        aria-labelledby="rename-title"
        onCancel={() => setEditing(null)}
        onClose={() => setEditing(null)}
      >
        <form onSubmit={rename}>
          <h2 id="rename-title">Название чата</h2>

          <TextField
            label="Название"
            autoFocus
            value={title}
            maxLength={100}
            onChange={(event) => setTitle(event.target.value)}
          />

          <div className="actions">
            <Button
              className="button text"
              onClick={() => setEditing(null)}
            >
              Отмена
            </Button>
            <Button
              className="button filled"
              type="submit"
              disabled={!title.trim()}
            >
              Сохранить
            </Button>
          </div>
        </form>
      </dialog>

      <dialog
        className="small-dialog"
        ref={deleteDialog}
        aria-labelledby="delete-title"
        aria-describedby="delete-description"
        onCancel={() => setDeleting(null)}
        onClose={() => setDeleting(null)}
      >
        <h2 id="delete-title">Удалить чат?</h2>
        <p id="delete-description">
          Чат и его сообщения будут удалены из текущей сессии.
          Отменить это действие нельзя.
        </p>

        <div className="actions">
          <Button
            className="button text"
            autoFocus
            onClick={() => setDeleting(null)}
          >
            Отмена
          </Button>
          <Button
            className="button danger"
            onClick={() => {
              if (deleting) {
                deleteChat(deleting);
                setDeleting(null);
                notify("Чат удалён");
              }
            }}
          >
            Удалить
          </Button>
        </div>
      </dialog>
    </>
  );
}
