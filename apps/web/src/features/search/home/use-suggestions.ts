import { useEffect, useState } from 'react';
import { RequestAbortedError } from '../../../shared/api/errors';
import { getSuggestions } from '../api/search-service';
import type { PublicSuggestions } from '../api/search-types';

type Result =
  | { status: 'ready'; data: PublicSuggestions }
  | { status: 'error'; error: unknown };

export function useSuggestions(query: string, enabled: boolean) {
  const q = query.trim();
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([q, enabled, attempt]);
  const [settled, setSettled] = useState<{
    key: string;
    result: Result;
  } | null>(null);

  useEffect(() => {
    if (!enabled || !q) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      getSuggestions(q, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted)
            setSettled({ key, result: { status: 'ready', data } });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || error instanceof RequestAbortedError)
            return;
          setSettled({ key, result: { status: 'error', error } });
        });
    }, 300);
    // Huỷ ngay khi từ khoá đổi, không chờ hết debounce của từ khoá tiếp theo.
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, enabled, key]);

  const state =
    !enabled || !q
      ? { status: 'idle' as const }
      : settled?.key === key
        ? settled.result
        : { status: 'loading' as const };
  return { state, retry: () => setAttempt((value) => value + 1) };
}
