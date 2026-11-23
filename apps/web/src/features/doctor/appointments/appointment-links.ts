import {
  DOCTOR_APPOINTMENTS_PATH,
  RECEPTION_APPOINTMENTS_PATH,
} from '../../../shared/routes/booking-paths';
import type { ShiftCode } from '../../../shared/schedule/shift-labels';

// Liên kết từ lịch làm việc sang trang "Lịch hẹn" của booking (doctor UX6; G9, G11). Chỉ import ĐƯỜNG DẪN từ `shared/routes/booking-paths` (WHT-10 cấm
// import `features/booking`). Tên khoá URL là hợp đồng với `reception-query-state.ts` và `doctor-query-state.ts` của booking, khoá bằng test ở
// `appointment-links.test.ts` (DUX6-17). Liên kết CHỈ mang MÃ và NGÀY: không tên bệnh nhân, SĐT hay từ khoá `q`. URL là dữ liệu người dùng sửa được, nên mọi
// giá trị vẫn được booking kiểm lại; ở đây chỉ không đẩy giá trị sai dạng lên.
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;
const BIGINT_ID = /^[1-9][0-9]*$/;

function withQuery(path: string, entries: [string, string][]): string {
  const params = new URLSearchParams(entries);
  const query = params.toString();
  return query === '' ? path : `${path}?${query}`;
}

// Khoảng ngày một ngày của trang Lễ tân: chip `Khoảng ngày` có slug `khoang-ngay` ở booking (`RANGE_SLUG`)
export function receptionAppointmentsHref(input: {
  day: string;
  doctorId?: string;
}): string {
  if (!CALENDAR_DAY.test(input.day)) return RECEPTION_APPOINTMENTS_PATH;
  const entries: [string, string][] = [
    ['khoang', 'khoang-ngay'],
    ['tuNgay', input.day],
    ['denNgay', input.day],
  ];
  if (input.doctorId !== undefined && BIGINT_ID.test(input.doctorId))
    entries.push(['bacSiId', input.doctorId]);
  return withQuery(RECEPTION_APPOINTMENTS_PATH, entries);
}

// Trang Lịch hẹn của Bác sĩ: vắng `khoang` là `Tùy chọn` (`range`), đọc `tuNgay`, `denNgay`, `ca`, `sapXep`; cũ nhất trước để khớp thứ tự trong hộp
export function doctorAppointmentsHref(input: {
  day: string;
  ca: ShiftCode;
}): string {
  if (!CALENDAR_DAY.test(input.day)) return DOCTOR_APPOINTMENTS_PATH;
  return withQuery(DOCTOR_APPOINTMENTS_PATH, [
    ['tuNgay', input.day],
    ['denNgay', input.day],
    ['ca', input.ca],
    ['sapXep', 'CuNhat'],
  ]);
}
