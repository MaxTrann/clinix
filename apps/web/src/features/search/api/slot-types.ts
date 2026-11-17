// Hình dạng JSON của `GET /public/doctor-slots` (search PR-C1, PLAN search 5.6; đối chiếu `public-slot.dto.ts` và e2e KGC-43 của C1).
// Id (`bacSiId`, `khungGioId`) là BIGINT dạng CHUỖI: không bao giờ ép sang `number` (id lớn hơn 2^53 sẽ trỏ nhầm).

// `NghiPhep` của backend đã được gộp vào `KhongCoLich` ở API công khai (Đại chọn 17/11/2026): web chỉ có ba giá trị này.
export const SLOT_DAY_STATUSES = [
  'CoLich',
  'KhongCoLich',
  'ChiNhanhNghi',
] as const;
export type SlotDayStatus = (typeof SLOT_DAY_STATUSES)[number];

// Trạng thái ô do MÁY CHỦ tính (đã xét hết hạn giữ chỗ và quá giờ theo giờ Việt Nam); web không tự suy lại.
export const SLOT_STATUSES = [
  'ConTrong',
  'DangGiuCho',
  'DaDat',
  'HetHan',
] as const;
export type SlotStatus = (typeof SLOT_STATUSES)[number];

// `CaToi` có trong enum của backend nhưng reader hiện ẩn ô ca tối; bộ đọc vẫn nhận để một giá trị hợp lệ không làm hỏng cả trang.
export const SLOT_SHIFTS = ['CaSang', 'CaChieu', 'CaToi'] as const;
export type SlotShift = (typeof SLOT_SHIFTS)[number];

export interface PublicSlot {
  khungGioId: string;
  // ISO 8601 UTC; hiển thị bằng múi giờ `Asia/Ho_Chi_Minh`
  batDau: string;
  ketThuc: string;
  ca: SlotShift;
  trangThai: SlotStatus;
}

export interface DoctorDaySlots {
  bacSiId: string;
  trangThaiNgay: SlotDayStatus;
  // Thứ ISO 1 (Thứ Hai) đến 7 (Chủ nhật); chỉ có khi `ChiNhanhNghi`
  thuNghi?: number;
  khungGio: PublicSlot[];
}

export interface DoctorSlotsQuery {
  bacSiIds: readonly string[];
  // YYYY-MM-DD, trong [hôm nay, hôm nay + 6] giờ Việt Nam
  ngay: string;
}

// Kết quả đã kiểm: đúng MỘT phần tử cho mỗi id đã hỏi
export type DoctorSlotsById = ReadonlyMap<string, DoctorDaySlots>;

// Mã trường lỗi 400 của `ngay` (`BO_LOC_KHONG_HOP_LE` kèm `loi[]`): web xử lý riêng bằng nút "Xem lịch hôm nay"
export const SLOT_DATE_ERROR_CODES = [
  'NGAY_KHONG_HOP_LE',
  'NGAY_NGOAI_KHOANG',
] as const;
