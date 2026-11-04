import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import {
  animateMotion,
  type Axis,
  type MotionKind,
} from "../lib/motion";

export function Presence({
  visible = true,
  axis = "y",
  kind = "pop",
  delay = 0,
  onExited,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  visible?: boolean;
  axis?: Axis;
  kind?: MotionKind;
  delay?: number;
  onExited?: () => void;
}) {
  const [present, setPresent] = useState(visible);
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(onExited);

  useLayoutEffect(() => {
    done.current = onExited;
  }, [onExited]);

  useLayoutEffect(() => {
    if (visible && !present) setPresent(true);
  }, [visible, present]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.inert = !visible;

    let current = true;

    const motion = animateMotion(
      element,
      visible ? kind : "exit",
      axis,
      delay,
    );

    if (!visible) {
      void motion.finished.then(() => {
        if (current) {
          setPresent(false);
          done.current?.();
        }
      });
    }

    return () => {
      current = false;
      motion.cancel();
    };
  }, [visible, present, axis, kind, delay]);

  return present ? (
    <div {...props} ref={ref}>
      {children}
    </div>
  ) : null;
}

export function MotionRoot() {
  useEffect(() => {
    const seen = new WeakSet<Element>();
    const keys = new Set<string>();
    const keyOrder: string[] = [];
    const running = new Set<
      ReturnType<typeof animateMotion>
    >();

    const scan = (root: Element) => {
      const nodes = [
        root,
        ...root.querySelectorAll<HTMLElement>(
          "[data-enter], .user-bubble",
        ),
      ];

      nodes.forEach((node) => {
        if (
          !(node instanceof HTMLElement) ||
          seen.has(node) ||
          !node.matches("[data-enter], .user-bubble")
        ) {
          return;
        }

        seen.add(node);

        if (node.dataset.motionKey) {
          if (keys.has(node.dataset.motionKey)) return;
          keys.add(node.dataset.motionKey);
          keyOrder.push(node.dataset.motionKey);

          if (keyOrder.length > 1000) {
            const oldest = keyOrder.shift();
            if (oldest) keys.delete(oldest);
          }
        }

        const motion = animateMotion(
          node,
          node.classList.contains("user-bubble")
            ? "user"
            : "enter",
          node.dataset.axis === "x" ? "x" : "y",
          Number(node.dataset.delay ?? 0),
        );

        running.add(motion);

        void motion.finished.then(() =>
          running.delete(motion),
        );
      });
    };

    scan(document.body);

    const observer = new MutationObserver((records) =>
      records.forEach((record) =>
        record.addedNodes.forEach((node) => {
          if (node instanceof Element) scan(node);
        }),
      ),
    );

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      running.forEach((motion) => motion.cancel());
    };
  }, []);

  return null;
}

export function WordReveal({
  text,
  start = 0,
}: {
  text: string;
  start?: number;
}) {
  const stagger =
    parseFloat(
      getComputedStyle(document.documentElement)
        .getPropertyValue("--motion-stagger"),
    ) || 40;

  return (
    <span aria-label={text}>
      {text.split(" ").map((word, index) => (
        <span
          key={index}
          className="word"
          aria-hidden="true"
          data-enter
          data-delay={start + index * stagger}
        >
          {word}
          {"\u00a0"}
        </span>
      ))}
    </span>
  );
}

export function AnimatedIcon({
  name,
  filled = false,
}: {
  name: string;
  filled?: boolean;
}) {
  const [old, setOld] = useState<{
    name: string;
    filled: boolean;
  } | null>(null);

  const previous = useRef({ name, filled });
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (
      previous.current.name === name &&
      previous.current.filled === filled
    ) {
      return;
    }

    setOld(previous.current);
    previous.current = { name, filled };
  }, [name, filled]);

  useLayoutEffect(() => {
    const incoming =
      ref.current?.querySelector<HTMLElement>(
        "[data-icon-current]",
      );

    const motion = incoming
      ? animateMotion(incoming, "pop")
      : null;

    return () => motion?.cancel();
  }, [name, filled]);

  useLayoutEffect(() => {
    const outgoing =
      ref.current?.querySelector<HTMLElement>(
        "[data-icon-old]",
      );

    if (!old || !outgoing) return;

    let current = true;
    const motion = animateMotion(outgoing, "exit");

    void motion.finished.then(() => {
      if (current) setOld(null);
    });

    return () => {
      current = false;
      motion.cancel();
    };
  }, [old]);

  const symbol = (
    value: string,
    fill: boolean,
  ): ReactNode => (
    <span
      className="material-symbols-rounded icon"
      style={{
        fontVariationSettings:
          `"FILL" ${fill ? 1 : 0}, ` +
          `"wght" 400, "GRAD" 0, "opsz" 20`,
      }}
    >
      {value}
    </span>
  );

  return (
    <span className="icon-swap" ref={ref} aria-hidden="true">
      {old && (
        <span data-icon-old>
          {symbol(old.name, old.filled)}
        </span>
      )}
      <span data-icon-current key={name}>
        {symbol(name, filled)}
      </span>
    </span>
  );
}
