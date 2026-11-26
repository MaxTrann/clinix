import type { CaLamViec } from '../../admin/entities/enums.js';
import type { VaiTro } from '../../notification/catalog/notification-catalog.js';

// Dữ liệu demo cho scope "Thông báo" (notification X3; PLAN notification 5.12 "Dữ liệu mẫu"). Toàn bộ là minh họa [đề xuất]. Test tự động KHÔNG dùng seed này.

/** Tiền tố nhận diện dòng `thong_bao` do seed ghi: để chạy lại biết đã có bao nhiêu dòng, và để người xem phân biệt với thông báo thật. */
export const NOTIFICATION_DEMO_PREFIX = '[Mẫu notification-demo]';

/** Số thông báo mẫu mỗi tài khoản: hơn một trang (20) để thấy phân trang và hai tab (PLAN 5.12: ít nhất 25). */
export const NOTIFICATION_DEMO_PER_ACCOUNT = 25;

/** Cứ 3 dòng thì 1 dòng đã đọc (dòng thứ 0, 3, 6…): trộn đọc và chưa đọc để thấy hai tab và số đếm. */
export const isDemoRead = (index: number): boolean => index % 3 === 0;

/**
 * Tài khoản của `dev-accounts` nhận thông báo mẫu, kèm vai trò để chọn mã sự kiện đúng người nhận trong danh mục.
 * KHÔNG có Lễ tân (`receptionist@example.invalid`): danh mục mã (notification B1) chưa có sự kiện nào gửi Lễ tân, nên mọi thông báo mẫu cho Lễ tân đều là sự kiện không bao giờ xảy ra
 * (lệch PLAN 5.12 "mỗi vai trò ít nhất 25" có chủ ý; trang của Lễ tân dùng để kiểm trạng thái rỗng).
 */
export const NOTIFICATION_DEMO_ACCOUNTS: readonly {
  email: string;
  vaiTro: VaiTro;
}[] = [
  { email: 'patient@example.invalid', vaiTro: 'BenhNhan' },
  { email: 'doctor@example.invalid', vaiTro: 'BacSi' },
  { email: 'admin.system@example.invalid', vaiTro: 'QuanTriVien' },
  { email: 'admin.branch@example.invalid', vaiTro: 'QuanTriVien' },
];

/** Bác sĩ và bệnh nhân của lịch mẫu cho nhắc lịch (KTB-07). */
export const REMINDER_DEMO_DOCTOR_EMAIL = 'doctor@example.invalid';
export const REMINDER_DEMO_PATIENT_EMAIL = 'patient@example.invalid';

/** Lịch mẫu cách giờ hẹn ÍT NHẤT 2 giờ 5 phút: với mốc 2 giờ, job nhắc lịch gửi thư khi tới mốc (sau ít nhất 5 phút), không gửi ngay lúc chạy seed. */
export const REMINDER_DEMO_LEAD_MINUTES = 125;
/** Giới hạn trên: quá thì không còn là "khoảng 2 giờ 5 phút" (người kiểm phải chờ quá lâu). */
export const REMINDER_DEMO_MAX_LEAD_MINUTES = 185;

/** Mốc nhắc cần có trong `cau_hinh_he_thong.thoi_diem_nhac_lich` để KTB-07 chạy được. */
export const REMINDER_DEMO_OFFSET_HOURS = 2;

/** Ca được thử theo thứ tự trong NGÀY HÔM NAY (giờ Việt Nam); ca tối không có khung nhận khám (`shiftWindow`). */
export const REMINDER_DEMO_SHIFTS: readonly CaLamViec[] = ['CaSang', 'CaChieu'];

/** Mã lịch mẫu: `CLX-yyyyMMdd-NTFD1` (đúng dạng mã lịch hẹn: 5 ký tự Crockford, không I, L, O, U); một lịch mỗi ngày, chạy lại cùng ngày thì bỏ qua. */
export const reminderDemoCode = (yyyymmdd: string): string =>
  `CLX-${yyyymmdd}-NTFD1`;

export const REMINDER_DEMO_REASON =
  '[Mẫu notification-demo] Khám theo hẹn để thử thư nhắc lịch (dữ liệu minh họa).';
