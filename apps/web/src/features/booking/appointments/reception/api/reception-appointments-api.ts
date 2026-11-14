import { request } from '../../../../../shared/api/client';
import {
  parseOperationsAppointment,
  parseOperationsAppointmentPage,
} from '../../common/operations-appointment';
import type {
  ReceptionAppointmentPage,
  ReceptionListQuery,
} from './reception-appointment-types';

// Gọi và kiểm hình dạng `GET /reception/appointments` (booking F8; PLAN 5.9, TRACKING 3.17.1). Route của Lễ tân nên GẮN access token (mặc định của `request()`);
// chi nhánh do backend đọc từ `le_tan` ở DB mỗi lần gọi, KHÔNG có tham số nào từ client là phạm vi dữ liệu.

// Bộ đọc dòng và trang đã chuyển lên `common/operations-appointment.ts` ở F10 (Quản trị viên có cùng hình dạng); xuất lại tên cũ cho chỗ dùng và test của F8
export const parseReceptionAppointment = parseOperationsAppointment;
export const parseReceptionAppointmentPage = parseOperationsAppointmentPage;

// Chỉ các khoá B3 nhận (khoá lạ bị 400 `TRUONG_KHONG_DUOC_PHEP`). `page` luôn được gửi; bộ lọc nào rỗng hay chưa chọn thì KHÔNG gửi (`q=` rỗng là 400).
// Giá trị giữ nguyên là chuỗi: id BIGINT không qua `Number`, ngày không qua `Date`.
export function buildReceptionListQuery(
  query: ReceptionListQuery,
): Record<string, string | number> {
  const params: Record<string, string | number> = { page: query.page };
  const filters = {
    trangThai: query.trangThai,
    chuyenKhoaId: query.chuyenKhoaId,
    bacSiId: query.bacSiId,
    tuNgay: query.tuNgay,
    denNgay: query.denNgay,
    q: query.q,
  };
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params[key] = value;
  }
  return params;
}

export async function getReceptionAppointments(
  query: ReceptionListQuery,
  signal?: AbortSignal,
): Promise<ReceptionAppointmentPage> {
  return parseReceptionAppointmentPage(
    await request<unknown>('reception/appointments', {
      query: buildReceptionListQuery(query),
      signal,
    }),
  );
}
