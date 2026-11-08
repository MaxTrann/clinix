import { request } from '../../../shared/api/client';
import type {
  BranchDetail,
  BranchSummary,
  ClinicInfo,
  DoctorDetail,
  DoctorItem,
  DoctorQuery,
  Items,
  Paged,
  PublicOverview,
  ServiceGroupItem,
  ServiceItem,
  SpecialtyDetail,
  SpecialtyPage,
} from './search-types';

// Mọi lời gọi của module search đi qua đây và dùng `skipAuthToken`: route công khai không đọc token, nên không gắn
// Authorization và không kích hoạt làm mới phiên khi token cũ hết hạn (H7, CC-08).
const PUBLIC_OPTIONS = { skipAuthToken: true } as const;

export function getOverview(signal?: AbortSignal): Promise<PublicOverview> {
  return request<PublicOverview>('public/overview', {
    ...PUBLIC_OPTIONS,
    signal,
  });
}

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
  params: { q?: string; chiNhanhId?: string | null; pageSize?: number },
  signal?: AbortSignal,
): Promise<SpecialtyPage> {
  return request<SpecialtyPage>('public/specialties', {
    ...PUBLIC_OPTIONS,
    query: {
      q: params.q || undefined,
      chiNhanhId: params.chiNhanhId ?? undefined,
      pageSize: params.pageSize ?? SPECIALTY_PAGE_SIZE,
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

// TCBS b1: nhóm dịch vụ (kèm "giá từ"); `chiNhanhId` null = mọi chi nhánh.
export function getServiceGroups(
  chiNhanhId: string | null,
  signal?: AbortSignal,
): Promise<Items<ServiceGroupItem>> {
  return request<Items<ServiceGroupItem>>('public/service-groups', {
    ...PUBLIC_OPTIONS,
    query: { chiNhanhId: chiNhanhId ?? undefined },
    signal,
  });
}

// TCBS b2: dịch vụ đang cung cấp của một nhóm (ở chi nhánh đó nếu có chọn).
export function getServices(
  nhomDichVuId: string,
  chiNhanhId: string | null,
  signal?: AbortSignal,
): Promise<Items<ServiceItem>> {
  return request<Items<ServiceItem>>('public/services', {
    ...PUBLIC_OPTIONS,
    query: { nhomDichVuId, chiNhanhId: chiNhanhId ?? undefined },
    signal,
  });
}

// TCBS b9: chi tiết một bác sĩ; không có/không công khai/sai dạng ⇒ 404 cùng thân.
export function getDoctorDetail(
  id: string,
  signal?: AbortSignal,
): Promise<DoctorDetail> {
  return request<DoctorDetail>(`public/doctors/${encodeURIComponent(id)}`, {
    ...PUBLIC_OPTIONS,
    signal,
  });
}

// TCBS b3–b6: danh sách bác sĩ. Tham số rỗng bị bỏ để URL gọn và đúng nghĩa "không lọc".
export function getDoctors(
  params: DoctorQuery,
  signal?: AbortSignal,
): Promise<Paged<DoctorItem>> {
  return request<Paged<DoctorItem>>('public/doctors', {
    ...PUBLIC_OPTIONS,
    query: {
      dichVuKhamId: params.dichVuKhamId || undefined,
      chuyenKhoaId: params.chuyenKhoaId || undefined,
      chiNhanhId: params.chiNhanhId || undefined,
      q: params.q || undefined,
      giaTu: params.giaTu || undefined,
      giaDen: params.giaDen || undefined,
      diemTu: params.diemTu || undefined,
      sapXep: params.sapXep,
      page: params.page,
      pageSize: params.pageSize,
    },
    signal,
  });
}
