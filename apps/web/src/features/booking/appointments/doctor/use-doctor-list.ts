import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useRemote } from '../../../../shared/hooks/use-remote';
import { todayVn } from '../../../../shared/schedule/week';
import type { AppointmentState } from '../common/appointment-status';
import { presetRange, type DatePreset } from '../common/date-presets';
import { isDateRangeValid, type DateRange } from '../common/date-range';
import { useKeywordBox } from '../common/use-keyword-box';
import { useListView } from '../common/use-list-view';
import { getDoctorAppointments } from './api/doctor-appointments-api';
import type { ShiftCode, SortOrder } from './api/doctor-appointment-types';
import {
  hasActiveFilters,
  hasNonDateFilters,
  readFilters,
  writeFilters,
  type DoctorFilters,
} from './doctor-query-state';

// Hook của trang "Lịch hẹn" của Bác sĩ (booking F11): bộ lọc không cá nhân trên URL (`doctor-query-state.ts`), từ khoá `q` ở bộ nhớ, tải bằng `useRemote` và GIỮ DỮ LIỆU CŨ khi đổi bộ lọc hay trang
// (`useListView` của `common/`, dùng chung với ba trang danh sách khác). Chỉ ĐỌC (GET). Phạm vi là chính bác sĩ (backend lấy từ token): KHÔNG BAO GIỜ gửi `bacSiId`, `chiNhanhId`. Đổi bộ lọc thì về trang 1;
// đặt lại đúng giá trị cũ không đổi URL nên không gọi lại API.
export function useDoctorList() {
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const [q, setQ] = useState('');

  // Ngày của chip tính MỖI LẦN vẽ từ đồng hồ máy theo giờ Việt Nam (`todayVn`): qua nửa đêm mà trang còn mở thì lần vẽ kế tiếp tự sang ngày mới, không có hẹn giờ riêng. Đồng hồ máy khách là nguồn
  // duy nhất (phản hồi danh sách không có giờ máy chủ): TECH_DEBT 114 đã ghi cho Lễ tân, F11 thêm Bác sĩ.
  const range = presetRange(filters.preset, todayVn(), {
    from: filters.from,
    to: filters.to,
  });

  // Chữ trong hai ô ngày khi đang sai thứ tự (chưa áp dụng): chỉ hiện khi khoảng ĐÃ ÁP DỤNG vẫn là khoảng lúc gõ (đổi URL bằng nút Quay lại thì bỏ), không cần effect
  const appliedKey = `${filters.preset}|${range.from}|${range.to}`;
  const [draft, setDraft] = useState<{ key: string; range: DateRange } | null>(
    null,
  );
  const dateInput: DateRange =
    draft !== null && draft.key === appliedKey ? draft.range : range;

  // Ghi bộ lọc mới lên URL (`replace`: không đẩy một mục lịch sử cho mỗi lần đổi). `patch.page` vắng ⇒ về trang 1. Không có gì đổi ⇒ giữ nguyên URL.
  const update = useCallback(
    (patch: Partial<DoctorFilters>) => {
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

  const { state: remote, retry } = useRemote(
    (signal) =>
      getDoctorAppointments(
        {
          page: filters.page,
          trangThai: filters.status ?? undefined,
          ca: filters.shift ?? undefined,
          tuNgay: range.from,
          denNgay: range.to,
          q,
          // `MoiNhat` là mặc định của máy chủ: không gửi
          sapXep: filters.sort === 'CuNhat' ? 'CuNhat' : undefined,
        },
        signal,
      ),
    [
      filters.page,
      filters.status ?? '',
      filters.shift ?? '',
      filters.sort,
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
    [update, setQ],
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

  // Chip `Tùy chọn` giữ khoảng đang hiện (kết quả không đổi, người dùng sửa tiếp); chip khác tính ngày từ hôm nay
  const setPreset = (preset: DatePreset) => {
    setDraft(null);
    if (preset === 'range') {
      update({ preset, from: range.from, to: range.to });
    } else {
      update({ preset, from: '', to: '' });
    }
  };

  // Sửa một ô ngày đưa về `Tùy chọn` với đầu kia là ngày đang hiện; sai thứ tự thì chỉ giữ chữ đang gõ và KHÔNG gọi API
  const setDate = (which: 'from' | 'to', value: string) => {
    const next = { ...dateInput, [which]: value };
    if (isDateRangeValid(next)) {
      setDraft(null);
      update({ preset: 'range', from: next.from, to: next.to });
    } else {
      setDraft({ key: appliedKey, range: next });
    }
  };

  const search = params.toString();
  return {
    view,
    retry,
    filters,
    page: filters.page,
    preset: filters.preset,
    fromDate: dateInput.from,
    toDate: dateInput.to,
    dateOrderInvalid: !isDateRangeValid(dateInput),
    filtersActive: hasActiveFilters(filters, q),
    nonDateFilters: hasNonDateFilters(filters, q),
    // Chip ngày hay khoảng ngày đang áp dụng (khác mặc định `Tùy chọn` trống): chọn câu "rỗng" đúng, thứ tự sắp xếp không phải bộ lọc ngày
    dateFilterActive:
      filters.preset !== 'range' || filters.from !== '' || filters.to !== '',
    // Chuỗi `search` hiện tại của danh sách (không có `q`): trang chi tiết dùng để khôi phục bộ lọc khi `← Lịch hẹn`
    listSearch: search === '' ? '' : `?${search}`,
    keyword,
    setStatus: (value: AppointmentState | null) => update({ status: value }),
    setShift: (value: ShiftCode | null) => update({ shift: value }),
    setSort: (value: SortOrder) => update({ sort: value }),
    setPreset,
    setFromDate: (value: string) => setDate('from', value),
    setToDate: (value: string) => setDate('to', value),
    setPage,
    clearFilters,
  };
}

export type DoctorListController = ReturnType<typeof useDoctorList>;
