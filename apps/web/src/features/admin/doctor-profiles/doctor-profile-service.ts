import { request } from '../../../shared/api/client';
import type {
  BranchOption,
  DoctorDetail,
  DoctorListItem,
  DoctorProfileInput,
  EditOptions,
  PagedResult,
  SpecialtyOption,
} from './doctor-profile-types';

// Gọi API hồ sơ bác sĩ (B12 đọc, B13 sửa) và dữ liệu cho các ô chọn của panel Chỉnh sửa, qua lớp client duy nhất (admin F7).
// Ô chọn không cần API riêng: chuyên khoa từ `GET /admin/options/specialties` (chỉ đang hoạt động, Q19), chi nhánh kèm dịch vụ của từng chi nhánh từ
// `GET /admin/branches` (Chi nhánh chỉ thấy chi nhánh mình), giá dịch vụ từ `GET /admin/services`. Mỗi danh sách lấy tối đa 100 dòng đầu.

export const DOCTOR_PAGE_SIZE = 20;
const OPTIONS_LIMIT = 100;
const DOCTORS_PATH = '/admin/doctors';

export interface DoctorListQuery {
  page: number;
  q: string;
  chuyenKhoaId?: string;
}

export function listDoctors(
  query: DoctorListQuery,
  signal?: AbortSignal,
): Promise<PagedResult<DoctorListItem>> {
  const text = query.q.trim();
  return request<PagedResult<DoctorListItem>>(DOCTORS_PATH, {
    query: {
      page: query.page,
      pageSize: DOCTOR_PAGE_SIZE,
      ...(text !== '' && { q: text }),
      ...(query.chuyenKhoaId !== undefined && {
        chuyenKhoaId: query.chuyenKhoaId,
      }),
    },
    signal,
  });
}

const doctorPath = (id: string) => `${DOCTORS_PATH}/${encodeURIComponent(id)}`;

export function getDoctor(
  id: string,
  signal?: AbortSignal,
): Promise<DoctorDetail> {
  return request<DoctorDetail>(doctorPath(id), { signal });
}

/** Một lần gửi, không tự thử lại (mất mạng thì chưa rõ đã lưu hay chưa: nơi gọi tải lại chi tiết). */
export function updateDoctor(
  id: string,
  input: DoctorProfileInput,
): Promise<DoctorDetail> {
  return request<DoctorDetail>(doctorPath(id), {
    method: 'PATCH',
    json: input,
  });
}

export function listSpecialtyOptions(
  signal?: AbortSignal,
): Promise<SpecialtyOption[]> {
  return request<PagedResult<SpecialtyOption>>('/admin/options/specialties', {
    query: { page: 1, pageSize: OPTIONS_LIMIT },
    signal,
  }).then((result) =>
    result.items.map(({ chuyenKhoaId, ten }) => ({ chuyenKhoaId, ten })),
  );
}

interface BranchListItem {
  chiNhanhId: string;
  ten: string;
  dichVuKham: { dichVuKhamId: string; ten: string }[];
}
interface ServiceListItem {
  dichVuKhamId: string;
  giaMacDinh: string;
}

/** Chi nhánh (kèm dịch vụ và giá mặc định) và chuyên khoa cho panel Chỉnh sửa: ba lời gọi song song. */
export async function loadEditOptions(
  signal?: AbortSignal,
): Promise<EditOptions> {
  const [specialties, branches, services] = await Promise.all([
    listSpecialtyOptions(signal),
    request<PagedResult<BranchListItem>>('/admin/branches', {
      query: { page: 1, pageSize: OPTIONS_LIMIT },
      signal,
    }),
    request<PagedResult<ServiceListItem>>('/admin/services', {
      query: { page: 1, pageSize: OPTIONS_LIMIT },
      signal,
    }),
  ]);
  const prices = new Map(
    services.items.map((service) => [service.dichVuKhamId, service.giaMacDinh]),
  );
  const branchOptions: BranchOption[] = branches.items.map((branch) => ({
    chiNhanhId: branch.chiNhanhId,
    ten: branch.ten,
    dichVuKham: branch.dichVuKham.map((service) => ({
      ...service,
      giaMacDinh: prices.get(service.dichVuKhamId) ?? null,
    })),
  }));
  return { specialties, branches: branchOptions };
}
