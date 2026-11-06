import { request } from '../../../shared/api/client';
import type {
  BranchDetail,
  BranchSummary,
  ClinicInfo,
  Paged,
  SpecialtyDetail,
  SpecialtyPage,
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

// Danh sách chuyên khoa: pageSize lớn vì trang không phân trang (Figma 217:2 là một lưới); quá 100 thì ghi TECH_DEBT.
export const SPECIALTY_PAGE_SIZE = 100;

export function getSpecialties(
  params: { q?: string; chiNhanhId?: string | null },
  signal?: AbortSignal,
): Promise<SpecialtyPage> {
  return request<SpecialtyPage>('public/specialties', {
    ...PUBLIC_OPTIONS,
    query: {
      q: params.q || undefined,
      chiNhanhId: params.chiNhanhId ?? undefined,
      pageSize: SPECIALTY_PAGE_SIZE,
    },
    signal,
  });
}

export function getSpecialtyDetail(
  id: string,
  chiNhanhId: string | null,
  signal?: AbortSignal,
): Promise<SpecialtyDetail> {
  return request<SpecialtyDetail>(
    `public/specialties/${encodeURIComponent(id)}`,
    {
      ...PUBLIC_OPTIONS,
      query: { chiNhanhId: chiNhanhId ?? undefined },
      signal,
    },
  );
}

// Trang "Chi nhánh": cùng pageSize lớn như bộ chọn vì chi nhánh đang chọn được xếp đầu ở trình duyệt (Q5); `q` khớp tên + địa chỉ (Q3).
export function searchBranches(
  q: string,
  signal?: AbortSignal,
): Promise<Paged<BranchSummary>> {
  return request<Paged<BranchSummary>>('public/branches', {
    ...PUBLIC_OPTIONS,
    query: { q: q || undefined, pageSize: BRANCH_PICKER_PAGE_SIZE },
    signal,
  });
}
