import { useCallback, useReducer } from 'react';
import { useRemote } from '../../../../shared/hooks/use-remote';
import type { AppointmentState } from '../common/appointment-status';
import { isDateRangeValid } from '../common/date-range';
import { useKeywordBox } from '../common/use-keyword-box';
import { useListView } from '../common/use-list-view';
import { getPatientAppointments } from './api/patient-appointments-api';
import {
  INITIAL_QUERY,
  hasActiveFilters,
  queryReducer,
} from './list-query-state';

// Hook của trang "Lịch hẹn của tôi" (booking F1; Đại duyệt 12/11/2026, câu (d)): bộ lọc, trang, ô tìm, tải bằng `useRemote` và GIỮ DỮ LIỆU CŨ
// khi đổi trang hay bộ lọc. Phần giữ dữ liệu cũ, trang vượt cuối và lỗi từ khoá đã nâng lên `common/use-keep-previous.ts` và `common/use-list-view.ts`
// ở F8 (trả TECH_DEBT dòng 108); ở đây còn bộ lọc, ô tìm và lời gọi API của Bệnh nhân.

export function useAppointmentList() {
  const [query, dispatch] = useReducer(queryReducer, INITIAL_QUERY);

  const { state: remote, retry } = useRemote(
    (signal) =>
      getPatientAppointments(
        {
          page: query.page,
          trangThai: query.status ?? undefined,
          hoSoNguoiThanId: query.profile,
          bacSiId: query.doctor,
          chuyenKhoaId: query.specialty,
          tuNgay: query.dates.from,
          denNgay: query.dates.to,
          q: query.q,
        },
        signal,
      ),
    [
      query.page,
      query.status ?? '',
      query.profile,
      query.doctor,
      query.specialty,
      query.dates.from,
      query.dates.to,
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
    status: query.status,
    profile: query.profile,
    doctor: query.doctor,
    specialty: query.specialty,
    fromDate: query.dateInput.from,
    toDate: query.dateInput.to,
    dateOrderInvalid: !isDateRangeValid(query.dateInput),
    filtersActive: hasActiveFilters(query),
    keyword,
    setStatus: (value: AppointmentState | null) =>
      dispatch({ type: 'status', value }),
    setProfile: (value: string) => dispatch({ type: 'profile', value }),
    setDoctor: (value: string) => dispatch({ type: 'doctor', value }),
    setSpecialty: (value: string) => dispatch({ type: 'specialty', value }),
    setFromDate: (value: string) => dispatch({ type: 'from', value }),
    setToDate: (value: string) => dispatch({ type: 'to', value }),
    setPage: (value: number) => dispatch({ type: 'page', value }),
    clearFilters,
  };
}

export type AppointmentListController = ReturnType<typeof useAppointmentList>;
