export type QueryValue = string | string[];

export function matchesValue(value: string | undefined, query: QueryValue | undefined): boolean {
  if (query === undefined) {
    return true;
  }

  if (value === undefined) {
    return false;
  }

  const values = Array.isArray(query) ? query : [query];
  return values.includes(value);
}

export function matchesAnyValue(values: readonly string[], query: QueryValue | undefined): boolean {
  if (query === undefined) {
    return true;
  }

  const expected = Array.isArray(query) ? query : [query];
  return expected.some((value) => values.includes(value));
}

export function matchesText(fields: Array<string | undefined>, query: string | undefined): boolean {
  if (query === undefined || query === "") {
    return true;
  }

  const normalizedQuery = query.toLowerCase();
  return fields.some((field) => field?.toLowerCase().includes(normalizedQuery));
}
