import { request } from '../../../shared/api/client';
import type {
  BranchDetail,
  BranchSummary,
  ClinicInfo,
  Paged,
} from './search-types';

// Mọi lời gọi của module search đi qua đây và dùng `skipAuthToken`: route công khai không đọc token, nên không gắn
// Authorization và không kích hoạt làm mới phiên khi token cũ hết hạn (H7, CC-08).
const PUBLIC_OPTIONS = { skipAuthToken: true } as const;

export function getClinicInfo(signal?: AbortSignal): Promise<ClinicInfo> {
  return request<ClinicInfo>('public/clinic-info', {
    ...PUBLIC_OPTIONS,
    signal,
  });
}

// Bộ chọn chi nhánh và "gần nhất" lấy mọi chi nhánh bằng pageSize tối đa (Q23); quá 100 chi nhánh thì ghi TECH_DEBT.
export const BRANCH_PICKER_PAGE_SIZE = 100;

export function getBranches(
  signal?: AbortSignal,
): Promise<Paged<BranchSummary>> {
  return request<Paged<BranchSummary>>('public/branches', {
    ...PUBLIC_OPTIONS,
    query: { pageSize: BRANCH_PICKER_PAGE_SIZE },
    signal,
  });
}

export function getBranchDetail(
  id: string,
  signal?: AbortSignal,
): Promise<BranchDetail> {
  return request<BranchDetail>(`public/branches/${id}`, {
    ...PUBLIC_OPTIONS,
    signal,
  });
}
