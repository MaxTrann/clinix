import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useRemote } from '../../../../shared/hooks/use-remote';
import { todayVn } from '../../../../shared/schedule/week';
import type { AppointmentState } from '../common/appointment-status';
import { isDateRangeValid, type DateRange } from '../common/date-range';
import { useKeywordBox } from '../common/use-keyword-box';
import { useListView } from '../common/use-list-view';
import { getReceptionAppointments } from './api/reception-appointments-api';
import { presetRange, type DatePreset } from './date-presets';
import {
  hasActiveFilters,
  hasNonDateFilters,
  readFilters,
  writeFilters,
  type ReceptionFilters,
} from './reception-query-state';

// Hook của trang "Quản lý lịch hẹn" của Lễ tân (booking F8; F12b đưa bộ lọc KHÔNG cá nhân lên URL như `use-admin-list.ts` của F10): chip ngày, trạng thái, chuyên khoa, bác sĩ, khoảng ngày và
// trang nằm trên URL (`reception-query-state.ts`), từ khoá `q` ở bộ nhớ; tải bằng `useRemote` và GIỮ DỮ LIỆU CŨ khi đổi bộ lọc hay trang (`useListView` của `common/`). Chỉ ĐỌC (GET).
// Đổi bộ lọc thì về trang 1; đặt lại đúng giá trị cũ không đổi URL nên không gọi lại API (bấm lại chip đang chọn không làm gì).
export function useReceptionList() {
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const [q, setQ] = useState('');

  // Chữ trong hai ô ngày khi đang sai thứ tự (chưa áp dụng): chỉ hiện khi bộ lọc ĐÃ ÁP DỤNG vẫn là lúc gõ (đổi URL bằng nút Quay lại thì bỏ), không cần effect
  const appliedKey = `${filters.preset}|${filters.from}|${filters.to}`;
  const [draft, setDraft] = useState<{ key: string; range: DateRange } | null>(
    null,
  );
  const dateInput: DateRange =
    draft !== null && draft.key === appliedKey
      ? draft.range
      : { from: filters.from, to: filters.to };

  // Ghi bộ lọc mới lên URL (`replace`: không đẩy một mục lịch sử cho mỗi lần đổi). `patch.page` vắng ⇒ về trang 1. Không có gì đổi ⇒ giữ nguyên URL.
  const update = useCallback(
    (patch: Partial<ReceptionFilters>) => {
      setParams(
        (previous) => {
          const current = readFilters(previous);
          const next = { ...current, ...patch, page: patch.page ?? 1 };
          const written = writeFilters(next);
          return written.toString() === writeFilters(current).toString()
            ? previous
            : written;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // Ngày của chip tính MỖI LẦN vẽ từ đồng hồ máy theo giờ Việt Nam (`todayVn`): qua nửa đêm mà trang còn mở thì lần vẽ kế tiếp tự sang ngày mới, không có hẹn giờ riêng.
  // Đồng hồ máy khách là nguồn duy nhất (phản hồi danh sách không có giờ máy chủ): TECH_DEBT.
  const range = presetRange(filters.preset, todayVn(), {
    from: filters.from,
    to: filters.to,
  });

  const { state: remote, retry } = useRemote(
    (signal) =>
      getReceptionAppointments(
        {
          page: filters.page,
          trangThai: filters.status ?? undefined,
          chuyenKhoaId: filters.specialty,
          bacSiId: filters.doctor,
          tuNgay: range.from,
          denNgay: range.to,
          q,
        },
        signal,
      ),
    [
      filters.page,
      filters.status ?? '',
      filters.specialty,
      filters.doctor,
      range.from,
      range.to,
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
    [setQ, update],
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
  }, [setParams, setQ, setDraft, clearKeywordInput]);

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
    page: filters.page,
    preset: filters.preset,
    status: filters.status,
    doctor: filters.doctor,
    specialty: filters.specialty,
    fromDate: dateInput.from,
    toDate: dateInput.to,
    dateOrderInvalid: !isDateRangeValid(dateInput),
    filtersActive: hasActiveFilters(filters, q),
    nonDateFilters: hasNonDateFilters(filters, q),
    // Chuỗi `search` hiện tại của danh sách (không có `q`): trang chi tiết dùng để khôi phục bộ lọc khi `Quay lại danh sách`
    listSearch: search === '' ? '' : `?${search}`,
    keyword,
    // Bấm lại chip đang chọn không làm gì (không về trang 1, không xoá khoảng ngày đã áp dụng). Đổi chip bỏ chữ đang gõ dở ở hai ô ngày; sang `range` thì khoảng ngày bắt đầu trống (mọi ngày), như F8
    setPreset: (value: DatePreset) => {
      if (value === filters.preset) return;
      setDraft(null);
      update({ preset: value, from: '', to: '' });
    },
    setStatus: (value: AppointmentState | null) => update({ status: value }),
    setDoctor: (value: string) => update({ doctor: value }),
    setSpecialty: (value: string) => update({ specialty: value }),
    setFromDate: (value: string) => setDate('from', value),
    setToDate: (value: string) => setDate('to', value),
    setPage,
    clearFilters,
  };
}

export type ReceptionListController = ReturnType<typeof useReceptionList>;
