import { request } from '../../../../../shared/api/client';
import {
  readIsoDateTime,
  readRecord,
  readText,
  unusableResponse,
} from '../../common/response-readers';
import { parseDoctorAppointment } from './doctor-appointments-api';
import type { DoctorAppointmentDetail } from './doctor-appointment-types';

// Gọi và kiểm hình dạng `GET /doctor/appointments/:maLichHen` (booking F11; hợp đồng B5: PLAN 5.9, TRACKING 3.20.1). Gắn access token. Đủ mười một khoá = tám khoá của dòng cộng `ghiChuKham`, `chiNhanh`,
// `ngayDat`; khoá thừa của API (giá, cọc, email, `lyDoHuy`, tên bác sĩ…) không bao giờ lọt ra màn hình.
//
// `ghiChuKham` nhận ĐÚNG `null` (B5: luôn `null` tới khi module `doctor` có bảng `ho_so_kham`). Khác `null` ⇒ phản hồi không dùng được: hợp đồng đã đổi và hình dạng mới là việc của `doctor`, nên bộ đọc này
// được sửa MỘT chỗ trong cùng PR đó; hiện sai hay bịa nội dung hồ sơ khám còn tệ hơn báo lỗi (TRACKING 3.38 F11-E).
export function parseDoctorAppointmentDetail(
  raw: unknown,
): DoctorAppointmentDetail {
  const body = readRecord(raw);
  if (body.ghiChuKham !== null) return unusableResponse();
  return {
    ...parseDoctorAppointment(body),
    ghiChuKham: null,
    chiNhanh: readText(body.chiNhanh),
    ngayDat: readIsoDateTime(body.ngayDat),
  };
}

// Đường dẫn API của một lịch hẹn; mã đi qua `encodeURIComponent` (backend tự chuẩn hoá chữ hoa và kiểm dạng, sai dạng ⇒ 404 cùng thân)
export const doctorAppointmentApiPath = (maLichHen: string) =>
  `doctor/appointments/${encodeURIComponent(maLichHen)}`;

export async function getDoctorAppointment(
  maLichHen: string,
  signal?: AbortSignal,
): Promise<DoctorAppointmentDetail> {
  return parseDoctorAppointmentDetail(
    await request<unknown>(doctorAppointmentApiPath(maLichHen), { signal }),
  );
}
