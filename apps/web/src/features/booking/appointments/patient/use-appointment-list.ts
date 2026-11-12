import { useCallback, useReducer, useState } from 'react';
import { useRemote } from '../../../../shared/hooks/use-remote';
import type { AppointmentState } from '../common/appointment-status';
import { getPatientAppointments } from './api/patient-appointments-api';
import type { PatientAppointmentPage } from './api/patient-appointment-types';
import { classifyListError } from './list-messages';
import {
  INITIAL_QUERY,
  hasActiveFilters,
  isDateRangeValid,
  queryReducer,
} from './list-query-state';
import { useKeywordBox } from './use-keyword-box';

// Hook của trang "Lịch hẹn của tôi" (booking F1; Đại duyệt 12/11/2026, câu (d)): bộ lọc, trang, ô tìm, tải bằng `useRemote` và GIỮ DỮ LIỆU CŨ
// khi đổi trang hay bộ lọc. `useRemote` hiện không giữ: đổi `deps` là `loading` ngay nên bảng sẽ nhấp nháy về "Đang tải". Không sửa hook chung ở F1
// (PR #360 chỉ dời nó lên `shared/hooks/`); F8, F10, F11 cần y hệt thì nâng phần giữ này lên `shared/hooks/` (TECH_DEBT).

// `loading`: lần tải đầu, chưa có gì để hiện. `ready` + `refreshing`: đang tải truy vấn mới, vẫn hiện dữ liệu của truy vấn trước (kèm `aria-busy`).
// `keywordRejected`: API từ chối từ khoá (400 `TU_KHOA_KHONG_HOP_LE`, lưới an toàn của luật ở client): giữ danh sách, báo dưới ô tìm.
export type ListView =
  | { kind: 'loading' }
  | { kind: 'error'; error: unknown }
  | {
      kind: 'ready';
      data: PatientAppointmentPage;
      refreshing: boolean;
      keywordRejected: boolean;
    };

// Trang vượt cuối: B1 trả 200 rỗng mà `total` vẫn đúng (ví dụ lịch bị huỷ ở nơi khác lúc đang xem trang 5). Trang `total` = 0 thì KHÔNG phải vượt cuối.
function lastPageOf(data: PatientAppointmentPage): number {
  return Math.max(1, Math.ceil(data.total / data.pageSize));
}
function isBeyondLastPage(data: PatientAppointmentPage, page: number) {
  return data.items.length === 0 && data.total > 0 && page > lastPageOf(data);
}

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

  // Kết quả `ready` gần nhất, cập nhật NGAY trong lúc render (mẫu "state từ lần render trước" của React; không `setState` trong effect)
  const [lastReady, setLastReady] = useState<PatientAppointmentPage | null>(
    null,
  );
  // Trang vượt cuối (rỗng) KHÔNG được giữ làm dữ liệu cũ: nếu giữ, lúc tải trang cuối đúng sẽ nháy câu "chưa có lịch hẹn nào"
  const beyondLast =
    remote.status === 'ready' && isBeyondLastPage(remote.data, query.page);
  if (remote.status === 'ready' && !beyondLast && remote.data !== lastReady) {
    setLastReady(remote.data);
  }

  const stale: ListView =
    lastReady === null
      ? { kind: 'loading' }
      : {
          kind: 'ready',
          data: lastReady,
          refreshing: true,
          keywordRejected: false,
        };

  let view: ListView;
  if (remote.status === 'ready' && !beyondLast) {
    view = {
      kind: 'ready',
      data: remote.data,
      refreshing: false,
      keywordRejected: false,
    };
  } else if (remote.status === 'error') {
    view =
      classifyListError(remote.error) === 'keyword' && lastReady !== null
        ? {
            kind: 'ready',
            data: lastReady,
            refreshing: false,
            keywordRejected: true,
          }
        : { kind: 'error', error: remote.error };
  } else {
    view = stale;
  }

  // Về trang cuối còn dữ liệu. Mỗi bước giảm nghiêm ngặt (`query.page` lớn hơn trang cuối mới) nên không lặp vô hạn.
  if (remote.status === 'ready' && beyondLast) {
    dispatch({ type: 'page', value: lastPageOf(remote.data) });
  }

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
