import { request } from '../../../../../shared/api/client';
import {
  parseOperationsAppointmentPage,
  type OperationsAppointmentPage,
} from '../../common/operations-appointment';
import type { AdminListQuery } from './admin-appointment-types';

// Gọi và kiểm hình dạng `GET /admin/appointments` (booking F10; PLAN 5.9, TRACKING 3.33.1). Route của Quản trị viên nên GẮN access token (mặc định của `request()`); phạm vi dữ liệu do
// backend đọc từ `quan_tri_vien` ở DB mỗi lần gọi (Chi nhánh bị ép theo chi nhánh được gán). `chiNhanhId` chỉ là bộ lọc của Toàn hệ thống: nơi gọi KHÔNG truyền nó cho Chi nhánh.

// Chỉ các khoá B4 nhận (khoá lạ, kể cả `thanhToan`, bị 400 `TRUONG_KHONG_DUOC_PHEP`). `page` luôn được gửi; bộ lọc nào rỗng hay chưa chọn thì KHÔNG gửi (`q=` rỗng là 400).
// Giá trị giữ nguyên là chuỗi: id BIGINT không qua `Number`, ngày không qua `Date`.
export function buildAdminListQuery(
  query: AdminListQuery,
): Record<string, string | number> {
  const params: Record<string, string | number> = { page: query.page };
  const filters = {
    trangThai: query.trangThai,
    chiNhanhId: query.chiNhanhId,
    chuyenKhoaId: query.chuyenKhoaId,
    bacSiId: query.bacSiId,
    dichVuKhamId: query.dichVuKhamId,
    tuNgay: query.tuNgay,
    denNgay: query.denNgay,
    q: query.q,
  };
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params[key] = value;
  }
  return params;
}

export async function getAdminAppointments(
  query: AdminListQuery,
  signal?: AbortSignal,
): Promise<OperationsAppointmentPage> {
  return parseOperationsAppointmentPage(
    await request<unknown>('admin/appointments', {
      query: buildAdminListQuery(query),
      signal,
    }),
  );
}
