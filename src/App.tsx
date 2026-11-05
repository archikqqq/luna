import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { flipLayout } from "./lib/motion";
import { MotionRoot } from "./components/Motion";
import { Sidebar } from "./components/Sidebar";
import { ChatView } from "./components/ChatView";
import { Settings } from "./components/Settings";
import { Notifications } from "./components/Notifications";
import { useMaterialTheme } from "./lib/theme";
import { useAppStore } from "./store/useAppStore";
import "./App.css";
import "./motion.css";

export default function App() {
  useMaterialTheme();
  const hydrate = useAppStore((state) => state.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const [collapsed, setCollapsed] =
    useState(false);

  const [settings, setSettings] =
    useState(false);

  return (
    <Notifications>
      <MotionRoot />

      <div
        className={`app ${
          collapsed
            ? "sidebar-collapsed"
            : ""
        }`}
      >
        <Sidebar
          collapsed={collapsed}
          onToggle={() =>
            flipLayout(() =>
              flushSync(() =>
                setCollapsed(
                  (value) => !value,
                ),
              ),
            )
          }
          onSettings={() =>
            setSettings(true)
          }
        />

        <ChatView onOpenSettings={() => setSettings(true)} />

        {settings && (
          <Settings
            onClose={() =>
              setSettings(false)
            }
          />
        )}
      </div>
    </Notifications>
  );
}
