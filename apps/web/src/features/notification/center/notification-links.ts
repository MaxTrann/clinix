import type { VaiTro } from '../../auth';
import { ADMIN_APPROVALS_PATH, DOCTOR_PATHS } from '../../doctor';
import {
  PATIENT_APPOINTMENTS_PATH,
  adminAppointmentDetailPath,
  doctorAppointmentDetailPath,
  patientAppointmentDetailPath,
  receptionAppointmentDetailPath,
} from '../../../shared/routes/booking-paths';
import {
  ADMIN_WITHDRAWALS_PATH,
  PATIENT_WALLET_PATH,
} from '../../../shared/routes/wallet-paths';
import type { NotificationLink } from '../api/notification-types';

// Bảng (kiểu liên kết × vai trò) ⇒ đường dẫn của nút trong panel chi tiết (notification F2, PLAN 5.10; WTB-11). Đường dẫn lấy từ `shared/routes` và từ
// `features/doctor/index.ts` (nghỉ phép, Duyệt yêu cầu: hằng của module doctor), không viết cứng. Ô không có đích ⇒ `null` (không hiện nút).
// Trang đích tự xử lý 404 (lịch đã bị xoá hay không thuộc phạm vi).

type LinkTable = {
  [K in NotificationLink['kieu']]: Partial<
    Record<VaiTro, (link: Extract<NotificationLink, { kieu: K }>) => string>
  >;
};

const LINKS: LinkTable = {
  LichHen: {
    BenhNhan: (link) => patientAppointmentDetailPath(link.maLichHen),
    LeTan: (link) => receptionAppointmentDetailPath(link.maLichHen),
    BacSi: (link) => doctorAppointmentDetailPath(link.maLichHen),
    QuanTriVien: (link) => adminAppointmentDetailPath(link.maLichHen),
  },
  Vi: {
    BenhNhan: () => PATIENT_WALLET_PATH,
    // `[đề xuất]` của PLAN 5.10: trang tài chính ví mở ở tab "Yêu cầu rút tiền"
    QuanTriVien: () => ADMIN_WITHDRAWALS_PATH,
  },
  NghiPhep: {
    BacSi: () => DOCTOR_PATHS.leave,
    QuanTriVien: () => ADMIN_APPROVALS_PATH,
  },
  // Quản trị viên: "trang chi nhánh" của PLAN 5.10 chưa có hằng đường dẫn chung `[cần điền]` (notification F3 chốt cùng khung Admin)
  ThayDoiChiNhanh: {
    BenhNhan: () => PATIENT_APPOINTMENTS_PATH,
  },
};

export function notificationLinkPath(
  link: NotificationLink | null,
  vaiTro: VaiTro,
): string | null {
  if (link === null) return null;
  const build = LINKS[link.kieu][vaiTro] as
    ((value: NotificationLink) => string) | undefined;
  return build ? build(link) : null;
}
