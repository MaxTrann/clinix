import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useRemote } from '../../../shared/hooks/use-remote';
import { useArticleApi } from '../api/article-api-context';
import {
  hasPublicFilters,
  normalizeKeyword,
  readPublicFilters,
  writePublicFilters,
  type PublicListFilters,
} from './article-public-query';

export const SEARCH_DEBOUNCE_MS = 250;

// Trạng thái và việc tải của danh sách công khai (PLAN article 5.12, ABG-03). URL là NGUỒN DUY NHẤT của bộ lọc và trang; việc tải là MỘT `useRemote`
// (huỷ yêu cầu cũ khi khoá đổi, kết quả đến muộn không đè kết quả mới). Chỉ ô tìm giữ chữ đang gõ ở bộ nhớ rồi ghi lên URL sau 250 ms yên.
// KHÔNG đọc chi nhánh đang chọn: bài viết không có cột chi nhánh nên đổi chi nhánh không được gọi lại danh sách (ABG-12).
export function usePublicArticleList() {
  const api = useArticleApi();
  const [params, setParams] = useSearchParams();
  const filters = readPublicFilters(params);

  // Ghi bộ lọc mới lên URL (`replace`: không đẩy một mục lịch sử cho mỗi lần đổi). Không nêu `trang` ⇒ về trang 1. Không có gì đổi ⇒ giữ nguyên URL.
  const update = useCallback(
    (patch: Partial<PublicListFilters>) => {
      setParams(
        (previous) => {
          const current = readPublicFilters(previous);
          const written = writePublicFilters({
            ...current,
            ...patch,
            trang: patch.trang ?? 1,
          });
          return written.toString() === writePublicFilters(current).toString()
            ? previous
            : written;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // `q` và `the` chỉ có mặt khi có giá trị: `the=` rỗng bị máy chủ từ chối (400 `BO_LOC_KHONG_HOP_LE`)
  const { state, retry } = useRemote(
    (signal) =>
      api.listPublic(
        {
          q: filters.q === '' ? undefined : filters.q,
          the: filters.the === '' ? undefined : filters.the,
          page: filters.trang,
        },
        signal,
      ),
    [filters.q, filters.the, filters.trang],
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

  // Trang vượt cuối (dữ liệu vừa ít đi): máy chủ trả `items` rỗng mà `total` còn > 0 ⇒ chuyển về trang cuối thay vì hiện "rỗng" sai
  const data = state.status === 'ready' ? state.data : null;
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

  // "Xoá bộ lọc": bỏ `q`, `the` và trang; xoá cả chữ đang gõ (kể cả khoảng trắng mà URL không có)
  const clear = useCallback(() => {
    setText('');
    update({ q: '', the: '' });
  }, [update]);

  return {
    filters,
    update,
    clear,
    state,
    retry,
    hasFilters: hasPublicFilters(filters),
    search: { value: text, onChange: setText },
  };
}
