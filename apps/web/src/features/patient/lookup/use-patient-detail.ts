import { useCallback, useEffect, useRef, useState } from 'react';
import { RequestAbortedError } from '../../../shared/api/errors';
import { getPatientDetail } from './lookup-service';
import type { PatientDetail } from './lookup-types';

// Hook tải hồ sơ một bệnh nhân (patient F8; TRACKING F8-G). Chưa chọn (`id` là null) thì KHÔNG gọi API. Chọn người khác thì huỷ yêu cầu cũ
// (`AbortController`) và dùng số thứ tự lời gọi như `use-patient-search.ts`, để hồ sơ cũ về muộn không đè hồ sơ mới. Không tự thử lại.
export type DetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; data: PatientDetail };

interface Settled {
  id: string;
  attempt: number;
  load: Exclude<DetailState, { status: 'idle' } | { status: 'loading' }>;
}

export function usePatientDetail(id: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (id === null) return;
    const controller = new AbortController();
    seq.current += 1;
    const mine = seq.current;
    getPatientDetail(id, controller.signal).then(
      (data) => {
        if (seq.current !== mine) return;
        setSettled({ id, attempt, load: { status: 'ready', data } });
      },
      (error: unknown) => {
        if (seq.current !== mine || error instanceof RequestAbortedError)
          return;
        setSettled({ id, attempt, load: { status: 'error', error } });
      },
    );
    return () => {
      controller.abort();
      seq.current += 1;
    };
  }, [id, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const state: DetailState =
    id === null
      ? { status: 'idle' }
      : settled !== null && settled.id === id && settled.attempt === attempt
        ? settled.load
        : { status: 'loading' };
  return { state, retry };
}
