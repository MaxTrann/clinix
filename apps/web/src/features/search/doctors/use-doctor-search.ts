import { useCallback, useEffect, useState } from 'react';
import { useSelectedBranch } from '../../../shared/branch-selection';
import { getBranches, getDoctors } from '../api/search-service';
import { useRemote } from '../use-remote';
import {
  DEFAULT_SORT,
  hasFilterErrors,
  validateDoctorFilters,
  type DoctorFilterValues,
} from './doctor-filter-rules';

export const DOCTOR_FILTER_DEBOUNCE_MS = 300;
export const DOCTOR_PAGE_SIZE = 20;

export interface DoctorSearchBase {
  dichVuKhamId?: string;
  chuyenKhoaId?: string;
}

/**
 * Trạng thái bộ lọc + gọi API danh sách bác sĩ (dùng chung cho F5, F6).
 * - Chi nhánh chỉ KHỞI TẠO từ "chi nhánh đang chọn" (Q7d): theo kho chung cho đến khi người dùng tự đổi, đổi ở đây không ghi ngược kho.
 * - Ô gõ chờ 300 ms; giá sai thì giữ kết quả hợp lệ gần nhất và báo lỗi dưới ô (TBS-17).
 * - Mỗi lần đổi bộ lọc `useRemote` huỷ yêu cầu cũ nên kết quả về muộn không đè kết quả mới.
 */
export function useDoctorSearch(base: DoctorSearchBase) {
  const { selection } = useSelectedBranch();
  // chiNhanhId null = chưa tự chọn, đi theo kho chung
  const [filters, setFilters] = useState<
    Omit<DoctorFilterValues, 'chiNhanhId'> & { chiNhanhId: string | null }
  >({
    chiNhanhId: null,
    chuyenKhoaId: '',
    q: '',
    giaTu: '',
    giaDen: '',
    diemTu: '',
    sapXep: DEFAULT_SORT,
  });
  const [page, setPage] = useState(1);

  const values: DoctorFilterValues = {
    ...filters,
    chiNhanhId: filters.chiNhanhId ?? selection?.chiNhanhId ?? '',
  };
  const errors = validateDoctorFilters(values);
  const valid = !hasFilterErrors(errors);

  // `applied` là bản đã qua debounce và hợp lệ — thứ thật sự gửi lên API
  const [applied, setApplied] = useState(values);
  const signature = JSON.stringify(values);
  useEffect(() => {
    if (!valid) return;
    const timer = setTimeout(
      () => setApplied(JSON.parse(signature) as DoctorFilterValues),
      DOCTOR_FILTER_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [signature, valid]);

  const doctors = useRemote(
    (signal) =>
      getDoctors(
        {
          dichVuKhamId: base.dichVuKhamId,
          // Chuyên khoa cố định của trang (chi tiết chuyên khoa) thắng ô chọn
          chuyenKhoaId: base.chuyenKhoaId ?? applied.chuyenKhoaId,
          chiNhanhId: applied.chiNhanhId,
          q: applied.q.trim(),
          giaTu: applied.giaTu.trim(),
          giaDen: applied.giaDen.trim(),
          diemTu: applied.diemTu,
          sapXep: applied.sapXep,
          page,
          pageSize: DOCTOR_PAGE_SIZE,
        },
        signal,
      ),
    [
      base.dichVuKhamId ?? null,
      base.chuyenKhoaId ?? applied.chuyenKhoaId,
      applied.chiNhanhId,
      applied.q.trim(),
      applied.giaTu.trim(),
      applied.giaDen.trim(),
      applied.diemTu,
      applied.sapXep,
      page,
    ],
  );

  const branches = useRemote((signal) => getBranches(signal), []);

  const change = useCallback((patch: Partial<DoctorFilterValues>) => {
    setPage(1);
    setFilters((old) => ({ ...old, ...patch }));
  }, []);

  // "Xoá bộ lọc": về mặc định, chi nhánh về "Tất cả chi nhánh"
  const reset = useCallback(() => {
    setPage(1);
    setFilters({
      chiNhanhId: '',
      chuyenKhoaId: '',
      q: '',
      giaTu: '',
      giaDen: '',
      diemTu: '',
      sapXep: DEFAULT_SORT,
    });
  }, []);

  return {
    values,
    errors,
    change,
    reset,
    page,
    setPage,
    doctors,
    branches:
      branches.state.status === 'ready' ? branches.state.data.items : [],
  };
}
