import type { CaLamViec } from '../../admin/entities/enums.js';
import { DEMO_DOCTORS } from './search-demo-data.js';

// Dữ liệu demo cho module doctor (task B18, D9/Q39). Toàn bộ là minh họa [đề xuất], không phải quyết định nghiệp vụ.

/** Số ngày phân công, tính từ NGÀY MAI (không phân công cho hôm nay để khỏi vướng ca đã kết thúc). */
export const DEMO_DAYS = 14;

/** Bác sĩ của dev-accounts; bác sĩ của search-demo lấy theo `DEMO_DOCTORS` đang hoạt động. */
export const DEV_DOCTOR_EMAIL = 'doctor@example.invalid';
/** Người xử lý yêu cầu nghỉ mẫu đã duyệt. */
export const DEV_ADMIN_EMAIL = 'admin.system@example.invalid';

export const DEMO_DOCTOR_EMAILS: readonly string[] = [
  DEV_DOCTOR_EMAIL,
  ...DEMO_DOCTORS.filter((d) => d.active).map((d) => d.email),
];

export interface DemoLeave {
  email: string;
  trangThai: 'ChoDuyet' | 'DaDuyet';
  /** Chọn ngày nghỉ là ngày có ca đầu tiên từ "ngày mai + offsetNgay" trở đi. */
  offsetNgay: number;
  hinhThucNghi: 'CaNgay' | 'TheoCa';
  /** Chỉ dùng khi TheoCa; không có ca đó thì lấy ca bất kỳ của ngày. */
  ca?: CaLamViec;
  /** Dấu nhận diện ổn định: khoá để chạy lại không tạo thêm (không phụ thuộc ngày chạy). */
  lyDo: string;
}

export const DEMO_LEAVES: readonly DemoLeave[] = [
  {
    email: DEV_DOCTOR_EMAIL,
    trangThai: 'ChoDuyet',
    offsetNgay: 3,
    hinhThucNghi: 'CaNgay',
    lyDo: '[Mẫu doctor-demo] Nghỉ cả ngày vì việc gia đình (dữ liệu minh họa).',
  },
  {
    email: 'bacsi01@example.com',
    trangThai: 'DaDuyet',
    offsetNgay: 5,
    hinhThucNghi: 'TheoCa',
    ca: 'CaChieu',
    lyDo: '[Mẫu doctor-demo] Nghỉ ca chiều dự hội thảo (dữ liệu minh họa).',
  },
];
