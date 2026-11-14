import {
  readAmount,
  readCode,
  readFlag,
  readIsoDateTime,
  readRecord,
  readText,
} from './response-readers';

// MƯỜI khoá chung của một dòng lịch hẹn ở API Bệnh nhân (B1, mười hai khoá) và API Lễ tân (B3, mười một khoá): booking F1 viết trong `patient/`, chuyển lên
// `common/` ở F8 để hai bộ đọc cùng dùng MỘT chỗ (không chép lần hai). Mỗi trang cộng khoá riêng của mình: Bệnh nhân `hanThanhToan`, `choPhepHuy`; Lễ tân `nguoiDat`.
export interface AppointmentCore {
  maLichHen: string;
  // Mã trạng thái. Chỉ sáu mã trong `APPOINTMENT_STATES` có nhãn; mã lạ vẫn đi qua và hiện "Chưa xác định" (appointmentStateLabel)
  trangThai: string;
  // ISO 8601 UTC: hiển thị qua `formatVietnam*`, không bao giờ theo múi giờ của máy
  thoiGian: string;
  // Chỉ họ tên và tên: API không trả chức danh bác sĩ hay quan hệ của người thân (TRACKING 3.25 F1-D (4))
  bacSi: string;
  chuyenKhoa: string;
  chiNhanh: string;
  dichVu: string;
  nguoiKham: { hoTen: string; laBanThan: boolean };
  // Chuỗi decimal ("300000.00"), chỉ để hiển thị qua `formatVnd`; không tính toán trên số thực
  giaSnapshot: string;
  tienCoc: string;
}

// Thiếu một khoá hay sai kiểu ⇒ `UnexpectedResponseError` (phản hồi không dùng được). Khoá thừa của API không được chép theo.
export function parseAppointmentCore(
  row: Record<string, unknown>,
): AppointmentCore {
  const person = readRecord(row.nguoiKham);
  return {
    maLichHen: readCode(row.maLichHen),
    trangThai: readText(row.trangThai),
    thoiGian: readIsoDateTime(row.thoiGian),
    bacSi: readText(row.bacSi),
    chuyenKhoa: readText(row.chuyenKhoa),
    chiNhanh: readText(row.chiNhanh),
    dichVu: readText(row.dichVu),
    nguoiKham: {
      hoTen: readText(person.hoTen),
      laBanThan: readFlag(person.laBanThan),
    },
    giaSnapshot: readAmount(row.giaSnapshot),
    tienCoc: readAmount(row.tienCoc),
  };
}
