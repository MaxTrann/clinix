// Nhãn trạng thái và giờ Việt Nam của lịch hẹn đang chặn việc ngừng sử dụng hồ sơ (patient F7; TRACKING F7-G). Hàm thuần.

// Ba mã mà API (B5) trả ở `chiTiet[].trangThai`; nhãn là [đề xuất], chờ nhóm duyệt
const STATUS_LABELS: Readonly<Record<string, string>> = {
  ChoThanhToan: 'Chờ thanh toán',
  DaXacNhan: 'Đã xác nhận',
  DaTiepDon: 'Đã tiếp đón',
};

// Mã lạ: mọi lịch trong danh sách chặn đều "chưa hoàn tất" (câu 5.9), nên nhãn này vẫn đúng và không làm vỡ trang
export const UNKNOWN_STATUS_LABEL = 'Chưa hoàn tất';

export function appointmentStatusLabel(code: string): string {
  // `Object.hasOwn`: `code` do máy chủ gửi, không để `constructor` hay `toString` lọt vào bảng nhãn
  return Object.hasOwn(STATUS_LABELS, code)
    ? STATUS_LABELS[code]
    : UNKNOWN_STATUS_LABEL;
}

// `hourCycle: 'h23'` (không dùng `hour12: false`: một số bản ICU ra "24:30" lúc nửa đêm)
const VIETNAM_DATE_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// ISO 8601 UTC (`2026-11-02T01:00:00.000Z`) ⇒ `dd/mm/yyyy HH:mm` theo giờ Việt Nam, KHÔNG theo múi giờ của máy.
// Chuỗi không phải ngày hợp lệ thì `Intl` ném RangeError: nơi gọi đã kiểm bằng `isIsoDateTime` ở `parseBlockingAppointments`.
export function formatVietnamDateTime(iso: string): string {
  const parts: Record<string, string> = {};
  for (const part of VIETNAM_DATE_TIME.formatToParts(new Date(iso))) {
    parts[part.type] = part.value;
  }
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

// Dạng máy chủ trả (`Date.toISOString()`): có phần giờ, và là một thời điểm có thật
const ISO_DATE_TIME = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}/;
export function isIsoDateTime(value: string): boolean {
  return ISO_DATE_TIME.test(value) && !Number.isNaN(Date.parse(value));
}
