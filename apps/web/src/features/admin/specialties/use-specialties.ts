import { useCallback, useEffect, useState } from 'react';
import { RequestAbortedError } from '../../../shared/api/errors';
import { listSpecialties } from './specialty-service';
import type {
  PagedSpecialties,
  SpecialtyStatus,
} from './specialty-types';

export type SpecialtyListState =
  | { status: 'loading' }
  | { status: 'success'; data: PagedSpecialties }
  | { status: 'error'; error: unknown };

export function useSpecialties(
  page: number,
  q: string,
  status: SpecialtyStatus | undefined,
) {
  const [state, setState] = useState<SpecialtyListState>({
    status: 'loading',
  });
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => {
        setState({ status: 'loading' });
        void listSpecialties(
          { page, pageSize: 20, q: q || undefined, trangThaiHoatDong: status },
          controller.signal,
        ).then(
          (data) => setState({ status: 'success', data }),
          (error: unknown) => {
            if (
              controller.signal.aborted ||
              error instanceof RequestAbortedError
            )
              return;
            setState({ status: 'error', error });
          },
        );
      },
      q ? 250 : 0,
    );

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [page, q, status, revision]);

  return { state, retry };
}
