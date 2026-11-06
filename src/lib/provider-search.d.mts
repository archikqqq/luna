export interface ProviderSearchOption {
  value: string;
  label: string;
  keywords?: string[];
  pinned?: boolean;
}

export const providerCollator: Intl.Collator;
export function normalizeProviderSearch(value: string): string;
export function searchProviderOptions<T extends ProviderSearchOption>(
  options: T[],
  input: string,
  collator?: Intl.Collator,
): T[];
