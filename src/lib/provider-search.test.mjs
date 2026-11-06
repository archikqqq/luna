import test from "node:test";
import assert from "node:assert/strict";
import { searchProviderOptions } from "./provider-search.mjs";

const providers = [
  { value: "openai", label: "OpenAI", keywords: ["gpt", "чат жпт"] },
  { value: "ollama", label: "Ollama", keywords: ["llama", "локальные модели"] },
  { value: "groq", label: "Groq", keywords: ["llama", "быстрые модели"] },
  { value: "zai", label: "Z.AI", keywords: ["зет аи"] },
  { value: "custom", label: "Свой провайдер (OpenAI-compatible)", pinned: true },
];

test("empty input alphabetizes names and keeps custom pinned last", () => {
  assert.deepEqual(
    searchProviderOptions(providers, "").map((provider) => provider.value),
    ["groq", "ollama", "openai", "zai", "custom"],
  );
});

test("name prefix matches precede matches in the middle", () => {
  const options = [
    { value: "a", label: "My Groq gateway" },
    { value: "b", label: "Groq" },
  ];
  assert.deepEqual(searchProviderOptions(options, "groq").map((item) => item.value), ["b", "a"]);
});

test("keywords find providers and ё is equivalent to е", () => {
  assert.deepEqual(searchProviderOptions(providers, "llama").map((item) => item.value), ["groq", "ollama", "custom"]);
  assert.deepEqual(searchProviderOptions(providers, "чат жпт").map((item) => item.value), ["openai", "custom"]);
});

test("custom provider stays pinned even when the search has no matches", () => {
  assert.deepEqual(searchProviderOptions(providers, "unknown").map((item) => item.value), ["custom"]);
});
