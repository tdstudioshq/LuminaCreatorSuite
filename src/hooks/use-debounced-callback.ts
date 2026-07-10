import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Returns a stable debounced wrapper around `callback`. The latest callback is
 * always invoked, and any pending call is FLUSHED (invoked immediately with its
 * pending args) on unmount — so an edit typed just before closing an editor is
 * saved rather than silently dropped.
 */
export function useDebouncedCallback<A extends unknown[]>(
  callback: (...args: A) => void,
  delayMs = 500,
): (...args: A) => void {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingArgs = useRef<A | null>(null);
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        const args = pendingArgs.current;
        pendingArgs.current = null;
        if (args) callbackRef.current(...args);
      }
    },
    [],
  );

  return useMemo(
    () =>
      (...args: A) => {
        if (timer.current) clearTimeout(timer.current);
        pendingArgs.current = args;
        timer.current = setTimeout(() => {
          timer.current = null;
          pendingArgs.current = null;
          callbackRef.current(...args);
        }, delayMs);
      },
    [delayMs],
  );
}

/**
 * Controlled-input helper: keeps a responsive local value while debouncing the
 * expensive commit (e.g. a Supabase mutation). The local value resyncs when the
 * upstream `value` changes (such as after a refetch).
 */
export function useDebouncedField(
  value: string,
  commit: (next: string) => void,
  delayMs = 500,
): readonly [string, (next: string) => void] {
  const [local, setLocal] = useState(value);
  useEffect(() => {
    setLocal(value);
  }, [value]);

  const debouncedCommit = useDebouncedCallback(commit, delayMs);

  const onChange = (next: string) => {
    setLocal(next);
    debouncedCommit(next);
  };

  return [local, onChange] as const;
}
