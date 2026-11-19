import { useEffect, useState } from 'react';
import { useRemote } from '../../../shared/hooks/use-remote';
import { isPageOutOfRange } from '../account-common/account-errors';
import {
  ACCOUNT_PAGE_SIZE,
  listAccounts,
} from '../account-common/account-service';
import type {
  AccountListQuery,
  AccountStatus,
  AdminScopeKind,
  PagedResult,
  PatientAccount,
} from '../account-common/account-types';

// Dữ liệu danh sách Bệnh nhân (admin F9): MỘT lời gọi `GET /admin/accounts` mỗi khi bộ lọc hay trang đổi. `useRemote` huỷ yêu cầu cũ nên kết quả muộn
// không đè kết quả mới. Hai trường hợp trang lệch được tự sửa thay vì báo lỗi: trang vượt (dữ liệu vừa ít đi) về trang CUỐI, `TRANG_KHONG_HOP_LE` về trang 1.

export interface PatientFilters {
  /** Từ khoá đã trim và đã qua độ trễ gõ phím. */
  q: string;
  trangThai?: AccountStatus;
  khoaNoShow?: boolean;
  chiNhanhId?: string;
}

function queryOf(filters: PatientFilters, page: number): AccountListQuery {
  return {
    page,
    pageSize: ACCOUNT_PAGE_SIZE,
    vaiTro: ['BenhNhan'],
    trangThai: filters.trangThai,
    khoaNoShow: filters.khoaNoShow,
    chiNhanhId: filters.chiNhanhId,
    q: filters.q,
  };
}

async function loadPage(
  filters: PatientFilters,
  page: number,
  scope: AdminScopeKind,
  signal: AbortSignal,
): Promise<PagedResult<PatientAccount>> {
  let result: PagedResult<PatientAccount>;
  try {
    result = await listAccounts(queryOf(filters, page), scope, signal);
  } catch (error) {
    if (page > 1 && isPageOutOfRange(error))
      return listAccounts(queryOf(filters, 1), scope, signal);
    throw error;
  }
  const lastPage = Math.ceil(result.total / ACCOUNT_PAGE_SIZE);
  // Trang vượt: không còn dòng nào ở trang này dù `total` > 0 (người khác vừa xoá hay đổi dữ liệu)
  if (page > 1 && result.items.length === 0 && lastPage >= 1)
    return listAccounts(
      queryOf(filters, Math.min(lastPage, page - 1)),
      scope,
      signal,
    );
  return result;
}

export function usePatientAccounts(
  scope: AdminScopeKind,
  filters: PatientFilters,
  page: number,
) {
  const { q, trangThai, khoaNoShow, chiNhanhId } = filters;
  return useRemote(
    (signal) =>
      loadPage({ q, trangThai, khoaNoShow, chiNhanhId }, page, scope, signal),
    [
      scope,
      page,
      q,
      trangThai ?? null,
      khoaNoShow === undefined ? null : String(khoaNoShow),
      chiNhanhId ?? null,
    ],
  );
}

/** Giá trị đã qua độ trễ: ô tìm kiếm gửi MỘT lời gọi cho cả chuỗi phím liên tiếp, không phải mỗi phím một lời gọi. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
