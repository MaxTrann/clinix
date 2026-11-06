import { useCallback, useEffect, useState } from 'react';
import { RequestAbortedError } from '../../../shared/api/errors';
import { getProfile } from './profile-service';
import type { Profile } from './profile-types';

export type ProfileLoad =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; profile: Profile };

type Settled = {
  attempt: number;
  load: Exclude<ProfileLoad, { status: 'loading' }>;
};

// Tải hồ sơ khi trang mở (và mỗi lần bấm "Thử lại"); huỷ khi gỡ trang để kết quả muộn không cập nhật trang đã gỡ.
// Trạng thái "đang tải" suy ra từ số lần gọi (`attempt`) thay vì setState trong effect, như features/search/specialties/use-remote.ts.
export function useProfile(): {
  state: ProfileLoad;
  retry: () => void;
  replace: (profile: Profile) => void;
} {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getProfile(controller.signal).then(
      (profile) => {
        if (controller.signal.aborted) return;
        setSettled({ attempt, load: { status: 'ready', profile } });
      },
      (error: unknown) => {
        // Gỡ trang hoặc đăng xuất (client huỷ) không phải lỗi để báo cho người dùng
        if (controller.signal.aborted || error instanceof RequestAbortedError) {
          return;
        }
        setSettled({ attempt, load: { status: 'error', error } });
      },
    );
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  // Ghi hồ sơ lấy từ phản hồi PUT vào trạng thái, không gọi lại GET
  const replace = useCallback(
    (profile: Profile) =>
      setSettled({ attempt, load: { status: 'ready', profile } }),
    [attempt],
  );

  const state: ProfileLoad =
    settled !== null && settled.attempt === attempt
      ? settled.load
      : { status: 'loading' };
  return { state, retry, replace };
}
