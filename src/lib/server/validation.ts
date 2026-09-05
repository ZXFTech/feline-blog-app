type StringOptions = {
  label: string;
  max: number;
  trim?: boolean;
  allowEmpty?: boolean;
};

export function codePointLength(value: string) {
  return Array.from(value).length;
}

export function parseString(value: unknown, options: StringOptions) {
  if (typeof value !== 'string') return null;
  const parsed = options.trim === false ? value : value.trim();
  if (!options.allowEmpty && parsed.length === 0) return null;
  if (codePointLength(parsed) > options.max) return null;
  return parsed;
}

export function parsePositiveInt(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function parseDateOnly(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

export function utf8ByteLength(value: string) {
  return new TextEncoder().encode(value).length;
}
