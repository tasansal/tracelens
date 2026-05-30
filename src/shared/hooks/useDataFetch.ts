/**
 * Generic data fetching hook with loading and error states.
 *
 * @param fetchFn - Async function that returns data of type T
 * @param deps - Dependency array to trigger re-fetch when values change
 * @returns Object with data, loading, error, and refetch
 */
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from 'react';

export interface UseDataFetchReturn<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

type FetchAction<T> =
  | { type: 'start' }
  | { type: 'success'; data: T }
  | { type: 'error'; error: string };

function fetchReducer<T>(state: FetchState<T>, action: FetchAction<T>): FetchState<T> {
  switch (action.type) {
    case 'start':
      return { ...state, loading: true, error: null };
    case 'success':
      return { data: action.data, loading: false, error: null };
    case 'error':
      return { ...state, loading: false, error: action.error };
    default:
      return state;
  }
}

export function useDataFetch<T>(
  fetchFn: () => Promise<T>,
  deps: React.DependencyList
): UseDataFetchReturn<T> {
  const [state, dispatch] = useReducer(fetchReducer<T>, {
    data: null,
    loading: true,
    error: null,
  });

  // Store latest fetchFn in a ref so the effect doesn't depend on its identity.
  // Callers control re-fetching via the `deps` array — including fetchFn would
  // cause infinite loops when callers pass unstabilized arrow functions.
  const fetchFnRef = useRef(fetchFn);
  useLayoutEffect(() => {
    fetchFnRef.current = fetchFn;
  });

  const refetch = useCallback(() => {
    dispatch({ type: 'start' });

    fetchFnRef
      .current()
      .then(fetchedData => {
        dispatch({ type: 'success', data: fetchedData });
      })
      .catch(err => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('Data fetch failed:', msg);
        dispatch({ type: 'error', error: msg });
      });
  }, []);

  useEffect(() => {
    let isMounted = true;
    dispatch({ type: 'start' });

    fetchFnRef
      .current()
      .then(fetchedData => {
        if (isMounted) {
          dispatch({ type: 'success', data: fetchedData });
        }
      })
      .catch(err => {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('Data fetch failed:', msg);
          dispatch({ type: 'error', error: msg });
        }
      });

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, refetch };
}
