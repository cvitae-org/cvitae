export type MessageValues = Record<string, string | number>;

export type ErrorDescriptor = {
  code: string;
  values?: MessageValues;
  /** Sanitized diagnostic text. It is never used as the primary UI message. */
  detail?: string;
};

export type ApiErrorShape = {
  error?: string | ErrorDescriptor;
};

const safeValues = (value: unknown): MessageValues | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string | number] =>
      typeof entry[1] === 'string' || typeof entry[1] === 'number'
  );
  return entries.length ? Object.fromEntries(entries) : undefined;
};

/** Accepts the new descriptor contract and keeps older string responses safe. */
export const errorFromApi = (
  payload: unknown,
  fallbackCode: string
): ErrorDescriptor => {
  if (!payload || typeof payload !== 'object') return { code: fallbackCode };
  const error = (payload as ApiErrorShape).error;
  if (typeof error === 'string') {
    return { code: fallbackCode, detail: error.slice(0, 500) };
  }
  if (error && typeof error.code === 'string') {
    return {
      code: error.code,
      values: safeValues(error.values),
      detail:
        typeof error.detail === 'string' ? error.detail.slice(0, 500) : undefined
    };
  }
  return { code: fallbackCode };
};

/** Server helper: raw diagnostics are deliberately bounded before crossing HTTP. */
export const apiError = (
  code: string,
  values?: MessageValues,
  detail?: unknown
): ErrorDescriptor => ({
  code,
  values,
  detail:
    typeof detail === 'string'
      ? detail.slice(0, 500)
      : detail instanceof Error
        ? detail.message.slice(0, 500)
        : undefined
});
