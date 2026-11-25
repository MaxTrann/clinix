import { APPOINTMENT_CODE } from '../../api/booking-errors';
import {
  readFlag,
  readId,
  readIsoDateTime,
  readRecord,
  readText,
  unusableResponse,
} from './response-readers';

// Kiểu và bộ đọc NGHIÊM của phần phản hồi đổi lịch mà Bệnh nhân (B6) và Lễ tân đổi hộ (B7) trả GIỐNG HỆT nhau: `lichCu`, `lichMoi` của preview và thân 201 `DaDoi` (reschedule F3 cắt ra từ
// `patient/reschedule/` để hai vai dùng chung, không chép). Id (`bacSiId`, `khungGioId`) là BIGINT dạng CHUỖI: không bao giờ ép sang `number` (id lớn hơn 2^53 sẽ trỏ nhầm). Giờ là ISO 8601 UTC,
// hiển thị theo giờ Việt Nam. Thiếu khoá hay sai kiểu ⇒ `UnexpectedResponseError`; khoá thừa không bao giờ được chép ra kết quả.

// Lịch hiện tại. `bacSiId`: web cần id bác sĩ để gọi lưới khung giờ, chi tiết lịch chỉ có TÊN (Đại chốt 25/11/2026, câu A của F1; B6 và B7 đã trả khoá này).
export interface RescheduleCurrent {
  thoiGian: string;
  bacSiId: string;
}

// Khung giờ mới đã chọn (chỉ có khi hỏi kèm `khungGioId`). `hopLe = false` ⇒ có thể kèm `lyDoKhongHopLe` là mã lỗi.
export interface RescheduleCandidate {
  khungGioId: string;
  thoiGian: string;
  hopLe: boolean;
  lyDoKhongHopLe?: string;
}

// 201 khi đã đổi ngay. Chỉ mã lịch, không id nội bộ. `trangThai` của lịch mới do máy chủ trả (luôn `DaXacNhan`), web không dùng để quyết gì.
export interface RescheduleDone {
  ketQua: 'DaDoi';
  lichHenMoi: { maLichHen: string; thoiGian: string; trangThai: string };
  lichHenCu: { maLichHen: string };
  thoiGianMayChu: string;
}

// Khoá tuỳ chọn: vắng hoặc chuỗi (`null`, số, đối tượng ⇒ không dùng được: hợp đồng chỉ có "vắng")
export function readOptionalText(value: unknown): string | undefined {
  return value === undefined ? undefined : readText(value);
}

export function parseRescheduleCurrent(raw: unknown): RescheduleCurrent {
  const current = readRecord(raw);
  return {
    thoiGian: readIsoDateTime(current.thoiGian),
    bacSiId: readId(current.bacSiId),
  };
}

export function parseRescheduleCandidate(
  raw: unknown,
): RescheduleCandidate | null {
  if (raw === null) return null;
  const row = readRecord(raw);
  const reason = readOptionalText(row.lyDoKhongHopLe);
  return {
    khungGioId: readId(row.khungGioId),
    thoiGian: readIsoDateTime(row.thoiGian),
    hopLe: readFlag(row.hopLe),
    ...(reason === undefined ? {} : { lyDoKhongHopLe: reason }),
  };
}

// Mã lịch hẹn đi vào URL điều hướng: chỉ nhận đúng dạng mà luồng đặt lịch cũng nhận (`APPOINTMENT_CODE`)
function readAppointmentCode(value: unknown): string {
  const text = readText(value);
  return APPOINTMENT_CODE.test(text) ? text : unusableResponse();
}

// `body.ketQua` đã được nơi gọi kiểm là `DaDoi`
export function parseRescheduleDone(
  body: Record<string, unknown>,
): RescheduleDone {
  const created = readRecord(body.lichHenMoi);
  const replaced = readRecord(body.lichHenCu);
  return {
    ketQua: 'DaDoi',
    lichHenMoi: {
      maLichHen: readAppointmentCode(created.maLichHen),
      thoiGian: readIsoDateTime(created.thoiGian),
      trangThai: readText(created.trangThai),
    },
    lichHenCu: { maLichHen: readAppointmentCode(replaced.maLichHen) },
    thoiGianMayChu: readIsoDateTime(body.thoiGianMayChu),
  };
}
