export type Axis = "x" | "y";
export type MotionKind = "enter" | "exit" | "pop" | "user";

export const reducedMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;

export function token(name: string, fallback: number): number {
  return (
    parseFloat(
      getComputedStyle(document.documentElement)
        .getPropertyValue(name),
    ) || fallback
  );
}

const easing = (name: string) =>
  getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim() || "ease-out";

let serial = 0;

const active = new WeakMap<
  HTMLElement,
  { cancel: () => void }
>();

export function animateMotion(
  element: HTMLElement,
  kind: MotionKind = "enter",
  axis: Axis = "y",
  delay = 0,
  offset?: number,
) {
  active.get(element)?.cancel();
  element.dataset.ready = "true";

  const reduced = reducedMotion();
  const out = kind === "exit";

  const duration = token(
    reduced
      ? "--motion-fade"
      : out
        ? "--motion-exit"
        : "--motion-enter",
    reduced ? 80 : out ? 160 : 320,
  );

  const previous = {
    filter: element.style.filter,
    willChange: element.style.willChange,
  };

  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  const filter = document.createElementNS(namespace, "filter");
  const blur = document.createElementNS(
    namespace,
    "feGaussianBlur",
  );

  const id = `luna-motion-${++serial}`;

  filter.id = id;
  filter.setAttribute("x", "-20%");
  filter.setAttribute("y", "-40%");
  filter.setAttribute("width", "140%");
  filter.setAttribute("height", "180%");

  filter.append(blur);
  svg.append(filter);

  Object.assign(svg.style, {
    position: "absolute",
    width: "0",
    height: "0",
    pointerEvents: "none",
  });

  if (!reduced) {
    document.body.append(svg);
    element.style.filter = `url(#${id})`;
  }

  element.style.willChange = reduced
    ? "opacity"
    : "transform, opacity, filter";

  const distance = offset ?? (axis === "x" ? 14 : 10);

  const translate = (value: number) =>
    axis === "x"
      ? `translateX(${value}px)`
      : `translateY(${value}px)`;

  const startScale =
    kind === "user" ? 0.96 : kind === "pop" ? 0.95 : 1;

  const rotation = element.hasAttribute("data-icon-current")
    ? " rotate(35deg)"
    : "";

  const exitRotation = element.hasAttribute("data-icon-old")
    ? " rotate(-35deg)"
    : "";

  const collapse = element.classList.contains("chat-row")
    ? " scaleY(.08)"
    : "";

  const keyframes: Keyframe[] = reduced
    ? [
        { opacity: out ? 1 : 0 },
        { opacity: out ? 0 : 1 },
      ]
    : out
      ? [
          {
            opacity: 1,
            transform: "translate(0,0) scale(1)",
          },
          {
            opacity: 0,
            transform:
              `${translate(-distance)} scale(.97)` +
              exitRotation +
              collapse,
          },
        ]
      : [
          {
            opacity: offset === undefined ? 0 : 1,
            transform:
              `${translate(distance)} scale(${startScale})` +
              rotation,
          },
          {
            opacity: 1,
            transform: "translate(0,0) scale(1)",
          },
        ];

  const animation = element.animate(keyframes, {
    duration,
    delay: reduced ? 0 : delay,
    fill: "both",
    easing: easing(
      out ? "--motion-accelerate" : "--motion-emphasized",
    ),
  });

  let frame = 0;
  let cleaned = false;

  function tick() {
    if (cleaned || reduced) return;

    const progress = Number(
      animation.effect?.getComputedTiming().progress ?? 0,
    );

    const maximum =
      element.offsetWidth * element.offsetHeight > 200000
        ? 2
        : token("--motion-blur", 6);

    const amount = maximum * (out ? progress : 1 - progress);

    blur.setAttribute(
      "stdDeviation",
      axis === "x" ? `${amount} 0` : `0 ${amount}`,
    );

    frame = requestAnimationFrame(tick);
  }

  tick();

  function clean() {
    if (cleaned) return;

    cleaned = true;
    cancelAnimationFrame(frame);
    animation.cancel();
    svg.remove();

    element.style.filter = previous.filter;
    element.style.willChange = previous.willChange;
  }

  const media = matchMedia("(prefers-reduced-motion: reduce)");

  const changed = () => {
    if (media.matches) clean();
  };

  media.addEventListener("change", changed);

  const finished = animation.finished
    .catch(() => undefined)
    .then(() => {
      media.removeEventListener("change", changed);
      clean();
    });

  const control = {
    finished,
    cancel: () => {
      media.removeEventListener("change", changed);
      clean();
    },
  };

  active.set(element, control);
  return control;
}

export function flipLayout(update: () => void) {
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>("[data-flip]"),
  );

  const before = new Map(
    elements.map((element) => [
      element,
      element.getBoundingClientRect(),
    ]),
  );

  update();

  if (reducedMotion()) return;

  elements.forEach((element) => {
    if (!element.isConnected) return;

    const previous = before.get(element);
    const next = element.getBoundingClientRect();

    if (!previous) return;

    const x = previous.left - next.left;
    const y = previous.top - next.top;

    if (Math.abs(x) + Math.abs(y) <= 1) return;

    const horizontal = Math.abs(x) > Math.abs(y);

    animateMotion(
      element,
      "enter",
      horizontal ? "x" : "y",
      0,
      horizontal ? x : y,
    );
  });
}

type Transition = {
  finished: Promise<void>;
  skipTransition: () => void;
};

type TransitionDocument = Document & {
  startViewTransition?: (update: () => void) => Transition;
};

let transition: Transition | undefined;
let viewVersion = 0;

export function viewChange(
  kind: "thread" | "theme",
  update: () => void,
) {
  const ticket = ++viewVersion;
  const doc = document as TransitionDocument;

  transition?.skipTransition();

  if (reducedMotion() || !doc.startViewTransition) {
    document.documentElement.classList.add("color-fade");
    update();

    setTimeout(
      () =>
        document.documentElement.classList.remove("color-fade"),
      token("--motion-fade", 80),
    );

    return;
  }

  document.documentElement.dataset.transition = kind;

  try {
    const current = doc.startViewTransition(() => {
      if (ticket === viewVersion) update();
    });

    transition = current;

    void current.finished
      .catch(() => undefined)
      .then(() => {
        if (transition === current) {
          transition = undefined;
          delete document.documentElement.dataset.transition;
        }
      });
  } catch {
    update();
  }
}

export async function closeDialog(
  element: HTMLDialogElement | null,
  close: () => void,
) {
  if (!element || element.dataset.closing) return;

  element.dataset.closing = "true";
  await animateMotion(element, "exit").finished;
  delete element.dataset.closing;

  close();
}
