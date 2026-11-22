import { useCallback, useEffect, useRef, useState } from 'react';
import { RequestAbortedError } from '../../../../shared/api/errors';
import { getSystemConfig } from '../../system-config/system-config-service';
import type { PagedResult } from '../branch-types';
import { getChangeRequest, listChangeRequests } from './change-request-service';
import type {
  ChangeRequestDetail,
  ChangeRequestListItem,
  ChangeRequestStatus,
} from './change-request-types';

// Hook tải dữ liệu cho màn yêu cầu thay đổi chi nhánh (admin F6b). Cùng khuôn với `use-branches.ts`: mỗi lần tải gắn một `key`,
// kết quả của lần tải cũ (đổi tab, đổi trang, tải lại) bị bỏ qua, và lời gọi bị hủy khi component rời màn hình.

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: unknown };

/** `key` đổi ⇒ tải lại. `load` có thể đổi tham chiếu mỗi lần render nên đọc qua ref, không đưa vào phụ thuộc của effect. */
export function useLoad<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
): { state: LoadState<T>; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${key}|${attempt}`;
  const loadRef = useRef(load);
  // Cập nhật ref trong effect (không gán lúc render); effect này khai báo trước nên chạy trước effect tải bên dưới
  useEffect(() => {
    loadRef.current = load;
  });
  const [result, setResult] = useState<{ key: string; state: LoadState<T> }>({
    key: '',
    state: { status: 'loading' },
  });

  useEffect(() => {
    const controller = new AbortController();
    void loadRef.current(controller.signal).then(
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
  }, [requestKey]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return {
    state: result.key === requestKey ? result.state : { status: 'loading' },
    retry,
  };
}

/**
 * Các tab của khối yêu cầu: ba tab của Figma 542:2 và hai tab [đề xuất] cho yêu cầu đã rút, đã hủy (Q3, Q47; chưa có frame, D7).
 * Yêu cầu quá hạn vẫn là `DaDuyet` (Q48) nên nằm ở tab Đã duyệt, kèm nhãn và banner riêng.
 */
export const REQUEST_TABS = [
  'ChoDuyet',
  'DaDuyet',
  'TuChoi',
  'DaRut',
  'DaHuy',
] as const;
export type RequestTab = (typeof REQUEST_TABS)[number];

export function useChangeRequestList(
  trangThai: ChangeRequestStatus,
  page: number,
  refreshKey: number,
): {
  state: LoadState<PagedResult<ChangeRequestListItem>>;
  retry: () => void;
} {
  return useLoad(`${trangThai}|${page}|${refreshKey}`, (signal) =>
    listChangeRequests({ trangThai, page }, signal),
  );
}

export interface TabCounts {
  counts: Record<RequestTab, number>;
  /** Có yêu cầu quá hạn chờ xử lý trong trang đầu của tab Đã duyệt (danh sách xếp mới nhất trước, 20 dòng) */
  coQuaHan: boolean;
}

/** Số yêu cầu của từng tab (số trong ngoặc ở tab, Figma 542:2): lấy `total` của trang đầu mỗi trạng thái. */
export function useTabCounts(refreshKey: number): LoadState<TabCounts> {
  return useLoad(`counts|${refreshKey}`, async (signal) => {
    const pages = await Promise.all(
      REQUEST_TABS.map((trangThai) =>
        listChangeRequests({ trangThai, page: 1 }, signal),
      ),
    );
    const counts = Object.fromEntries(
      REQUEST_TABS.map((tab, index) => [tab, pages[index]?.total ?? 0]),
    ) as Record<RequestTab, number>;
    const approved = pages[REQUEST_TABS.indexOf('DaDuyet')]?.items ?? [];
    return {
      counts,
      coQuaHan: approved.some(
        (item) => item.quaHanLuc !== null && item.apDungLuc === null,
      ),
    };
  }).state;
}

export function useChangeRequestDetail(
  id: string,
  refreshKey: number,
): { state: LoadState<ChangeRequestDetail>; retry: () => void } {
  return useLoad(`${id}|${refreshKey}`, (signal) =>
    getChangeRequest(id, signal),
  );
}

/**
 * Số ngày báo trước khi đổi giờ làm (cấu hình hệ thống). Chỉ Admin Toàn hệ thống đọc được cấu hình (Admin Chi nhánh nhận 403),
 * nên `enabled = false` thì không gọi API. `null` = chưa cấu hình ⇒ banner "Chưa cấu hình số ngày báo trước" (Figma 542:2).
 */
export function useNoticeDays(
  enabled: boolean,
  refreshKey: number,
): LoadState<number | null> | null {
  const { state } = useLoad(
    `config|${String(enabled)}|${refreshKey}`,
    (signal) =>
      enabled
        ? getSystemConfig(signal).then((config) => {
            const value = config.soNgayBaoTruocDoiGioLam;
            return !config.chuaCauHinh && typeof value === 'number'
              ? value
              : null;
          })
        : Promise.resolve(null),
  );
  return enabled ? state : null;
}
