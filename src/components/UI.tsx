import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type PointerEvent,
  type KeyboardEvent,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { Presence, AnimatedIcon } from "./Motion";

export function Button({
  children,
  className = "",
  onPointerDown,
  onKeyDown,
  type = "button",
  buttonRef,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  const slot = useRef<HTMLSpanElement>(null);
  const animations = useRef(new Set<Animation>());

  useEffect(() => {
    const currentAnimations = animations.current;
    const media = matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    const cancel = () => {
      if (media.matches) {
        currentAnimations.forEach((animation) =>
          animation.cancel(),
        );
      }
    };

    media.addEventListener("change", cancel);

    return () => {
      media.removeEventListener("change", cancel);
      currentAnimations.forEach((animation) =>
        animation.cancel(),
      );
    };
  }, []);

  function ripple(
    x: number,
    y: number,
    button: HTMLButtonElement,
  ) {
    if (
      button.disabled ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const host = slot.current;
    if (!host) return;

    const dot = document.createElement("span");
    dot.className = "ripple";

    const diameter =
      Math.hypot(button.clientWidth, button.clientHeight) * 2;

    Object.assign(dot.style, {
      width: diameter + "px",
      height: diameter + "px",
      left: x + "px",
      top: y + "px",
    });

    host.append(dot);

    const computed = getComputedStyle(button);
    const duration =
      Number.parseFloat(
        computed.getPropertyValue("--duration-ripple"),
      ) || 450;
    const opacity =
      Number.parseFloat(
        computed.getPropertyValue("--state-pressed"),
      ) || 0.1;

    const animation = dot.animate(
      [
        {
          transform: "translate(-50%, -50%) scale(0)",
          opacity,
        },
        {
          transform: "translate(-50%, -50%) scale(1)",
          opacity: 0,
        },
      ],
      {
        duration,
        easing: computed
          .getPropertyValue("--standard")
          .trim(),
      },
    );

    animations.current.add(animation);

    const clean = () => {
      animations.current.delete(animation);
      dot.remove();
    };

    animation.onfinish = clean;
    animation.oncancel = clean;
  }

  return (
    <button
      {...props}
      ref={buttonRef}
      type={type}
      className={`interactive ${className}`}
      onPointerDown={(
        event: PointerEvent<HTMLButtonElement>,
      ) => {
        onPointerDown?.(event);
        if (event.defaultPrevented) return;

        const rect =
          event.currentTarget.getBoundingClientRect();

        ripple(
          event.clientX - rect.left,
          event.clientY - rect.top,
          event.currentTarget,
        );
      }}
      onKeyDown={(
        event: KeyboardEvent<HTMLButtonElement>,
      ) => {
        onKeyDown?.(event);

        if (
          !event.defaultPrevented &&
          !event.repeat &&
          (event.key === "Enter" || event.key === " ")
        ) {
          ripple(
            event.currentTarget.clientWidth / 2,
            event.currentTarget.clientHeight / 2,
            event.currentTarget,
          );
        }
      }}
    >
      <span className="state-layer" aria-hidden="true" />
      <span
        className="ripple-slot"
        ref={slot}
        aria-hidden="true"
      />
      <span className="button-content">{children}</span>
    </button>
  );
}

export function IconButton({
  name,
  label,
  filled = false,
  animated = false,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  name: string;
  label: string;
  filled?: boolean;
  animated?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLButtonElement>(null);

  const [tip, setTip] = useState<{
    left: number;
    top: number;
    below: boolean;
    target: Element;
  } | null>(null);

  const [lastTip, setLastTip] = useState(tip);

  function show() {
    const button = ref.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const below = rect.top < 64;

    const position = {
      left: Math.max(
        120,
        Math.min(innerWidth - 120, rect.left + rect.width / 2),
      ),
      top: below ? rect.bottom + 8 : rect.top - 8,
      below,
      target: button.closest("dialog[open]") ?? document.body,
    };

    setLastTip(position);
    setTip(position);
  }

  useEffect(() => {
    if (!tip) return;

    const hide = () => setTip(null);
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };

    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    document.addEventListener("keydown", escape);

    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      document.removeEventListener("keydown", escape);
    };
  }, [tip]);

  return (
    <span className="tooltip-anchor">
      <Button
        {...props}
        buttonRef={ref}
        className={`icon-button ${props.className ?? ""}`}
        aria-label={label}
        aria-describedby={tip ? id : undefined}
        onMouseEnter={(event) => {
          props.onMouseEnter?.(event);
          show();
        }}
        onMouseLeave={(event) => {
          props.onMouseLeave?.(event);
          setTip(null);
        }}
        onFocus={(event) => {
          props.onFocus?.(event);
          show();
        }}
        onBlur={(event) => {
          props.onBlur?.(event);
          setTip(null);
        }}
        onPointerDown={(event) => {
          props.onPointerDown?.(event);
          setTip(null);
        }}
      >
        {animated ? (
          <AnimatedIcon name={name} filled={filled} />
        ) : (
          <Icon name={name} filled={filled} />
        )}
      </Button>

      {lastTip &&
        createPortal(
          <span
            className="tooltip-position"
            style={{
              position: "fixed",
              left: lastTip.left,
              top: lastTip.top,
              transform: lastTip.below
                ? "translateX(-50%)"
                : "translate(-50%, -100%)",
            }}
          >
            <Presence
              visible={!!tip}
              className="tooltip visible"
              id={id}
              role="tooltip"
            >
              {label}
            </Presence>
          </span>,
          lastTip.target,
        )}
    </span>
  );
}

export function TextField({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
}) {
  const id = useId();

  return (
    <div className="text-field">
      <input
        {...props}
        id={id}
        placeholder={props.placeholder ?? " "}
      />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Button
      className="switch-row"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      <span className={`switch-track ${checked ? "checked" : ""}`}>
        <span className="switch-thumb">
          {checked && <Icon name="check" size={16} filled />}
        </span>
      </span>
    </Button>
  );
}

export function MenuField({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const optionKey = options
    .map((option) => option.value)
    .join("\0");

  useEffect(() => {
    if (!open) return;

    const index = Math.max(
      0,
      options.findIndex((option) => option.value === value),
    );

    const frame = requestAnimationFrame(() => {
      const items = menu.current?.querySelectorAll<HTMLButtonElement>(
        "[role=menuitemradio]",
      );
      items?.[index]?.focus();
    });

    const outside = (event: globalThis.PointerEvent) => {
      if (
        event.target instanceof Node &&
        !root.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", outside);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open, optionKey, options, value]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <div
      className="menu-field"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <Button
        buttonRef={trigger}
        className="menu-trigger"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (
            event.key === "ArrowDown" ||
            event.key === "ArrowUp"
          ) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span>
          <small>{label}</small>
          <strong>
            {options.find((option) => option.value === value)
              ?.label ?? value}
          </strong>
        </span>
        <Icon name="expand_more" filled={open} />
      </Button>

      <Presence visible={open} className="menu-presence">
        <div
          ref={menu}
          id={id}
          className="menu"
          role="menu"
          aria-label={label}
          onKeyDown={(event) => {
            const items = Array.from(
              menu.current?.querySelectorAll<HTMLButtonElement>(
                "[role=menuitemradio]",
              ) ?? [],
            );

            const index = items.indexOf(
              document.activeElement as HTMLButtonElement,
            );

            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close();
            }

            if (
              ["ArrowDown", "ArrowUp", "Home", "End"].includes(
                event.key,
              )
            ) {
              event.preventDefault();

              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? items.length - 1
                    : (index +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        items.length) %
                      items.length;

              items[next]?.focus();
            }

            if (
              event.key.length === 1 &&
              /[\p{L}\p{N}]/u.test(event.key)
            ) {
              items
                .find((item) =>
                  item.textContent
                    ?.trim()
                    .toLowerCase()
                    .startsWith(event.key.toLowerCase()),
                )
                ?.focus();
            }
          }}
        >
          {options.map((option) => (
            <Button
              className="menu-item"
              role="menuitemradio"
              aria-checked={option.value === value}
              tabIndex={-1}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                close();
              }}
            >
              <span>{option.label}</span>
              {option.value === value && (
                <Icon name="check" filled />
              )}
            </Button>
          ))}
        </div>
      </Presence>
    </div>
  );
}
