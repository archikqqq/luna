export const providerCollator = new Intl.Collator("ru", {
  sensitivity: "base",
  numeric: true,
});

export function normalizeProviderSearch(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ё/gi, "е")
    .toLocaleLowerCase("ru")
    .trim();
}

function matchScore(option, query) {
  if (option.pinned) return null;
  const name = normalizeProviderSearch(option.label);
  const id = normalizeProviderSearch(option.value);
  const terms = (option.keywords ?? []).map(normalizeProviderSearch);

  if (!query) return 0;
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.includes(query)) return 2;
  if (terms.some((term) => term.startsWith(query))) return 3;
  if (terms.some((term) => term.includes(query))) return 4;
  if (id.startsWith(query)) return 5;
  if (id.includes(query)) return 6;
  return null;
}

export function searchProviderOptions(options, input, collator = providerCollator) {
  const query = normalizeProviderSearch(input);
  const regular = [];
  const pinned = [];

  for (const option of options) {
    if (option.pinned) {
      pinned.push(option);
      continue;
    }
    const score = matchScore(option, query);
    if (score !== null) regular.push({ option, score });
  }

  regular.sort((a, b) =>
    a.score - b.score || collator.compare(a.option.label, b.option.label),
  );
  pinned.sort((a, b) => collator.compare(a.label, b.label));
  return [...regular.map((entry) => entry.option), ...pinned];
}
