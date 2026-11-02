import { useCallback, useEffect, useState } from 'react';
import { RequestAbortedError } from '../../../shared/api/errors';
import { listServiceGroups } from './service-catalog-service';
import type { PagedResult, ServiceGroup } from './service-catalog-types';

export type CatalogListState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'success'; data: PagedResult<T> };

export function useServiceGroups(
  page: number,
  pageSize: number,
  query: string,
): { state: CatalogListState<ServiceGroup>; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${page}|${pageSize}|${query}|${attempt}`;
  const [result, setResult] = useState<{
    key: string;
    state: CatalogListState<ServiceGroup>;
  }>({
    key: '',
    state: { status: 'loading' },
  });

  useEffect(() => {
    const controller = new AbortController();
    void listServiceGroups(
      { page, pageSize, q: query || undefined },
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
  }, [attempt, page, pageSize, query, requestKey]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return {
    state:
      result.key === requestKey ? result.state : { status: 'loading' as const },
    retry,
  };
}
