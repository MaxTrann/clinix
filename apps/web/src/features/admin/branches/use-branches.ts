import { useCallback, useEffect, useState } from 'react';
import { RequestAbortedError } from '../../../shared/api/errors';
import { listBranches, listAllAvailableServices } from './branch-service';
import type { Branch, BranchServiceOption, PagedResult } from './branch-types';

export type BranchListState =
  | { status: 'loading' }
  | { status: 'success'; data: PagedResult<Branch> }
  | { status: 'error'; error: unknown };

export function useBranches(
  page: number,
  query: string,
): { state: BranchListState; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${page}|${query}|${attempt}`;
  const [result, setResult] = useState<{
    key: string;
    state: BranchListState;
  }>({ key: '', state: { status: 'loading' } });

  useEffect(() => {
    const controller = new AbortController();
    void listBranches(
      { page, pageSize: 20, q: query || undefined },
      controller.signal,
    ).then(
      (data) => {
        if (!controller.signal.aborted)
          setResult({ key: requestKey, state: { status: 'success', data } });
      },
      (error: unknown) => {
        if (controller.signal.aborted || error instanceof RequestAbortedError)
          return;
        setResult({ key: requestKey, state: { status: 'error', error } });
      },
    );
    return () => controller.abort();
  }, [attempt, page, query, requestKey]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return {
    state:
      result.key === requestKey ? result.state : { status: 'loading' as const },
    retry,
  };
}

export type AvailableServicesState =
  | { status: 'loading' }
  | { status: 'success'; data: BranchServiceOption[] }
  | { status: 'error'; error: unknown };

export function useAvailableServices(): {
  state: AvailableServicesState;
  retry: () => void;
} {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    attempt: number;
    state: AvailableServicesState;
  }>({ attempt: -1, state: { status: 'loading' } });

  useEffect(() => {
    const controller = new AbortController();
    void listAllAvailableServices(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted)
          setResult({ attempt, state: { status: 'success', data } });
      },
      (error: unknown) => {
        if (controller.signal.aborted || error instanceof RequestAbortedError)
          return;
        setResult({ attempt, state: { status: 'error', error } });
      },
    );
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return {
    state:
      result.attempt === attempt
        ? result.state
        : { status: 'loading' as const },
    retry,
  };
}
