import rawPresets from "./provider-presets.json";
import type { Provider, ProviderPreset } from "../types";

export const providerPresets = rawPresets as ProviderPreset[];

export const demoProvider: Provider = {
  id: "demo",
  presetId: "demo",
  name: "Demo",
  kind: "demo",
  baseUrl: "",
  models: ["demo"],
  hasKey: false,
  keyRequired: false,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

export function providerFromPreset(preset: ProviderPreset, id: string): Provider {
  return {
    id,
    presetId: preset.id,
    name: preset.name,
    kind: preset.kind,
    baseUrl: preset.baseUrl,
    models: preset.examples,
    hasKey: false,
    keyRequired: preset.keyRequired,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
