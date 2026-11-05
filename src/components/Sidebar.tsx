import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { flushSync } from "react-dom";
import {
  animateMotion,
  closeDialog,
  flipLayout,
  viewChange,
} from "../lib/motion";
import { Presence } from "./Motion";
import { useAppStore } from "../store/useAppStore";
import { Icon } from "./Icon";
import { Button, IconButton, TextField } from "./UI";
import { useNotify } from "./notification-context";

export function Sidebar({
  collapsed,
  onToggle,
  onSettings,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onSettings: () => void;
}) {
  const chats = useAppStore((state) => state.chats);
  const hasProviders = useAppStore((state) => state.providers.length > 0);
  const activeChatId = useAppStore((state) => state.activeChatId);
  const selectChat = useAppStore((state) => state.selectChat);
  const newChat = useAppStore((state) => state.newChat);
  const renameChat = useAppStore((state) => state.renameChat);
  const deleteChat = useAppStore((state) => state.deleteChat);

  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [removed, setRemoved] = useState<string | null>(null);
  const [title, setTitle] = useState("");

  const renameDialog = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const notify = useNotify();

  const switchChat = (id: string) =>
    viewChange("thread", () =>
      flushSync(() => selectChat(id)),
    );

  const closeRename = () =>
    void closeDialog(
      renameDialog.current,
      () => setEditing(null),
    );

  const closeDelete = () =>
    void closeDialog(
      deleteDialog.current,
      () => setDeleting(null),
    );

  useEffect(() => {
    if (editing) {
      renameDialog.current?.showModal();
      if (renameDialog.current) {
        animateMotion(renameDialog.current, "pop");
      }
    } else {
      renameDialog.current?.close();
    }
  }, [editing]);

  useEffect(() => {
    if (deleting) {
      deleteDialog.current?.showModal();
      if (deleteDialog.current) {
        animateMotion(deleteDialog.current, "pop");
      }
    } else {
      deleteDialog.current?.close();
    }
  }, [deleting]);

  function rename(event: FormEvent) {
    event.preventDefault();

    if (editing && title.trim()) {
      renameChat(editing, title);
      closeRename();
      notify("Название чата изменено");
    }
  }

  const active = chats.find(
    (chat) => chat.id === activeChatId,
  );

  return (
    <>
      <aside
        className={`sidebar ${collapsed ? "collapsed" : ""}`}
      >
        <div className="sidebar-top" data-enter data-flip>
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

        {hasProviders && <Button
          className="button tonal new-chat"
          data-enter
          data-delay="30"
          data-flip
          aria-label="Новый чат"
          onClick={() =>
            viewChange("thread", () => flushSync(newChat))
          }
        >
          <Icon name="add" size={24} />
          {!collapsed && <span>Новый чат</span>}
        </Button>}

        <nav className="chat-list" aria-label="Чаты">
          {chats.map((chat) => (
            <Presence
              className={`chat-row ${
                chat.id === activeChatId ? "active" : ""
              }`}
              key={chat.id}
              visible={removed !== chat.id}
              axis="y"
              kind="enter"
              data-flip
              onExited={() => {
                flipLayout(() =>
                  flushSync(() => deleteChat(chat.id)),
                );
                setRemoved(null);
              }}
            >
              <Button
                className="chat-select"
                onClick={() => switchChat(chat.id)}
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
            </Presence>
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
          data-flip
          onClick={onSettings}
        >
          <Icon name="settings" />
          <span>Настройки</span>
        </Button>
      </aside>

      <dialog
        className="small-dialog"
        ref={renameDialog}
        aria-labelledby="rename-title"
        onCancel={(event) => {
          event.preventDefault();
          closeRename();
        }}
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
              onClick={closeRename}
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
        onCancel={(event) => {
          event.preventDefault();
          closeDelete();
        }}
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
            onClick={closeDelete}
          >
            Отмена
          </Button>

          <Button
            className="button danger"
            onClick={() => {
              if (!deleting) return;

              const id = deleting;

              void closeDialog(deleteDialog.current, () => {
                setDeleting(null);
                setRemoved(id);
                notify("Чат удалён");
              });
            }}
          >
            Удалить
          </Button>
        </div>
      </dialog>
    </>
  );
}
