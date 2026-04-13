export function splitCsv(value?: string): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseOptionalBoolean(raw?: string): boolean | undefined {
  if (raw === undefined) {
    return undefined;
  }
  return raw === "1" || raw.toLowerCase() === "true";
}

export function parseOptionalInteger(raw?: string): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

export function normalizeLowerCase(raw?: string): string {
  if (!raw) {
    return "";
  }
  return raw.trim().toLowerCase();
}
