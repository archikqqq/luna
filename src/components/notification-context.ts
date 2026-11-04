import { createContext, useContext } from "react";

export const NotificationContext = createContext<(message: string) => void>(
  () => undefined,
);

export const useNotify = () => useContext(NotificationContext);
