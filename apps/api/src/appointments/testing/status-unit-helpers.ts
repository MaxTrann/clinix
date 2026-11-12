import type { DataSource } from 'typeorm';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { SlotHoldService } from '../slots/slot-hold.service.js';
import { AppointmentTransitionService } from '../state/appointment-transition.service.js';
import type { StatusConfig } from '../state/status-config.js';
import { FakeAppointmentNotifier, FakeWaitlistPort } from './fake-ports.js';

// Dữ liệu và dựng dịch vụ DÙNG CHUNG cho test ĐƠN VỊ của `checkIn` và `markNoShow` (task B12; TRACKING 3.26 B12-H: CKI-01…CKI-05, NSH-01…NSH-08), để hai spec không chép cùng một đoạn dựng (jscpd tính cả
// file test). Không DB: `ScriptedEntityManager` trả lời theo câu SQL; ca MySQL thật nằm ở `*.int-spec.ts`.

export const LICH_HEN_ID = '41';
/** Tài khoản ĐẶT của lịch (nhận thông báo, bị cộng no-show) */
export const BENH_NHAN_ID = '77';
export const CHI_NHANH_ID = '2';
export const KHAC_CHI_NHANH_ID = '3';

const MINUTE = 60_000;
export const SECOND = 1000;
/** Giờ hẹn: 08:00 ngày 10/11/2026 (giờ Việt Nam). `lockAppointment` đọc `thoi_gian` dạng chuỗi này */
export const THOI_GIAN = new Date('2026-11-10T08:00:00+07:00');
export const THOI_GIAN_TEXT = '2026-11-10 08:00:00';

/** Cấu hình minh hoạ: cửa sổ tiếp đón từ 30 phút trước đến 15 phút sau giờ hẹn, ngưỡng no-show 3 */
export const CONFIG: StatusConfig = {
  checkInTruocPhut: 30,
  checkInSauPhut: 15,
  nguongNoShow: 3,
};
/** Hai đầu cửa sổ (đóng hai đầu, Q22) */
export const TU = new Date(THOI_GIAN.getTime() - 30 * MINUTE);
export const DEN = new Date(THOI_GIAN.getTime() + 15 * MINUTE);

/** Hàng `lich_hen` đọc dưới khoá, đúng hình dạng câu `lockAppointment` trả (cột `thoiGian` là chuỗi `DATE_FORMAT`) */
export function lockedRows(
  trangThai: TrangThaiLichHen,
  overrides: { chiNhanhId?: string; benhNhanId?: string } = {},
): unknown[] {
  return [
    {
      benhNhanId: overrides.benhNhanId ?? BENH_NHAN_ID,
      chiNhanhId: overrides.chiNhanhId ?? CHI_NHANH_ID,
      trangThai,
      thoiGian: THOI_GIAN_TEXT,
      chinhSachHoan: null,
    },
  ];
}

/** Câu SQL có đọc, ghi hay khoá BẢNG `table` (tên cột như `khung_gio_id`, `benh_nhan_id` KHÔNG tính) */
export const touchesTable = (sql: string, table: string): boolean =>
  new RegExp(
    String.raw`\b(?:FROM|UPDATE|JOIN|INTO)\s+\x60?${table}\x60?(?!\w)`,
    'i',
  ).test(sql);

/** Bảy trạng thái của lịch hẹn trừ `except` */
export const statesExcept = (
  ...except: TrangThaiLichHen[]
): TrangThaiLichHen[] =>
  (
    [
      'ChoThanhToan',
      'DaXacNhan',
      'DaTiepDon',
      'HoanThanh',
      'DaHuy',
      'VangMat',
      'DaDoiLich',
    ] as TrangThaiLichHen[]
  ).filter((state) => !except.includes(state));

/** Dịch vụ thật với cổng giả (`DataSource` không dùng: hai phương thức họ B không mở giao dịch) */
export function newTransition() {
  const waitlist = new FakeWaitlistPort();
  const notifier = new FakeAppointmentNotifier();
  const service = new AppointmentTransitionService(
    {} as unknown as DataSource,
    new SlotHoldService(),
    waitlist,
    notifier,
  );
  return { service, waitlist, notifier };
}
