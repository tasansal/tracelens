/**
 * Backend error types matching the Rust `AppError` discriminated union.
 *
 * Errors cross the IPC boundary as JSON strings with a `name` discriminator
 * and a `message` field.
 */

type AppErrorName =
  | 'IoError'
  | 'ParseError'
  | 'ValidationError'
  | 'SegyError'
  | 'InvalidUri'
  | 'InvalidRange';

export interface AppError {
  name: AppErrorName;
  message: string;
}

/**
 * Try to parse a backend error into a typed `AppError`.
 * Returns `null` if the error isn't a recognized JSON payload.
 */
export function parseBackendError(error: unknown): AppError | null {
  const raw = error instanceof Error ? error.message : String(error);

  if (typeof raw !== 'string') return null;

  try {
    const payload = JSON.parse(raw) as Record<string, unknown>;
    if (
      payload &&
      typeof payload.name === 'string' &&
      typeof payload.message === 'string' &&
      payload.message.trim()
    ) {
      return { name: payload.name as AppErrorName, message: payload.message };
    }
  } catch {
    // Non-JSON error string
  }

  return null;
}

/**
 * Extract a user-facing message from any backend error.
 * Prefers the structured `message` field, falls back to the raw string.
 */
export function getErrorMessage(error: unknown): string {
  const parsed = parseBackendError(error);
  if (parsed) return parsed.message;
  return error instanceof Error ? error.message : String(error);
}
