// Hằng của API gợi ý đặt lịch (chatbot B4; PLAN chatbot 5.11, 5.12, MH4). File này KHÔNG import gì.

/** Số bác sĩ tối đa trả về (PLAN 5.11 bước 7, MH4). */
export const MAX_DOCTORS = 5;

/** Số ô giờ tối đa mỗi bác sĩ: các ô SỚM NHẤT của ngày được chọn (PLAN 5.11 bước 7, MH4). */
export const MAX_SLOTS_PER_DOCTOR = 6;

/** Ứng viên lấy từ `PublicDoctorService.list`: một trang, đúng trần `pageSize` của dịch vụ đó (PLAN 5.11 bước 3). */
export const CANDIDATE_LIMIT = 100;

/** Mã của MỘT trường sai trong `loi[{truong, ma}]` mà search chưa có (`ca` ngoài `CaSang`, `CaChieu`, `CaToi`). */
export const SUGGEST_FIELD_CODES = {
  INVALID_SHIFT: 'CA_KHONG_HOP_LE',
} as const;

/** Lý do danh sách rỗng (PLAN 5.12, 2.4.7 A5): có bác sĩ mà không ô nào hay không có bác sĩ nào. */
export const EMPTY_REASONS = ['KhongCoKhungGio', 'KhongCoBacSi'] as const;
