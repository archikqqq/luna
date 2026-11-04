import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { ChatView } from "./components/ChatView";
import { Settings } from "./components/Settings";
import { Notifications } from "./components/Notifications";
import { useMaterialTheme } from "./lib/theme";
import "./App.css";

export default function App() {
  useMaterialTheme();

  const [collapsed, setCollapsed] = useState(false);
  const [settings, setSettings] = useState(false);

  return (
    <Notifications>
      <div
        className={`app ${
          collapsed ? "sidebar-collapsed" : ""
        }`}
      >
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((value) => !value)}
          onSettings={() => setSettings(true)}
        />

        <ChatView />

        {settings && (
          <Settings onClose={() => setSettings(false)} />
        )}
      </div>
    </Notifications>
  );
}
