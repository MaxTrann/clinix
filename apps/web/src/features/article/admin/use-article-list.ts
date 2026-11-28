import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useRemote } from '../../../shared/hooks/use-remote';
import { useArticleApi } from '../api/article-api-context';
import type { ArticleStatusCounts } from '../api/article-types';
import {
  hasActiveFilters,
  normalizeKeyword,
  readListFilters,
  writeListFilters,
  type ArticleListFilters,
} from './article-list-query';

export const SEARCH_DEBOUNCE_MS = 250;

// Trạng thái và việc tải của danh sách quản trị (PLAN article 5.11, T22). URL là NGUỒN DUY NHẤT của bộ lọc và trang; việc tải là MỘT `useRemote`
// (huỷ yêu cầu cũ khi khoá đổi, kết quả đến muộn không đè kết quả mới). Chỉ ô tìm giữ chữ đang gõ ở bộ nhớ rồi ghi lên URL sau 250 ms yên.
export function useArticleList() {
  const api = useArticleApi();
  const [params, setParams] = useSearchParams();
  const filters = readListFilters(params);

  // Ghi bộ lọc mới lên URL (`replace`: không đẩy một mục lịch sử cho mỗi lần đổi). Không nêu `trang` ⇒ về trang 1. Không có gì đổi ⇒ giữ nguyên URL.
  const update = useCallback(
    (patch: Partial<ArticleListFilters>) => {
      setParams(
        (previous) => {
          const current = readListFilters(previous);
          const written = writeListFilters({
            ...current,
            ...patch,
            trang: patch.trang ?? 1,
          });
          return written.toString() === writeListFilters(current).toString()
            ? previous
            : written;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const { state, retry } = useRemote(
    (signal) =>
      api.list(
        {
          q: filters.q === '' ? undefined : filters.q,
          trangThai: filters.trangThai ?? undefined,
          the: filters.the === '' ? undefined : filters.the,
          page: filters.trang,
        },
        signal,
      ),
    [filters.q, filters.trangThai ?? '', filters.the, filters.trang],
  );

  // Ô tìm: giữ chữ đang gõ (kể cả khoảng trắng cuối). URL đổi từ ngoài (nút Quay lại) thì lấy lại giá trị của URL; chữ gõ cùng nghĩa với URL thì để yên.
  const [text, setText] = useState(filters.q);
  const [syncedQ, setSyncedQ] = useState(filters.q);
  if (filters.q !== syncedQ) {
    setSyncedQ(filters.q);
    if (normalizeKeyword(text) !== filters.q) setText(filters.q);
  }
  useEffect(() => {
    const next = normalizeKeyword(text);
    if (next === filters.q) return;
    const timer = window.setTimeout(
      () => update({ q: next }),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [text, filters.q, update]);

  const data = state.status === 'ready' ? state.data : null;

  // Số đếm của lần tải gần nhất thành công: giữ trong lúc tải lại để chip không nhấp nháy; lỗi thì ẩn (số cũ có thể đã lệch)
  const [lastCounts, setLastCounts] = useState<ArticleStatusCounts | null>(
    null,
  );
  if (data !== null && data.demTheoTrangThai !== lastCounts) {
    setLastCounts(data.demTheoTrangThai);
  }
  const counts =
    state.status === 'error' ? null : (data?.demTheoTrangThai ?? lastCounts);

  // Trang vượt cuối (dữ liệu vừa ít đi): máy chủ trả `items` rỗng mà `total` còn > 0 ⇒ chuyển về trang cuối thay vì hiện "rỗng" sai
  const lastPage =
    data === null
      ? 1
      : Math.max(1, Math.ceil(data.total / Math.max(1, data.pageSize)));
  const beyondEnd =
    data !== null &&
    data.items.length === 0 &&
    data.total > 0 &&
    filters.trang > lastPage;
  useEffect(() => {
    if (beyondEnd) update({ trang: lastPage });
  }, [beyondEnd, lastPage, update]);

  return {
    filters,
    update,
    state,
    retry,
    counts,
    hasFilters: hasActiveFilters(filters),
    search: { value: text, onChange: setText },
  };
}
