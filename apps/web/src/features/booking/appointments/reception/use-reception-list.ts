import { useCallback, useReducer } from 'react';
import { useRemote } from '../../../../shared/hooks/use-remote';
import { todayVn } from '../../../../shared/schedule/week';
import type { AppointmentState } from '../common/appointment-status';
import { isDateRangeValid } from '../common/date-range';
import { useKeywordBox } from '../common/use-keyword-box';
import { useListView } from '../common/use-list-view';
import { getReceptionAppointments } from './api/reception-appointments-api';
import { presetRange, type DatePreset } from './date-presets';
import {
  INITIAL_QUERY,
  hasActiveFilters,
  hasNonDateFilters,
  queryReducer,
} from './reception-query-state';

// Hook của trang "Quản lý lịch hẹn" của Lễ tân (booking F8): chip ngày, bộ lọc, trang, ô tìm, tải bằng `useRemote` và GIỮ DỮ LIỆU CŨ khi đổi bộ lọc hay trang
// (`useListView` của `common/`, dùng chung với "Lịch hẹn của tôi"). Chỉ ĐỌC (GET).
export function useReceptionList() {
  const [query, dispatch] = useReducer(queryReducer, INITIAL_QUERY);

  // Ngày của chip tính MỖI LẦN vẽ từ đồng hồ máy theo giờ Việt Nam (`todayVn`): qua nửa đêm mà trang còn mở thì lần vẽ kế tiếp tự sang ngày mới, không có hẹn giờ riêng.
  // Đồng hồ máy khách là nguồn duy nhất (phản hồi danh sách không có giờ máy chủ): TECH_DEBT.
  const range = presetRange(query.preset, todayVn(), query.dates);

  const { state: remote, retry } = useRemote(
    (signal) =>
      getReceptionAppointments(
        {
          page: query.page,
          trangThai: query.status ?? undefined,
          chuyenKhoaId: query.specialty,
          bacSiId: query.doctor,
          tuNgay: range.from,
          denNgay: range.to,
          q: query.q,
        },
        signal,
      ),
    [
      query.page,
      query.status ?? '',
      query.specialty,
      query.doctor,
      range.from,
      range.to,
      query.q,
    ],
  );

  const view = useListView(remote, query.page, (value) =>
    dispatch({ type: 'page', value }),
  );

  const applyKeyword = useCallback(
    (value: string) => dispatch({ type: 'keyword', value }),
    [],
  );
  const keyword = useKeywordBox({
    applied: query.q,
    apply: applyKeyword,
    refresh: retry,
  });
  const clearKeywordInput = keyword.clear;

  const clearFilters = useCallback(() => {
    dispatch({ type: 'reset' });
    clearKeywordInput();
  }, [clearKeywordInput]);

  return {
    view,
    retry,
    page: query.page,
    preset: query.preset,
    status: query.status,
    doctor: query.doctor,
    specialty: query.specialty,
    fromDate: query.dateInput.from,
    toDate: query.dateInput.to,
    dateOrderInvalid: !isDateRangeValid(query.dateInput),
    filtersActive: hasActiveFilters(query),
    nonDateFilters: hasNonDateFilters(query),
    keyword,
    setPreset: (value: DatePreset) => dispatch({ type: 'preset', value }),
    setStatus: (value: AppointmentState | null) =>
      dispatch({ type: 'status', value }),
    setDoctor: (value: string) => dispatch({ type: 'doctor', value }),
    setSpecialty: (value: string) => dispatch({ type: 'specialty', value }),
    setFromDate: (value: string) => dispatch({ type: 'from', value }),
    setToDate: (value: string) => dispatch({ type: 'to', value }),
    setPage: (value: number) => dispatch({ type: 'page', value }),
    clearFilters,
  };
}

export type ReceptionListController = ReturnType<typeof useReceptionList>;
