import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  animateMotion,
  closeDialog,
} from "../lib/motion";
import { Presence } from "./Motion";
import {
  checkConnection,
  listModels,
  saveProviderKey,
} from "../lib/api";
import { providerPresets } from "../lib/providers";
import { seedPresets } from "../lib/theme";
import {
  newId,
  useAppStore,
} from "../store/useAppStore";
import type { Provider } from "../types";
import { Icon } from "./Icon";
import {
  Button,
  IconButton,
  TextField,
} from "./UI";
import { useNotify } from "./notification-context";

function ProviderForm({
  provider,
  onSaved,
}: {
  provider: Provider | null;
  onSaved: (id: string) => void;
}) {
  const upsert = useAppStore(
    (state) => state.upsertProvider,
  );
  const notify = useNotify();

  const [name, setName] = useState(
    provider?.name ?? "",
  );
  const [presetId, setPresetId] = useState(provider?.presetId ?? "custom");
  const [kind, setKind] = useState(provider?.kind ?? "openai-compatible");
  const [url, setUrl] = useState(
    provider?.baseUrl ??
      "https://api.example.com/v1",
  );
  const [models, setModels] = useState(
    provider?.models.join(", ") ?? "",
  );
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const id = useRef(provider?.id ?? newId());

  function selectPreset(value: string) {
    setPresetId(value);
    if (value === "custom") {
      setKind("openai-compatible");
      return;
    }
    const preset = providerPresets.find((item) => item.id === value);
    if (!preset) return;
    setName(preset.name);
    setKind(preset.kind);
    setUrl(preset.baseUrl);
    setModels(preset.examples.join(", "));
  }

  const selectedPreset = providerPresets.find((item) => item.id === presetId);

  function draft(): Provider {
    const parsed = new URL(url);

    if (
      !["https:", "http:"].includes(parsed.protocol)
    ) {
      throw new Error(
        "Нужен HTTP или HTTPS URL.",
      );
    }

    const list = [
      ...new Set(
        models
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ];

    if (!name.trim() || !list.length) {
      throw new Error(
        "Укажите название и хотя бы одну модель.",
      );
    }

    return {
      id: id.current,
      presetId,
      name: name.trim(),
      kind,
      baseUrl: url.trim(),
      models: list,
      hasKey: provider?.hasKey ?? false,
      keyRequired: provider?.keyRequired ?? providerPresets.find((item) => item.id === presetId)?.keyRequired ?? true,
      createdAt:
        provider?.createdAt ??
        new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const value = draft();

      if (key.trim()) {
        value.hasKey = (
          await saveProviderKey(value.id, key)
        ).hasKey;
      }

      upsert(value);
      setKey("");

      notify("Провайдер сохранён.");

      onSaved(value.id);
    } catch (caught: unknown) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Ошибка сохранения",
      );
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setError("");

    try {
      notify(
        (
          await checkConnection(
            draft(),
            key,
            false,
          )
        ).message,
      );
    } catch (caught: unknown) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Ошибка проверки",
      );
    } finally {
      setBusy(false);
    }
  }

  async function refreshModels() {
    setBusy(true);
    setError("");
    try {
      const modelsFromProvider = await listModels(draft(), key);
      if (!modelsFromProvider.length) {
        throw new Error("Провайдер не вернул список моделей. Введите модели вручную.");
      }
      setModels(modelsFromProvider.join(", "));
      notify(`Получено моделей: ${modelsFromProvider.length}`);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Не удалось получить модели.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="provider-form"
      onSubmit={(event) => void save(event)}
    >
      <h3>
        {provider
          ? "Редактирование провайдера"
          : "Новый провайдер"}
      </h3>

        <p className="muted">Ключ хранится в Windows Credential Manager и не возвращается в интерфейс.</p>

      <fieldset disabled={busy}>
        <label className="select-field">
          <span>Пресет провайдера</span>
          <select value={presetId} onChange={(event) => selectPreset(event.target.value)}>
            <option value="custom">Свой провайдер</option>
            {providerPresets.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}{item.notes ? " — скоро" : ""}
              </option>
            ))}
          </select>
        </label>

        {kind !== "openai-compatible" && kind !== "anthropic" && kind !== "demo" && (
          <p className="field-hint">Этот тип провайдера отмечен как «скоро» и пока не подключается.</p>
        )}

        {selectedPreset?.keyUrl && (
          <p className="field-hint">
            <a href={selectedPreset.keyUrl} target="_blank" rel="noopener noreferrer">
              Где получить ключ: {selectedPreset.name}
            </a>
          </p>
        )}

        <TextField
          label="Название"
          value={name}
          onChange={(event) =>
            setName(event.target.value)
          }
          required
          maxLength={80}
        />

        <TextField
          label="Base URL"
          type="url"
          value={url}
          onChange={(event) =>
            setUrl(event.target.value)
          }
          spellCheck={false}
          required
        />

        <TextField
          label="API-ключ"
          type="password"
          value={key}
          onChange={(event) =>
            setKey(event.target.value)
          }
          autoComplete="off"
          spellCheck={false}
        />

        {provider?.hasKey && <p className="field-hint">Ключ сохранён. Пустое поле его не меняет.</p>}

        <TextField
          label="Модели через запятую"
          value={models}
          onChange={(event) =>
            setModels(event.target.value)
          }
          required
        />

        <div className="actions">
          <Button
            className="button outlined"
            onClick={() => void test()}
            disabled={kind !== "openai-compatible" && kind !== "anthropic"}
          >
            Проверить подключение
          </Button>

          <Button
            className="button outlined"
            type="button"
            disabled={kind !== "openai-compatible" && kind !== "anthropic"}
            onClick={() => void refreshModels()}
          >
            Обновить модели
          </Button>

          <Button
            className="button filled"
            type="submit"
          >
            Сохранить
          </Button>
        </div>
      </fieldset>

      {busy && <p role="status">Проверяем подключение…</p>}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function AppearanceSettings() {
  const appearance = useAppStore((state) => state.appearance);
  const setAppearance = useAppStore((state) => state.setAppearance);

  const [hex, setHex] = useState(
    appearance.seed,
  );

  const valid = /^#[0-9a-f]{6}$/i.test(hex);

  return (
    <section className="appearance">
      <h3>Внешний вид</h3>

      <p className="muted">
        Нейтральная палитра по умолчанию.
        Любой свой seed применяется сразу.
      </p>

      <fieldset>
        <legend>Тема</legend>

        <div
          className="segments"
          role="group"
          aria-label="Тема"
        >
          {(
            [
              ["light", "Светлая", "light_mode"],
              ["dark", "Тёмная", "dark_mode"],
              ["system", "Системная", "computer"],
            ] as const
          ).map(([mode, label, icon]) => (
            <Button
              className={
                appearance.mode === mode
                  ? "selected"
                  : ""
              }
              aria-pressed={
                appearance.mode === mode
              }
              key={mode}
              onClick={() =>
                setAppearance({ mode })
              }
            >
              <Icon
                name={icon}
                filled={
                  appearance.mode === mode
                }
              />
              {label}
            </Button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Seed-цвет</legend>

        <div className="swatches">
          {seedPresets.map((preset) => (
            <Button
              className="swatch"
              key={preset.value}
              style={
                {
                  "--swatch-color":
                    preset.value,
                } as CSSProperties
              }
              aria-label={preset.name}
              aria-pressed={
                appearance.seed.toLowerCase() ===
                preset.value.toLowerCase()
              }
              onClick={() =>
                {
                  setHex(preset.value);
                  setAppearance({ seed: preset.value });
                }
              }
            >
              {appearance.seed.toLowerCase() ===
                preset.value.toLowerCase() && (
                <Icon name="check" filled />
              )}
            </Button>
          ))}
        </div>

        <div className="custom-color">
          <label className="color-picker">
            Свой цвет
            <input
              type="color"
              value={appearance.seed}
              onChange={(event) =>
                {
                  setHex(event.target.value);
                  setAppearance({ seed: event.target.value });
                }
              }
            />
          </label>

          <TextField
            label="HEX"
            value={hex}
            aria-invalid={!valid}
            aria-describedby={
              !valid
                ? "hex-error"
                : undefined
            }
            maxLength={7}
            spellCheck={false}
            onChange={(event) => {
              const value = event.target.value;
              setHex(value);

              if (
                /^#[0-9a-f]{6}$/i.test(value)
              ) {
                setAppearance({ seed: value });
              }
            }}
          />
        </div>

        {!valid && (
          <p
            className="error"
            id="hex-error"
          >
            Нужен HEX из шести цифр.
          </p>
        )}
      </fieldset>
    </section>
  );
}

export function Settings({
  onClose,
}: {
  onClose: () => void;
}) {
  const providers = useAppStore(
    (state) => state.providers,
  );

  const [tab, setTab] = useState<
    "providers" | "appearance" | "about"
  >("providers");

  const [panel, setPanel] = useState(tab);
  const [panelVisible, setPanelVisible] =
    useState(true);

  const chooseTab = (next: typeof tab) => {
    if (next === tab) return;
    setTab(next);
    if (next !== panel) setPanelVisible(false);
  };

  const [selected, setSelected] = useState<
    string | null
  >(providers[0]?.id ?? null);

  const dialog =
    useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;

    element?.showModal();
    if (element) {
      animateMotion(element, "pop");
    }

    return () => element?.close();
  }, []);

  const close = () =>
    void closeDialog(dialog.current, onClose);

  const provider =
    providers.find(
      (item) => item.id === selected,
    ) ?? null;

  return (
    <dialog
      className="settings-dialog"
      ref={dialog}
      aria-labelledby="settings-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header className="settings-header">
        <h2 id="settings-title">
          Настройки
        </h2>
        <IconButton
          name="close"
          label="Закрыть настройки"
          onClick={close}
        />
      </header>

      <div
        className="settings-tabs"
        role="tablist"
        aria-label="Разделы настроек"
      >
        {(
          [
            ["providers", "Провайдеры"],
            ["appearance", "Внешний вид"],
            ["about", "О приложении"],
          ] as const
        ).map(([id, label], index, all) => (
          <Button
            key={id}
            role="tab"
            id={`tab-${id}`}
            aria-controls={`panel-${id}`}
            aria-selected={tab === id}
            tabIndex={tab === id ? 0 : -1}
            className={
              tab === id ? "selected" : ""
            }
            onClick={() => chooseTab(id)}
            onKeyDown={(event) => {
              if (
                [
                  "ArrowLeft",
                  "ArrowRight",
                  "Home",
                  "End",
                ].includes(event.key)
              ) {
                event.preventDefault();

                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? all.length - 1
                      : (index +
                          (event.key ===
                          "ArrowRight"
                            ? 1
                            : -1) +
                          all.length) %
                        all.length;

                chooseTab(all[next][0]);

                document
                  .getElementById(
                    `tab-${all[next][0]}`,
                  )
                  ?.focus();
              }
            }}
          >
            {label}
          </Button>
        ))}
      </div>

      <Presence
        visible={panelVisible}
        axis="x"
        kind="enter"
        onExited={() => {
          setPanel(tab);
          setPanelVisible(true);
        }}
        className="settings-content"
        role="tabpanel"
        id={`panel-${panel}`}
        aria-labelledby={`tab-${panel}`}
      >
        {panel === "providers" && (
          <div className="providers-layout">
            <aside>
              <Button
                className="button tonal"
                onClick={() =>
                  setSelected(null)
                }
              >
                <Icon name="add" />
                Добавить
              </Button>

              <div className="provider-list">
                {providers.map((item) => (
                  <Button
                    key={item.id}
                    className={
                      selected === item.id
                        ? "selected"
                        : ""
                    }
                    aria-pressed={
                      selected === item.id
                    }
                    onClick={() =>
                      setSelected(item.id)
                    }
                  >
                    <span>
                      <strong>
                        {item.name}
                      </strong>
                      <small>
                        {item.hasKey
                          ? "Ключ сохранён"
                          : "Ключ не указан"}
                      </small>
                    </span>
                    <Icon
                      name="dns"
                      filled={
                        selected === item.id
                      }
                    />
                  </Button>
                ))}
              </div>
            </aside>

            <ProviderForm
              key={selected ?? "new"}
              provider={provider}
              onSaved={setSelected}
            />
          </div>
        )}

        {panel === "appearance" && (
          <AppearanceSettings />
        )}

        {panel === "about" && (
          <section className="about">
            <h3>Luna</h3>
            <p>
              Клиент для нейросетей с
              API-ключами пользователя.
            </p>
            <p className="muted">
              Чаты, сообщения и настройки провайдеров сохраняются в локальной базе SQLite.
              Ключи хранятся отдельно в Windows Credential Manager.
            </p>
          </section>
        )}
      </Presence>
    </dialog>
  );
}
