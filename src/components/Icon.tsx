import type { CSSProperties } from "react";

export function Icon({
  name,
  size = 20,
  filled = false,
}: {
  name: string;
  size?: number;
  filled?: boolean;
}) {
  const style: CSSProperties = {
    fontSize: size,
    fontVariationSettings: [
      `"FILL" ${filled ? 1 : 0}`,
      `"wght" 400`,
      `"GRAD" 0`,
      `"opsz" ${Math.max(20, Math.min(48, size))}`,
    ].join(", "),
  };

  return (
    <span
      className="material-symbols-rounded icon"
      style={style}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
