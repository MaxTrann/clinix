import { useCallback, useEffect, useState } from 'react';
import { RequestAbortedError } from '../../../shared/api/errors';
import { getClinicInfo } from './clinic-info-service';
import type { ClinicInfo } from './clinic-info-types';

export type ClinicInfoState =
  | { status: 'loading' }
  | { status: 'success'; data: ClinicInfo }
  | { status: 'error'; error: unknown };

export function useClinicInfo() {
  const [state, setState] = useState<ClinicInfoState>({
    status: 'loading',
  });
  const [revision, setRevision] = useState(0);
  const retry = useCallback(
    () => setRevision((value) => value + 1),
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setState({ status: 'loading' });
      void getClinicInfo(controller.signal).then(
        (data) => setState({ status: 'success', data }),
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
    }, 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [revision]);

  return { state, retry };
}
