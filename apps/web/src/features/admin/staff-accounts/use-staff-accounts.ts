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
} from '../account-common/account-types';
import { rolesToQuery, type RoleFilter } from './staff-rules';
import type { StaffAccount } from './staff-types';

// Dữ liệu danh sách Nhân sự (admin F8): MỘT lời gọi `GET /admin/accounts` mỗi khi bộ lọc hay trang đổi. `useRemote` huỷ yêu cầu cũ nên kết quả muộn
// không đè kết quả mới. Hai trường hợp trang lệch được tự sửa thay vì báo lỗi: trang vượt (dữ liệu vừa ít đi) về trang CUỐI, `TRANG_KHONG_HOP_LE` về trang 1.

export interface StaffFilters {
  /** Từ khoá đã trim và đã qua độ trễ gõ phím. */
  q: string;
  role: RoleFilter;
  trangThai?: AccountStatus;
  chiNhanhId?: string;
}

function queryOf(
  filters: StaffFilters,
  scope: AdminScopeKind,
  page: number,
): AccountListQuery {
  return {
    page,
    pageSize: ACCOUNT_PAGE_SIZE,
    vaiTro: rolesToQuery(scope, filters.role),
    trangThai: filters.trangThai,
    chiNhanhId: filters.chiNhanhId,
    q: filters.q,
  };
}

async function loadPage(
  filters: StaffFilters,
  page: number,
  scope: AdminScopeKind,
  signal: AbortSignal,
): Promise<PagedResult<StaffAccount>> {
  const fetchPage = (target: number) =>
    listAccounts<StaffAccount>(queryOf(filters, scope, target), scope, signal);
  let result: PagedResult<StaffAccount>;
  try {
    result = await fetchPage(page);
  } catch (error) {
    if (page > 1 && isPageOutOfRange(error)) return fetchPage(1);
    throw error;
  }
  const lastPage = Math.ceil(result.total / ACCOUNT_PAGE_SIZE);
  // Trang vượt: không còn dòng nào ở trang này dù `total` > 0 (người khác vừa xoá hay đổi dữ liệu)
  if (page > 1 && result.items.length === 0 && lastPage >= 1)
    return fetchPage(Math.min(lastPage, page - 1));
  return result;
}

export function useStaffAccounts(
  scope: AdminScopeKind,
  filters: StaffFilters,
  page: number,
) {
  const { q, role, trangThai, chiNhanhId } = filters;
  return useRemote(
    (signal) =>
      loadPage({ q, role, trangThai, chiNhanhId }, page, scope, signal),
    [scope, page, q, role, trangThai ?? null, chiNhanhId ?? null],
  );
}
