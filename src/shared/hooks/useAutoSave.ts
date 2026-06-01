/**
 * Debounced auto-save with a transient "saved" badge.
 *
 * On first run (or whenever `enabled` flips on) it records the serialized
 * baseline without persisting. Later changes kick a debounce window, then
 * call `persist`, transitioning through `saving` → `saved` (or `error`).
 * The `saved` state falls back to `idle` after `badgeResetMs`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface UseAutoSaveOptions<T> {
  /** Current value to persist. */
  value: T | null | undefined;
  /** Whether auto-save should run (e.g., after initial load completes). */
  enabled: boolean;
  /** Async persister invoked with the latest value after the debounce window. */
  persist: (value: T) => Promise<void>;
  /** Serializer used to detect meaningful changes. Defaults to `JSON.stringify`. */
  serialize?: (value: T) => string;
  /** User-facing label for toast on failure. */
  errorMessage: string;
  /** Debounce window before persisting. Defaults to 450ms. */
  debounceMs?: number;
  /** How long the `saved` badge stays visible. Defaults to 1800ms. */
  badgeResetMs?: number;
}

export interface UseAutoSaveReturn<T> {
  saveState: SaveState;
  /** Record a value as already persisted (e.g. after an external broadcast). */
  markPersisted: (value: T) => void;
}

export function useAutoSave<T>({
  value,
  enabled,
  persist,
  serialize = JSON.stringify,
  errorMessage,
  debounceMs = 450,
  badgeResetMs = 1800,
}: UseAutoSaveOptions<T>): UseAutoSaveReturn<T> {
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const lastPersistedRef = useRef<string | null>(null);
  const badgeTimerRef = useRef<number | null>(null);

  const clearBadgeTimer = useCallback(() => {
    if (badgeTimerRef.current !== null) {
      window.clearTimeout(badgeTimerRef.current);
      badgeTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearBadgeTimer, [clearBadgeTimer]);

  useEffect(() => {
    if (!enabled || value == null) return;

    const serialized = serialize(value);
    if (lastPersistedRef.current === null) {
      lastPersistedRef.current = serialized;
      return;
    }
    if (serialized === lastPersistedRef.current) return;

    clearBadgeTimer();
    setSaveState('saving');

    const valueToPersist = value;
    const saveTimer = window.setTimeout(async () => {
      try {
        await persist(valueToPersist);
        lastPersistedRef.current = serialized;
        setSaveState('saved');
        badgeTimerRef.current = window.setTimeout(() => {
          setSaveState(current => (current === 'saved' ? 'idle' : current));
          badgeTimerRef.current = null;
        }, badgeResetMs);
      } catch (error) {
        console.error(errorMessage, error);
        setSaveState('error');
        toast.error(errorMessage);
      }
    }, debounceMs);

    return () => window.clearTimeout(saveTimer);
    // `persist` and `serialize` are expected to be stable references from callers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, value, badgeResetMs, debounceMs, errorMessage, clearBadgeTimer]);

  const markPersisted = useCallback(
    (v: T) => {
      lastPersistedRef.current = serialize(v);
    },
    [serialize]
  );

  return { saveState, markPersisted };
}
