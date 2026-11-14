import { request } from '../../../../../shared/api/client';
import {
  readCode,
  readCount,
  readIsoDateTime,
  readList,
  readRecord,
  readText,
  unusableResponse,
} from '../../common/response-readers';
import { parseStatusCounts } from '../../common/status-counts';
import type {
  DoctorAppointment,
  DoctorAppointmentPage,
  DoctorExaminee,
  DoctorListQuery,
} from './doctor-appointment-types';

// Gọi và kiểm hình dạng `GET /doctor/appointments` (booking F11; PLAN 5.8, 5.9, TRACKING 3.20.1). Route của Bác sĩ nên GẮN access token (mặc định của `request()`); phạm vi `bac_si_id` do backend lấy từ
// token, KHÔNG có tham số nào từ client là chủ sở hữu. Chỉ đọc đúng các khoá cần: khoá thừa của API (giá, cọc, email, người đặt…) không bao giờ lọt ra màn hình.

// Chuỗi hoặc `null` (khoá luôn có mặt nhưng có thể trống): thiếu khoá hay sai kiểu ⇒ phản hồi không dùng được
export function readNullableText(value: unknown): string | null {
  return value === null ? null : readText(value);
}

// Ngày sinh `YYYY-MM-DD` hoặc `null`; sai dạng ⇒ phản hồi không dùng được
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
function readNullableDate(value: unknown): string | null {
  if (value === null) return null;
  const text = readText(value);
  return DATE_ONLY.test(text) ? text : unusableResponse();
}

// Người khám: năm khoá (`hoTen`, `quanHe`, `gioiTinh`, `ngaySinh`, `soDienThoai`); ba khoá cuối có thể `null`
export function parseExaminee(raw: unknown): DoctorExaminee {
  const person = readRecord(raw);
  return {
    hoTen: readText(person.hoTen),
    quanHe: readText(person.quanHe),
    gioiTinh: readNullableText(person.gioiTinh),
    ngaySinh: readNullableDate(person.ngaySinh),
    soDienThoai: readNullableText(person.soDienThoai),
  };
}

// ĐÚNG tám khoá của một dòng (chi tiết dùng lại và cộng ba khoá riêng). Khoá thừa bị bỏ; thiếu một khoá hay sai kiểu ⇒ `UnexpectedResponseError`.
export function parseDoctorAppointment(
  row: Record<string, unknown>,
): DoctorAppointment {
  return {
    maLichHen: readCode(row.maLichHen),
    thoiGian: readIsoDateTime(row.thoiGian),
    ca: readText(row.ca),
    trangThai: readText(row.trangThai),
    nguoiKham: parseExaminee(row.nguoiKham),
    dichVu: readText(row.dichVu),
    chuyenKhoa: readText(row.chuyenKhoa),
    lyDoKham: readNullableText(row.lyDoKham),
  };
}

export function parseDoctorAppointmentPage(
  raw: unknown,
): DoctorAppointmentPage {
  const body = readRecord(raw);
  return {
    items: readList(body.items).map((item) =>
      parseDoctorAppointment(readRecord(item)),
    ),
    total: readCount(body.total),
    page: readCount(body.page, 1),
    pageSize: readCount(body.pageSize, 1),
    demTheoTrangThai: parseStatusCounts(body.demTheoTrangThai),
  };
}

// Chỉ các khoá B5 nhận (khoá lạ bị 400 `TRUONG_KHONG_DUOC_PHEP`); kiểu `DoctorListQuery` không có chỗ cho `bacSiId`, `chiNhanhId`. `page` luôn được gửi; bộ lọc nào rỗng hay chưa chọn thì KHÔNG gửi
// (`q=` rỗng là 400). Giá trị giữ nguyên là chuỗi: ngày không qua `Date`.
export function buildDoctorListQuery(
  query: DoctorListQuery,
): Record<string, string | number> {
  const params: Record<string, string | number> = { page: query.page };
  const filters = {
    trangThai: query.trangThai,
    ca: query.ca,
    tuNgay: query.tuNgay,
    denNgay: query.denNgay,
    q: query.q,
    sapXep: query.sapXep,
  };
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params[key] = value;
  }
  return params;
}

export async function getDoctorAppointments(
  query: DoctorListQuery,
  signal?: AbortSignal,
): Promise<DoctorAppointmentPage> {
  return parseDoctorAppointmentPage(
    await request<unknown>('doctor/appointments', {
      query: buildDoctorListQuery(query),
      signal,
    }),
  );
}
