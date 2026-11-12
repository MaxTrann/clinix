import { request } from '../../../../../shared/api/client';
import { parseAppointmentCore } from '../../common/appointment-core';
import {
  readCount,
  readList,
  readRecord,
  readText,
} from '../../common/response-readers';
import type {
  ReceptionAppointment,
  ReceptionAppointmentPage,
  ReceptionListQuery,
} from './reception-appointment-types';

// Gọi và kiểm hình dạng `GET /reception/appointments` (booking F8; PLAN 5.9, TRACKING 3.17.1). Route của Lễ tân nên GẮN access token (mặc định của `request()`);
// chi nhánh do backend đọc từ `le_tan` ở DB mỗi lần gọi, KHÔNG có tham số nào từ client là phạm vi dữ liệu.

// Xuất cho `reception-appointment-detail-api.ts`: chi tiết có đúng mười một khoá này cộng năm khoá riêng. Thiếu một khoá hay sai kiểu ⇒ phản hồi không dùng được.
export function parseReceptionAppointment(raw: unknown): ReceptionAppointment {
  const row = readRecord(raw);
  const booker = readRecord(row.nguoiDat);
  return {
    ...parseAppointmentCore(row),
    nguoiDat: {
      hoTen: readText(booker.hoTen),
      soDienThoai: readText(booker.soDienThoai),
    },
  };
}

export function parseReceptionAppointmentPage(
  raw: unknown,
): ReceptionAppointmentPage {
  const body = readRecord(raw);
  return {
    items: readList(body.items).map(parseReceptionAppointment),
    total: readCount(body.total),
    page: readCount(body.page, 1),
    pageSize: readCount(body.pageSize, 1),
  };
}

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
