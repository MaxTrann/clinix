import { useCallback, useEffect, useState } from 'react';
import { useRemote } from '../../../../shared/hooks/use-remote';
import {
  ADMIN_REVIEW_PAGE_SIZE,
  ADMIN_REVIEW_Q_MAX,
  type AdminReviewCounts,
  type AdminReviewQuery,
  type AdminReviewStatus,
} from '../api/admin-review-types';
import { listAdminReviews } from '../api/exam-api';

// Trạng thái và việc tải của trang "Kiểm duyệt đánh giá" (doctor-exam F7; PLAN 5.13; WKD-03, WKD-14). Bộ lọc và trang chỉ ở BỘ NHỚ của trang (không URL, không kho trình duyệt: `q` là tên và nội dung của người dùng, nếp F11).
// Việc tải là MỘT `useRemote`: huỷ yêu cầu cũ khi khoá đổi, kết quả đến muộn của yêu cầu cũ không ghi đè kết quả mới. Mọi lần đổi bộ lọc ⇒ về trang 1 (đổi trang không đổi bộ lọc).
export const SEARCH_DEBOUNCE_MS = 300;
// Giá trị "Tất cả" của các ô chọn
export const ALL = '';

export interface ReviewFilters {
  q: string;
  chiNhanhId: string;
  bacSiId: string;
  soSao: string;
  trangThai: '' | AdminReviewStatus;
}

export const EMPTY_FILTERS: ReviewFilters = {
  q: '',
  chiNhanhId: ALL,
  bacSiId: ALL,
  soSao: ALL,
  trangThai: ALL,
};

const LONE_HIGH_SURROGATE = /[\uD800-\uDBFF]$/;

// `q` gửi đi: bỏ khoảng trắng đầu cuối, cắt tối đa 100 đơn vị UTF-16 (máy chủ trả 400 nếu dài hơn); cắt giữa cặp thay thế (emoji) thì lùi một đơn vị; rỗng ⇒ `undefined` (như không có `q`, không phải lỗi)
export function normalizeSearch(raw: string): string | undefined {
  let text = raw.trim().slice(0, ADMIN_REVIEW_Q_MAX);
  if (LONE_HIGH_SURROGATE.test(text)) text = text.slice(0, -1);
  text = text.trim();
  return text === '' ? undefined : text;
}

// `isBranchAdmin`: Admin Chi nhánh KHÔNG bao giờ gửi `chiNhanhId` (máy chủ ép chi nhánh được gán; web cũng không hiện ô lọc), kể cả khi state còn giá trị cũ
export function useReviews(isBranchAdmin: boolean) {
  const [filters, setFilters] = useState<ReviewFilters>(EMPTY_FILTERS);
  // `q` đã trì hoãn: gõ tới đâu cũng chỉ gọi máy chủ sau khi ngừng gõ 300 ms
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  // Số đếm của lần tải gần nhất thành công: giữ trong lúc tải lại để chip không nhấp nháy
  const [lastCounts, setLastCounts] = useState<AdminReviewCounts | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedQ(filters.q),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [filters.q]);

  const q = normalizeSearch(debouncedQ);
  const query: AdminReviewQuery = {
    page,
    pageSize: ADMIN_REVIEW_PAGE_SIZE,
    trangThai: filters.trangThai === ALL ? undefined : filters.trangThai,
    soSao: filters.soSao === ALL ? undefined : Number(filters.soSao),
    bacSiId: filters.bacSiId === ALL ? undefined : filters.bacSiId,
    chiNhanhId:
      isBranchAdmin || filters.chiNhanhId === ALL
        ? undefined
        : filters.chiNhanhId,
    q,
  };
  const list = useRemote(
    (signal) => listAdminReviews(query, signal),
    [
      query.page,
      query.trangThai ?? '',
      query.soSao ?? 0,
      query.bacSiId ?? '',
      query.chiNhanhId ?? '',
      q ?? '',
      refresh,
    ],
  );

  const data = list.state.status === 'ready' ? list.state.data : null;
  if (data !== null && data.demTheoTrangThai !== lastCounts) {
    setLastCounts(data.demTheoTrangThai);
  }
  // Trang vượt cuối (dữ liệu vừa ít đi): máy chủ trả `items` rỗng mà `total` còn > 0 ⇒ về trang cuối thay vì hiện "rỗng" sai
  if (data !== null && data.items.length === 0 && data.total > 0) {
    const pageCount = Math.max(1, Math.ceil(data.total / data.pageSize));
    if (page > pageCount) setPage(pageCount);
  }
  // Lỗi thì ẩn chip (số cũ có thể đã lệch); đang tải thì giữ số cũ
  const counts =
    list.state.status === 'error'
      ? null
      : (data?.demTheoTrangThai ?? lastCounts);

  const change = useCallback((patch: Partial<ReviewFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  }, []);
  const reload = useCallback(() => setRefresh((value) => value + 1), []);

  const hasFilters =
    q !== undefined ||
    query.trangThai !== undefined ||
    query.soSao !== undefined ||
    query.bacSiId !== undefined ||
    query.chiNhanhId !== undefined;

  return { filters, change, page, setPage, list, counts, hasFilters, reload };
}
