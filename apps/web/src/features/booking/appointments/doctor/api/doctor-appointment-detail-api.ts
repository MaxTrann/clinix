import { request } from '../../../../../shared/api/client';
import {
  readIsoDateTime,
  readRecord,
  readMilestones,
  readText,
} from '../../common/response-readers';
import {
  parseDoctorAppointment,
  readNullableDate,
} from './doctor-appointments-api';
import type {
  DoctorAppointmentDetail,
  DoctorExamRecord,
} from './doctor-appointment-types';

// Gọi và kiểm hình dạng `GET /doctor/appointments/:maLichHen` (booking F11; hợp đồng B5: PLAN 5.9, TRACKING 3.20.1). Gắn access token. Đủ mười một khoá = tám khoá của dòng cộng `ghiChuKham`, `chiNhanh`,
// `ngayDat`; khoá thừa của API (giá, cọc, email, `lyDoHuy`, tên bác sĩ…) không bao giờ lọt ra màn hình.
//
// `ghiChuKham` nhận `null` HOẶC đối tượng đúng năm khoá (doctor-exam F2, H6: sửa TRƯỚC B3; B5 hiện vẫn luôn trả `null`): ba chuỗi `trieuChung`, `chanDoanSoBo`, `huongXuLy`, `ngayTaiKhamDuKien` là `YYYY-MM-DD` hoặc `null`,
// `capNhatLanCuoi` là ISO 8601. Thiếu khoá, sai kiểu, sai dạng ngày, mảng, chuỗi hay số ⇒ phản hồi không dùng được (hiện sai hay bịa nội dung hồ sơ khám còn tệ hơn báo lỗi, TRACKING 3.38 F11-E); khoá THỪA bị bỏ (không chép
// sang kết quả, đúng nếp mọi bộ đọc của booking: B3 thêm khoá không làm hỏng cả trang). Khoá `ghiChuKham` vắng ⇒ không dùng được. Nội dung hồ sơ là dữ liệu sức khoẻ: không bao giờ vào log, thông báo lỗi hay URL.
function parseExamRecord(raw: unknown): DoctorExamRecord | null {
  if (raw === null) return null;
  const note = readRecord(raw);
  return {
    trieuChung: readText(note.trieuChung),
    chanDoanSoBo: readText(note.chanDoanSoBo),
    huongXuLy: readText(note.huongXuLy),
    ngayTaiKhamDuKien: readNullableDate(note.ngayTaiKhamDuKien),
    capNhatLanCuoi: readIsoDateTime(note.capNhatLanCuoi),
  };
}

export function parseDoctorAppointmentDetail(
  raw: unknown,
): DoctorAppointmentDetail {
  const body = readRecord(raw);
  return {
    ...parseDoctorAppointment(body),
    ghiChuKham: parseExamRecord(body.ghiChuKham),
    chiNhanh: readText(body.chiNhanh),
    ngayDat: readIsoDateTime(body.ngayDat),
    moc: readMilestones(body.moc),
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
