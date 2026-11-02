import { useCallback, useEffect, useState } from 'react';
import { RequestAbortedError } from '../../../shared/api/errors';
import { listServices } from './service-catalog-service';
import type { ServiceCatalogItem } from './service-catalog-types';
import type { CatalogListState } from './use-service-groups';

export function useServices(
  page: number,
  query: string,
): { state: CatalogListState<ServiceCatalogItem>; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${page}|${query}|${attempt}`;
  const [result, setResult] = useState<{
    key: string;
    state: CatalogListState<ServiceCatalogItem>;
  }>({
    key: '',
    state: { status: 'loading' },
  });

  useEffect(() => {
    const controller = new AbortController();
    void listServices(
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
