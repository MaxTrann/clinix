import { request } from '../../../../../shared/api/client';
import { parseAppointmentCore } from '../../common/appointment-core';
import {
  readCount,
  readFlag,
  readIsoDateTime,
  readList,
  readRecord,
} from '../../common/response-readers';
import { parseStatusCounts } from '../../common/status-counts';
import type {
  AppointmentListQuery,
  PatientAppointment,
  PatientAppointmentPage,
} from './patient-appointment-types';

// Gọi và kiểm hình dạng `GET /patient/appointments` (booking F1; PLAN 5.9, TRACKING 3.13). Route của Bệnh nhân nên GẮN access token
// (mặc định của `request()`); phạm vi `benh_nhan_id` do backend lấy từ token, không tham số nào từ client là chủ sở hữu.

// Xuất cho `patient-appointment-detail-api.ts` (F2): chi tiết có đúng mười hai khoá này cộng bốn khoá riêng
export function parseAppointment(raw: unknown): PatientAppointment {
  const row = readRecord(raw);
  return {
    ...parseAppointmentCore(row),
    hanThanhToan:
      row.hanThanhToan === null ? null : readIsoDateTime(row.hanThanhToan),
    choPhepHuy: readFlag(row.choPhepHuy),
  };
}

export function parsePatientAppointmentPage(
  raw: unknown,
): PatientAppointmentPage {
  const body = readRecord(raw);
  return {
    items: readList(body.items).map(parseAppointment),
    total: readCount(body.total),
    page: readCount(body.page, 1),
    pageSize: readCount(body.pageSize, 1),
    demTheoTrangThai: parseStatusCounts(body.demTheoTrangThai),
  };
}

// Chỉ các khoá B1 nhận (khoá lạ bị 400 `TRUONG_KHONG_DUOC_PHEP`). `page` luôn được gửi; bộ lọc nào rỗng hay chưa chọn thì KHÔNG gửi
// (`q=` rỗng là 400 của B1). Giá trị giữ nguyên là chuỗi: id BIGINT không qua `Number`, ngày không qua `Date`.
export function buildListQuery(
  query: AppointmentListQuery,
): Record<string, string | number> {
  const params: Record<string, string | number> = { page: query.page };
  const filters = {
    trangThai: query.trangThai,
    hoSoNguoiThanId: query.hoSoNguoiThanId,
    bacSiId: query.bacSiId,
    chuyenKhoaId: query.chuyenKhoaId,
    tuNgay: query.tuNgay,
    denNgay: query.denNgay,
    q: query.q,
  };
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params[key] = value;
  }
  return params;
}

export async function getPatientAppointments(
  query: AppointmentListQuery,
  signal?: AbortSignal,
): Promise<PatientAppointmentPage> {
  return parsePatientAppointmentPage(
    await request<unknown>('patient/appointments', {
      query: buildListQuery(query),
      signal,
    }),
  );
}
