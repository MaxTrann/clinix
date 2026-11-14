import { toSingleLine } from '../../mail/mail-safety.js';
import { BOOKING_NOTIFICATION_EVENTS } from '../appointments.constants.js';
import type { AppointmentEvent } from '../ports/appointment-notifier.port.js';
import { formatVnd, isZeroMoney } from './mail-format.js';
import type { NotificationContext } from './notification-context.query.js';

// Chữ của `thong_bao.noi_dung` cho bốn sự kiện của booking (task B15; PLAN booking 5.12; TRACKING 3.37 B15-F: phương án P đã duyệt). Hàm THUẦN, không đọc DB.
//
// `noi_dung` là bản ghi bất biến của sự kiện: thư (worker, giai đoạn sau) dựng bảng dữ liệu từ DB lúc gửi nhưng IN NGUYÊN `noi_dung` ở ô lưu ý của thư huỷ, vì biến thể huỷ (`reason`) và số "hoàn dự kiến"
// chỉ có ở sự kiện lúc đó, không suy ngược được từ `lich_hen` (`ly_do_huy` là chữ tự do). Chữ biến thể và câu hoàn là `[đề xuất]` (Figma `676:2` chỉ vẽ MỘT biến thể).
//
// An toàn (TB-02, H10): ≤ 500 ký tự, MỘT dòng, không ký tự điều khiển. KHÔNG có lý do khám, lý do huỷ tự do hay SĐT: hàm chỉ nhận `NotificationContext` (không có ba thứ đó) và số liệu của sự kiện.

/** Độ dài tối đa của `thong_bao.noi_dung` (`varchar(500)`). */
export const NOTIFICATION_MAX_LENGTH = 500;

type CancelFacts = NonNullable<AppointmentEvent['huy']>;

export type NotificationTextInput =
  | {
      loai: typeof BOOKING_NOTIFICATION_EVENTS.CONFIRMED;
      context: NotificationContext;
    }
  | {
      loai: typeof BOOKING_NOTIFICATION_EVENTS.CANCELLED;
      context: NotificationContext;
      /** Thiếu (người gọi cũ hay bản Fake của test) thì dùng câu trung tính, không khẳng định ai huỷ và không nói tiền */
      huy?: CancelFacts | undefined;
    }
  | {
      loai:
        | typeof BOOKING_NOTIFICATION_EVENTS.NO_SHOW
        | typeof BOOKING_NOTIFICATION_EVENTS.NO_SHOW_LOCK;
      context: NotificationContext;
      soLan: number;
      nguong: number;
    };

// Ba biến thể theo `reason` (PLAN Q30: LeTanHuy và QtvOverride CÙNG biến thể "Phòng khám điều chỉnh")
function cancelSentence(ma: string, reason: CancelFacts['reason']): string {
  switch (reason) {
    case 'BenhNhanHuy':
      return `Lịch hẹn ${ma} đã được hủy theo yêu cầu của bạn.`;
    case 'LeTanHuy':
    case 'QtvOverride':
      return `Lịch hẹn ${ma} đã được phòng khám điều chỉnh và hủy.`;
    case 'BacSiNghiPhep':
      return `Lịch hẹn ${ma} đã bị hủy do bác sĩ nghỉ phép.`;
  }
}

// Câu hoàn tiền (Q18): `hoanCoc` là số TÍNH lúc huỷ, nên chữ là "dự kiến"; thư hoàn tiền thực tế là của `wallet`.
function refundSentence(hoanCoc: CancelFacts['hoanCoc']): string {
  if (hoanCoc === null)
    return 'Lịch hẹn này chưa phát sinh khoản thanh toán nên không có hoàn tiền.';
  if (hoanCoc.tyLe === 0 || isZeroMoney(hoanCoc.soTien))
    return 'Theo chính sách hoàn tiền, khoản cọc không được hoàn.';
  return `Hoàn dự kiến ${formatVnd(hoanCoc.soTien)} VNĐ (${String(hoanCoc.tyLe)}% tiền cọc).`;
}

/** `noi_dung` của sự kiện: một dòng, ≤ `NOTIFICATION_MAX_LENGTH`. Mọi chữ lấy từ DB đi qua `toSingleLine` TRƯỚC khi ghép vào câu. */
export function buildNotificationText(input: NotificationTextInput): string {
  const ctx = input.context;
  const ma = toSingleLine(ctx.maLichHen, 20);
  let text: string;
  switch (input.loai) {
    case BOOKING_NOTIFICATION_EVENTS.CONFIRMED:
      text = `Lịch hẹn ${ma} đã được xác nhận: ${toSingleLine(ctx.dichVu)} với bác sĩ ${toSingleLine(ctx.tenBacSi)} lúc ${ctx.gio} ngày ${ctx.ngay} tại ${toSingleLine(ctx.chiNhanh)}.`;
      break;
    case BOOKING_NOTIFICATION_EVENTS.CANCELLED:
      text =
        input.huy === undefined
          ? `Lịch hẹn ${ma} đã bị hủy.`
          : `${cancelSentence(ma, input.huy.reason)} ${refundSentence(input.huy.hoanCoc)}`;
      break;
    case BOOKING_NOTIFICATION_EVENTS.NO_SHOW:
      text = `Bạn đã vắng mặt tại lịch hẹn ${ma} (lần thứ ${String(input.soLan)}). Từ ${String(input.nguong)} lần vắng mặt, tài khoản sẽ bị hạn chế đặt lịch online.`;
      break;
    case BOOKING_NOTIFICATION_EVENTS.NO_SHOW_LOCK:
      text = `Tài khoản của bạn đã bị hạn chế đặt lịch online do vắng mặt ${String(input.soLan)} lần (ngưỡng ${String(input.nguong)} lần). Đây không phải khóa đăng nhập tài khoản.`;
      break;
  }
  return toSingleLine(text, NOTIFICATION_MAX_LENGTH);
}
