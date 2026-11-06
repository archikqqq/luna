import rawPresets from "./provider-presets.json";
import type { Provider, ProviderPreset } from "../types";
import { providerCollator } from "./provider-search.mjs";

export const providerPresets = rawPresets as ProviderPreset[];
const deferredKinds = new Set(["gemini-native", "azure-openai", "bedrock", "vertex"]);
export const sortedProviderPresets = [...providerPresets].sort((a, b) => {
  const aDeferred = deferredKinds.has(a.kind) || Boolean(a.notes);
  const bDeferred = deferredKinds.has(b.kind) || Boolean(b.notes);
  return Number(aDeferred) - Number(bDeferred) || providerCollator.compare(a.name, b.name);
});

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
