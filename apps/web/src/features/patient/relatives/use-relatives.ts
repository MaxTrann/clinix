import { useCallback, useEffect, useRef, useState } from 'react';
import { RequestAbortedError } from '../../../shared/api/errors';
import { sortRelatives } from './relative-rules';
import { getRelatives } from './relatives-service';
import type { Relative } from './relatives-types';

export type RelativesLoad =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | {
      status: 'ready';
      items: Relative[];
      // Lần tải lại nền (`refresh`) gần nhất thất bại: danh sách cũ vẫn giữ, khối hiện câu lỗi kèm "Thử lại"
      refreshError: { error: unknown } | null;
    };

type Settled = {
  attempt: number;
  load: Exclude<RelativesLoad, { status: 'loading' }>;
};

// Chờ một lần tải. Kết quả (hoặc lỗi) chỉ được dùng khi `isStale()` là false; lỗi do chính ta huỷ (gỡ trang, đăng xuất) không phải lỗi
// để báo cho người dùng. Dùng chung cho lần tải đầu (huỷ bằng AbortController) và `refresh` (bỏ kết quả bằng số lần gọi).
function track(
  load: Promise<Relative[]>,
  isStale: () => boolean,
  onReady: (items: Relative[]) => void,
  onError: (error: unknown) => void,
) {
  load.then(
    (items) => {
      if (!isStale()) onReady(items);
    },
    (error: unknown) => {
      if (!isStale() && !(error instanceof RequestAbortedError)) onError(error);
    },
  );
}

// Tải danh sách khi khối mở (và mỗi lần bấm "Thử lại" sau lỗi tải đầu); huỷ khi gỡ trang để kết quả muộn không cập nhật trang đã gỡ.
// Trạng thái "đang tải" suy ra từ số lần gọi (`attempt`) như `use-profile.ts`. Khối tải độc lập và song song với khối Bản thân (TRACKING F6-C).
export function useRelatives(): {
  state: RelativesLoad;
  retry: () => void;
  refresh: () => void;
  upsert: (relative: Relative) => void;
} {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);
  // Mỗi `refresh` và mỗi `upsert` tăng số này; kết quả `refresh` chỉ được dùng nếu số vẫn là của chính nó
  const generation = useRef(0);
  // Chỉ để bỏ kết quả của `refresh` sau khi gỡ trang (tải đầu đã có AbortController)
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    track(
      getRelatives(controller.signal),
      () => controller.signal.aborted,
      (items) =>
        setSettled({
          attempt,
          load: { status: 'ready', items, refreshError: null },
        }),
      (error) => setSettled({ attempt, load: { status: 'error', error } }),
    );
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // Tải lại nền: GIỮ danh sách và mọi form đang mở (không về "đang tải"). Thành công thì thay `items`; thất bại thì giữ danh sách cũ.
  const refresh = useCallback(() => {
    generation.current += 1;
    const mine = generation.current;
    setSettled((current) =>
      current?.load.status === 'ready'
        ? { ...current, load: { ...current.load, refreshError: null } }
        : current,
    );
    track(
      getRelatives(),
      () => !mounted.current || generation.current !== mine,
      (items) =>
        setSettled((current) =>
          current?.load.status === 'ready'
            ? {
                ...current,
                load: { status: 'ready', items, refreshError: null },
              }
            : current,
        ),
      (error) =>
        setSettled((current) =>
          current?.load.status === 'ready'
            ? { ...current, load: { ...current.load, refreshError: { error } } }
            : current,
        ),
    );
  }, []);

  // Chèn hoặc thay hồ sơ theo `hoSoNguoiThanId` (phản hồi của POST, PUT), rồi sắp lại; chỉ có tác dụng khi danh sách đã tải xong.
  // Huỷ kết quả của `refresh` đang bay: một GET cũ về muộn không được xoá hồ sơ vừa lưu.
  const upsert = useCallback((relative: Relative) => {
    generation.current += 1;
    setSettled((current) =>
      current?.load.status === 'ready'
        ? {
            ...current,
            load: {
              ...current.load,
              items: sortRelatives([
                ...current.load.items.filter(
                  (item) => item.hoSoNguoiThanId !== relative.hoSoNguoiThanId,
                ),
                relative,
              ]),
            },
          }
        : current,
    );
  }, []);

  const state: RelativesLoad =
    settled !== null && settled.attempt === attempt
      ? settled.load
      : { status: 'loading' };
  return { state, retry, refresh, upsert };
}
