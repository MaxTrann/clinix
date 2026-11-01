import { useCallback, useEffect, useState } from 'react';
import { RequestAbortedError } from '../../../shared/api/errors';
import { getAdminMe, type AdminMe } from '../admin-me';

export type AdminMeState =
  | { status: 'loading' }
  | { status: 'ready'; value: AdminMe }
  | { status: 'error'; error: unknown };

export function useAdminMe(): {
  state: AdminMeState;
  retry: () => void;
} {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<AdminMeState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    void getAdminMe(controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) setState({ status: 'ready', value });
      },
      (error: unknown) => {
        if (
          controller.signal.aborted ||
          error instanceof RequestAbortedError
        ) {
          return;
        }
        setState({ status: 'error', error });
      },
    );

    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((current) => current + 1);
  }, []);
  return { state, retry };
}
