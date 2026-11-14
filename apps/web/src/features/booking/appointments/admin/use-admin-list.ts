import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useRemote } from '../../../../shared/hooks/use-remote';
import { useAdminScope } from '../../../admin';
import type { AppointmentState } from '../common/appointment-status';
import { isDateRangeValid, type DateRange } from '../common/date-range';
import { useKeywordBox } from '../common/use-keyword-box';
import { useListView } from '../common/use-list-view';
import { getAdminAppointments } from './api/admin-appointments-api';
import {
  hasActiveFilters,
  hasNonDateFilters,
  readFilters,
  writeFilters,
  type AdminFilters,
} from './admin-query-state';

// Hook của trang "Lịch hẹn" của Quản trị viên (booking F10): bộ lọc không cá nhân trên URL (`admin-query-state.ts`), từ khoá `q` ở bộ nhớ, tải bằng `useRemote` và GIỮ DỮ LIỆU CŨ khi đổi
// bộ lọc hay trang (`useListView` của `common/`, dùng chung với Lễ tân). Chỉ ĐỌC (GET). Phạm vi lấy từ `useAdminScope()`: CHỈ Toàn hệ thống có `chiNhanhId`; Chi nhánh thì KHÔNG BAO GIỜ gửi
// `chiNhanhId` (kể cả khi URL có), vì `readFilters` bỏ nó. Đổi bộ lọc thì về trang 1; đặt lại đúng giá trị cũ không đổi URL nên không gọi lại API.
export function useAdminList() {
  const scope = useAdminScope();
  const allowBranch = scope.phamVi === 'ToanHeThong';
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params, allowBranch);
  const [q, setQ] = useState('');

  // Chữ trong hai ô ngày khi đang sai thứ tự (chưa áp dụng): chỉ hiện khi khoảng ĐÃ ÁP DỤNG vẫn là khoảng lúc gõ (đổi URL bằng nút Quay lại thì bỏ), không cần effect
  const appliedKey = `${filters.from}|${filters.to}`;
  const [draft, setDraft] = useState<{ key: string; range: DateRange } | null>(
    null,
  );
  const dateInput: DateRange =
    draft !== null && draft.key === appliedKey
      ? draft.range
      : { from: filters.from, to: filters.to };

  // Ghi bộ lọc mới lên URL (`replace`: không đẩy một mục lịch sử cho mỗi lần đổi). `patch.page` vắng ⇒ về trang 1. Không có gì đổi ⇒ giữ nguyên URL.
  const update = useCallback(
    (patch: Partial<AdminFilters>) => {
      setParams(
        (previous) => {
          const current = readFilters(previous, allowBranch);
          const next = { ...current, ...patch, page: patch.page ?? 1 };
          const written = writeFilters(next);
          return written.toString() === writeFilters(current).toString()
            ? previous
            : written;
        },
        { replace: true },
      );
    },
    [allowBranch, setParams],
  );

  const { state: remote, retry } = useRemote(
    (signal) =>
      getAdminAppointments(
        {
          page: filters.page,
          trangThai: filters.status ?? undefined,
          chiNhanhId: filters.branch,
          chuyenKhoaId: filters.specialty,
          bacSiId: filters.doctor,
          dichVuKhamId: filters.service,
          tuNgay: filters.from,
          denNgay: filters.to,
          q,
        },
        signal,
      ),
    [
      filters.page,
      filters.status ?? '',
      filters.branch,
      filters.specialty,
      filters.doctor,
      filters.service,
      filters.from,
      filters.to,
      q,
    ],
  );

  const setPage = useCallback(
    (value: number) => update({ page: value }),
    [update],
  );
  const view = useListView(remote, filters.page, setPage);

  // Từ khoá đã áp dụng đổi thì về trang 1 (URL bỏ `page`); `update({})` giữ nguyên các bộ lọc khác
  const applyKeyword = useCallback(
    (value: string) => {
      setQ(value);
      update({});
    },
    [update],
  );
  const keyword = useKeywordBox({
    applied: q,
    apply: applyKeyword,
    refresh: retry,
  });
  const clearKeywordInput = keyword.clear;

  const clearFilters = useCallback(() => {
    setParams(new URLSearchParams(), { replace: true });
    setQ('');
    setDraft(null);
    clearKeywordInput();
  }, [setParams, clearKeywordInput]);

  const setDate = (which: 'from' | 'to', value: string) => {
    const next = { ...dateInput, [which]: value };
    if (isDateRangeValid(next)) {
      setDraft(null);
      update({ from: next.from, to: next.to });
    } else {
      setDraft({ key: appliedKey, range: next });
    }
  };

  const search = params.toString();
  return {
    view,
    retry,
    allowBranch,
    branchName: scope.phamVi === 'ChiNhanh' ? scope.chiNhanh.ten : '',
    filters,
    page: filters.page,
    fromDate: dateInput.from,
    toDate: dateInput.to,
    dateOrderInvalid: !isDateRangeValid(dateInput),
    filtersActive: hasActiveFilters(filters, q),
    nonDateFilters: hasNonDateFilters(filters, q),
    // Chuỗi `search` hiện tại của danh sách (không có `q`): trang chi tiết dùng để khôi phục bộ lọc khi `Quay lại danh sách`
    listSearch: search === '' ? '' : `?${search}`,
    keyword,
    setStatus: (value: AppointmentState | null) => update({ status: value }),
    setBranch: (value: string) => update({ branch: value }),
    setSpecialty: (value: string) => update({ specialty: value }),
    setDoctor: (value: string) => update({ doctor: value }),
    setService: (value: string) => update({ service: value }),
    setFromDate: (value: string) => setDate('from', value),
    setToDate: (value: string) => setDate('to', value),
    setPage,
    clearFilters,
  };
}

export type AdminListController = ReturnType<typeof useAdminList>;
