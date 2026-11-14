import { fromCents, toCents } from '../../pricing/money.js';
import type {
  ChucDanh,
  NotificationContext,
} from './notification-context.query.js';

// Định dạng chữ dùng chung cho `noi_dung` của thông báo và (giai đoạn sau) bốn mẫu thư của B15. Hàm thuần.

/**
 * Số tiền decimal dạng chuỗi ⇒ chữ có dấu chấm ngăn nghìn: "350000.00" ⇒ "350.000". Có phần lẻ thì thêm dấu phẩy: "350000.50" ⇒ "350.000,50".
 * Dựa vào `toCents` của `pricing/money.ts` (BigInt, không số thực; chuỗi không phải số tiền không âm thì ném lỗi), không tự tách chuỗi.
 */
export function formatVnd(amount: string): string {
  const cents = toCents(amount);
  const whole = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fraction = (cents % 100n).toString().padStart(2, '0');
  return fraction === '00' ? whole : `${whole},${fraction}`;
}

/** Số tiền bằng 0 ("0", "0.00", "000.0")? Chỉ nhìn chữ số, không đổi sang số thực. */
export function isZeroMoney(amount: string): boolean {
  return toCents(amount) === 0n;
}

const WEEKDAYS = [
  'Chủ Nhật',
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
] as const;

/** "Thứ Ba, 10/11/2026 — 09:30" (như Figma). `thu` theo `DAYOFWEEK` của MySQL (1 = Chủ nhật); ngày và giờ đã ở giờ Việt Nam. */
export function formatAppointmentTime(
  context: Pick<NotificationContext, 'thu' | 'ngay' | 'gio'>,
): string {
  const weekday = WEEKDAYS[context.thu - 1];
  if (weekday === undefined)
    throw new RangeError(`thứ trong tuần không hợp lệ: ${String(context.thu)}`);
  return `${weekday}, ${context.ngay} — ${context.gio}`;
}

// Chữ viết tắt của chức danh `[đề xuất]` (mã chưa có bảng chữ; Figma chỉ có "TS.BS.")
const DOCTOR_TITLES: Readonly<Record<ChucDanh, string>> = {
  BS: 'BS.',
  BS_CKI: 'BS.CKI',
  BS_CKII: 'BS.CKII',
  ThS_BS: 'ThS.BS.',
  TS_BS: 'TS.BS.',
  PGS_TS_BS: 'PGS.TS.BS.',
  GS_TS_BS: 'GS.TS.BS.',
};

/** "TS.BS. Nguyễn Thị Hương". */
export function formatDoctorName(chucDanh: ChucDanh, ten: string): string {
  return `${DOCTOR_TITLES[chucDanh]} ${ten}`;
}

/** Giá trừ cọc, không âm (cọc lớn hơn giá thì còn lại 0, không bao giờ in số âm), cùng phép tính tiền BigInt của `pricing/money.ts`. */
export function remainingAfterDeposit(price: string, deposit: string): string {
  const total = toCents(price);
  const paid = toCents(deposit);
  return fromCents(total > paid ? total - paid : 0n);
}
