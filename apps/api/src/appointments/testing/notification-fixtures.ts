import type { AppointmentEvent } from '../ports/appointment-notifier.port.js';
import type { NotificationContext } from '../notifications/notification-context.query.js';

// Dữ liệu dựng sẵn DÙNG CHUNG cho test ĐƠN VỊ của B15 (task B15; PLAN booking 7.43 `[đề xuất]`): một `NotificationContext` hợp lệ cùng sự kiện mẫu của bốn loại, để các spec của `notifications/` không chép cùng một đoạn
// dữ liệu (jscpd tính cả file test). Không DB. Mọi giá trị là MINH HOẠ cho test; địa chỉ email dùng tên miền `example.test`, không có thật.

export const MA_LICH_HEN = 'CLX-20261110-0042';
export const LICH_HEN_ID = '41';
/** Tài khoản ĐẶT lịch (người nhận thông báo) */
export const TAI_KHOAN_DAT = '77';

export function contextOf(
  override: Partial<NotificationContext> = {},
): NotificationContext {
  return {
    maLichHen: MA_LICH_HEN,
    ngay: '10/11/2026',
    gio: '09:30',
    thu: 3,
    giaSnapshot: '350000.00',
    tienCocSnapshot: '100000.00',
    datHo: false,
    nguoiDuocKham: 'Nguyễn Văn An',
    chucDanh: 'TS_BS',
    tenBacSi: 'Nguyễn Thị Hương',
    chuyenKhoa: 'Nội tổng quát',
    dichVu: 'Khám nội tổng quát',
    chiNhanh: 'CLINIX Clinic Q.3',
    diaChiChiNhanh: '123 Nguyễn Thị Minh Khai, Q.3, TP.HCM',
    tenNguoiDat: 'Nguyễn Văn An',
    emailNguoiDat: 'nguoi.dat@example.test',
    ...override,
  };
}

/** Sự kiện mẫu của loại `loaiSuKien` cho lịch `LICH_HEN_ID` và tài khoản đặt `TAI_KHOAN_DAT`; `extra` thêm `huy` hay `daThu`. */
export function eventOf(
  loaiSuKien: AppointmentEvent['loaiSuKien'],
  extra: Partial<Pick<AppointmentEvent, 'huy' | 'daThu'>> = {},
): AppointmentEvent {
  return {
    loaiSuKien,
    lichHenId: LICH_HEN_ID,
    taiKhoanId: TAI_KHOAN_DAT,
    ...extra,
  };
}

/** Lỗi MySQL 1062 giả như driver trả, nêu TÊN KHOÁ trong `sqlMessage` (như MySQL 8.4); `key` rỗng ⇒ không có `sqlMessage`. */
export function duplicateEntryError(key: string | null): Error {
  return Object.assign(new Error('lỗi MySQL giả'), {
    errno: 1062,
    code: 'ER_DUP_ENTRY',
    ...(key === null
      ? {}
      : {
          sqlMessage: `Duplicate entry '41-77-LichHenDaHuy' for key '${key}'`,
        }),
  });
}

/** Lỗi khoá ngoại 1452 giả: chèn hàng con thiếu cha. */
export function foreignKeyError(): Error {
  return Object.assign(new Error('lỗi MySQL giả'), {
    errno: 1452,
    code: 'ER_NO_REFERENCED_ROW_2',
  });
}
