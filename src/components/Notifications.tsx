import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Presence } from "./Motion";
import { IconButton } from "./UI";
import { NotificationContext } from "./notification-context";

export function Notifications({
  children,
}: {
  children: ReactNode;
}) {
  const [notice, setNotice] = useState<{
    id: number;
    text: string;
  } | null>(null);

  const serial = useRef(0);
  const [target, setTarget] =
    useState<HTMLElement>(document.body);

  useEffect(() => {
    const update = () => {
      const dialogs =
        document.querySelectorAll<HTMLDialogElement>(
          "dialog[open]",
        );

      setTarget(
        dialogs[dialogs.length - 1] ??
          document.body,
      );
    };

    const observer = new MutationObserver(update);

    update();

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open"],
    });

    return () => observer.disconnect();
  }, []);

  const notify = useCallback(
    (text: string) =>
      setNotice({
        id: ++serial.current,
        text,
      }),
    [],
  );

  useEffect(() => {
    if (!notice) return;

    const timer = setTimeout(
      () => setNotice(null),
      5000,
    );

    return () => clearTimeout(timer);
  }, [notice]);

  return (
    <NotificationContext.Provider value={notify}>
      {children}

      {createPortal(
        <div
          className="snackbar-host"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <Presence
            visible={!!notice}
            className="snackbar"
          >
            <span>{notice?.text}</span>
            <IconButton
              name="close"
              label="Закрыть уведомление"
              onClick={() =>
                setNotice(null)
              }
            />
          </Presence>
        </div>,
        target,
      )}
    </NotificationContext.Provider>
  );
}
