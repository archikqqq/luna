import { useLayoutEffect, useRef } from "react";
import {
  argbFromHex,
  hexFromArgb,
  Hct,
  TonalPalette,
  themeFromSourceColor,
} from "@material/material-color-utilities";
import { useAppStore } from "../store/useAppStore";
import { DEFAULT_SEED } from "./palette";
import { viewChange } from "./motion";

export { seedPresets } from "./palette";

const kebab = (value: string) =>
  value.replace(
    /[A-Z]/g,
    (character) => "-" + character.toLowerCase(),
  );

export function applyMaterialTheme(
  seed: string,
  dark: boolean,
): void {
  const source = Hct.fromInt(
    argbFromHex(seed),
  );

  const theme = themeFromSourceColor(
    argbFromHex(seed),
  );

  const scheme = dark
    ? theme.schemes.dark
    : theme.schemes.light;

  const colors: Record<string, string> = {};

  Object.entries(scheme.toJSON()).forEach(
    ([key, value]) => {
      colors[kebab(key)] = hexFromArgb(value);
    },
  );

  const neutral = source.chroma < 8;

  const primary = TonalPalette.fromHueAndChroma(
    source.hue,
    neutral
      ? 4
      : Math.max(28, source.chroma),
  );

  const secondary = TonalPalette.fromHueAndChroma(
    source.hue,
    neutral ? 3 : 16,
  );

  const tertiary = TonalPalette.fromHueAndChroma(
    (source.hue + 35) % 360,
    neutral ? 4 : 20,
  );

  const surface = TonalPalette.fromHueAndChroma(
    source.hue,
    neutral ? 2 : 5,
  );

  const variant = TonalPalette.fromHueAndChroma(
    source.hue,
    neutral ? 3 : 8,
  );

  for (const [name, palette] of Object.entries({
    primary,
    secondary,
    tertiary,
  })) {
    colors[name] = hexFromArgb(
      palette.tone(dark ? 80 : 40),
    );
    colors["on-" + name] = hexFromArgb(
      palette.tone(dark ? 20 : 100),
    );
    colors[name + "-container"] = hexFromArgb(
      palette.tone(dark ? 30 : 90),
    );
    colors["on-" + name + "-container"] =
      hexFromArgb(
        palette.tone(dark ? 90 : 10),
      );
  }

  const tones: Record<string, number> = dark
    ? {
        background: 6,
        surface: 6,
        "surface-dim": 6,
        "surface-bright": 24,
        "surface-container-lowest": 4,
        "surface-container-low": 10,
        "surface-container": 12,
        "surface-container-high": 17,
        "surface-container-highest": 22,
        "on-surface": 90,
        "on-background": 90,
        "inverse-surface": 90,
        "inverse-on-surface": 20,
      }
    : {
        background: 98,
        surface: 98,
        "surface-dim": 87,
        "surface-bright": 98,
        "surface-container-lowest": 100,
        "surface-container-low": 96,
        "surface-container": 94,
        "surface-container-high": 92,
        "surface-container-highest": 90,
        "on-surface": 10,
        "on-background": 10,
        "inverse-surface": 20,
        "inverse-on-surface": 95,
      };

  Object.entries(tones).forEach(
    ([name, tone]) => {
      colors[name] = hexFromArgb(
        surface.tone(tone),
      );
    },
  );

  colors["on-surface-variant"] = hexFromArgb(
    variant.tone(dark ? 80 : 30),
  );
  colors["surface-variant"] = hexFromArgb(
    variant.tone(dark ? 30 : 90),
  );
  colors.outline = hexFromArgb(
    variant.tone(dark ? 60 : 50),
  );
  colors["outline-variant"] = hexFromArgb(
    variant.tone(dark ? 30 : 80),
  );
  colors["inverse-primary"] = hexFromArgb(
    primary.tone(dark ? 40 : 80),
  );
  colors["surface-tint"] = colors.primary;

  const root = document.documentElement;

  Object.entries(colors).forEach(
    ([key, value]) => {
      root.style.setProperty(
        "--md-sys-color-" + key,
        value,
      );
    },
  );

  root.style.colorScheme =
    dark ? "dark" : "light";
}

export function useMaterialTheme(): void {
  const appearance = useAppStore(
    (state) => state.appearance,
  );

  const previous = useRef("");

  useLayoutEffect(() => {
    const media = matchMedia(
      "(prefers-color-scheme: dark)",
    );

    const apply = () => {
      const dark =
        appearance.mode === "dark" ||
        (appearance.mode === "system" &&
          media.matches);

      const seed =
        appearance.seed || DEFAULT_SEED;

      const key = seed + "|" + dark;

      if (previous.current === key) return;

      const colors = () =>
        applyMaterialTheme(seed, dark);

      if (previous.current) {
        viewChange("theme", colors);
      } else {
        colors();
      }

      previous.current = key;
    };

    apply();
    media.addEventListener("change", apply);

    return () =>
      media.removeEventListener(
        "change",
        apply,
      );
  }, [appearance]);
}
