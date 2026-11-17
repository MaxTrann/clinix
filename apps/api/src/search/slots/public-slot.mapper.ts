import type {
  AvailableSlot,
  DoctorDaySlots,
} from '../../scheduling/slots/available-slots.reader.js';
import type { DayStatus } from '../../scheduling/slots/slot-status.rules.js';
import type {
  PublicDayStatus,
  PublicDoctorSlots,
  PublicSlot,
} from './public-slot.dto.js';

// Hàm thuần: kết quả của `AvailableSlotsReader` ⇒ dạng công khai (PLAN search 5.6). Chọn TỪNG TRƯỜNG (danh sách trắng), không `...spread`,
// để trường nào reader thêm sau này (id lịch hẹn, hạn giữ chỗ, lý do nghỉ phép…) không tự lọt ra công khai.

/** `NghiPhep` ⇒ `KhongCoLich`: khách không cần (và không được) biết bác sĩ đang xin nghỉ phép, kể cả đơn `ChoDuyet` (Đại chọn 17/11/2026). */
const toPublicDayStatus = (status: DayStatus): PublicDayStatus =>
  status === 'NghiPhep' ? 'KhongCoLich' : status;

const toPublicSlot = (slot: AvailableSlot): PublicSlot => ({
  khungGioId: slot.khungGioId,
  batDau: slot.batDau,
  ketThuc: slot.ketThuc,
  ca: slot.ca,
  trangThai: slot.trangThai,
});

export function toPublicDay(day: DoctorDaySlots): PublicDoctorSlots {
  const trangThaiNgay = toPublicDayStatus(day.trangThaiNgay);
  return {
    bacSiId: day.bacSiId,
    trangThaiNgay,
    // `thuNghi` chỉ đi cùng `ChiNhanhNghi` (giờ nhận khám của chi nhánh vốn đã công khai).
    ...(trangThaiNgay === 'ChiNhanhNghi' &&
      day.thuNghi !== undefined && { thuNghi: day.thuNghi }),
    khungGio: day.khungGio.map(toPublicSlot),
  };
}

/** Phần tử cho bác sĩ không công khai hoặc không tồn tại: MỘT dạng duy nhất, để không ai dò được id (cùng thân với "không có lịch"). */
export const unavailableDoctor = (bacSiId: string): PublicDoctorSlots => ({
  bacSiId,
  trangThaiNgay: 'KhongCoLich',
  khungGio: [],
});

/**
 * Ghép đúng một phần tử cho MỖI id, theo thứ tự `ids`. `days` chỉ có bác sĩ công khai (service không gọi reader với id ẩn),
 * nên id nào thiếu trong `days` (ẩn hoặc không tồn tại) nhận `unavailableDoctor`.
 */
export function assembleItems(
  ids: readonly string[],
  days: readonly DoctorDaySlots[],
): PublicDoctorSlots[] {
  const byId = new Map(days.map((day) => [day.bacSiId, day]));
  return ids.map((id) => {
    const day = byId.get(id);
    return day ? toPublicDay(day) : unavailableDoctor(id);
  });
}
