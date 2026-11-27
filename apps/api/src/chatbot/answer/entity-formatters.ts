import type { RefundTierView } from '../../appointments/create/refund-policy.js';
import { toCents } from '../../pricing/money.js';
import {
  buildWeeklySchedule,
  type ScheduleRow,
  type WeekdayView,
} from '../../search/common/weekly-schedule.view.js';

// Chữ do MÁY CHỦ dựng cho từng loại chỗ giữ (chatbot B2; PLAN chatbot 5.7; chữ `[đề xuất]`, Đại duyệt khi review). Hàm thuần: không DB.
// Mọi chữ số trong kết quả đến từ DB (giá, giờ, mốc), không bao giờ từ mô hình, nên luật V3 không áp lên đây.

// Nhãn chức danh sao từ `apps/web/src/features/search/format/doctor-title.ts` (API không import web). Nợ đồng bộ: ghi ở TRACKING (phiên kiểm duyệt 27/11/2026).
const TITLE_LABELS: ReadonlyMap<string, string> = new Map([
  ['BS', 'BS'],
  ['BS_CKI', 'BS.CKI'],
  ['BS_CKII', 'BS.CKII'],
  ['ThS_BS', 'ThS.BS'],
  ['TS_BS', 'TS.BS'],
  ['PGS_TS_BS', 'PGS.TS.BS'],
  ['GS_TS_BS', 'GS.TS.BS'],
]);

/** "ThS.BS. Nguyễn Minh Anh" nhưng "BS.CKII Trần Quốc Huy" (không chấm sau số La Mã, như Figma). Mã lạ hiện nguyên mã. */
export function formatDoctorName(chucDanh: string, hoTen: string): string {
  const label = TITLE_LABELS.get(chucDanh) ?? chucDanh;
  return /CKI{1,2}$/.test(label) ? `${label} ${hoTen}` : `${label}. ${hoTen}`;
}

const groupThousands = (digits: string): string =>
  digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** "350000.00" thành "350.000 đồng"; có lẻ thì "350.000,50 đồng". Chuỗi không phải số tiền không âm thì ném lỗi (như `toCents`). */
export function formatMoney(amount: string): string {
  const cents = toCents(amount);
  const dong = groupThousands((cents / 100n).toString());
  const fraction = cents % 100n;
  return fraction === 0n
    ? `${dong} đồng`
    : `${dong},${fraction.toString().padStart(2, '0')} đồng`;
}

export const formatFromPrice = (amount: string): string =>
  `từ ${formatMoney(amount)}`;

export const formatMinutes = (minutes: number): string => `${minutes} phút`;
export const formatTimes = (times: number): string => `${times} lần`;

const DAY_NAMES = [
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
  'Chủ Nhật',
] as const;

function hoursOfDay(day: WeekdayView): string {
  const parts = [day.hoatDong?.sang, day.hoatDong?.chieu]
    .filter((range) => range !== null && range !== undefined)
    .map((range) => `${range.tu} đến ${range.den}`);
  return parts.length === 0 ? 'nghỉ' : parts.join(' và ');
}

/** Giờ nhận khám cả tuần, gộp các thứ liền nhau cùng giờ: "Thứ Hai đến Thứ Sáu: 07:30 đến 11:30 và 13:30 đến 17:00; Thứ Bảy: …; Chủ Nhật: nghỉ". */
export function formatWeeklyHours(rows: readonly ScheduleRow[]): string {
  const days = buildWeeklySchedule(rows);
  const runs: { first: number; last: number; hours: string }[] = [];
  days.forEach((day, index) => {
    const hours = hoursOfDay(day);
    const current = runs[runs.length - 1];
    if (current?.hours === hours) current.last = index;
    else runs.push({ first: index, last: index, hours });
  });
  return runs
    .map(({ first, last, hours }) => {
      const label =
        first === last
          ? DAY_NAMES[first]
          : `${DAY_NAMES[first]} đến ${DAY_NAMES[last]}`;
      return `${label}: ${hours}`;
    })
    .join('; ');
}

/**
 * Mốc hoàn của dịch vụ. `null` là dịch vụ không đặt cọc (không có chính sách); `[]` là có cọc mà chưa có mốc (không hoàn);
 * còn lại sắp theo số giờ GIẢM DẦN rồi nêu từng khoảng. Quá giờ hẹn luôn không hoàn (`refund-calculator.ts`).
 */
export function formatRefundTiers(
  tiers: readonly RefundTierView[] | null,
): string {
  if (tiers === null) return 'không áp dụng vì dịch vụ không đặt cọc';
  if (tiers.length === 0) return 'không hoàn cọc';
  const sorted = [...tiers].sort(
    (a, b) => b.soGioTruocToiThieu - a.soGioTruocToiThieu,
  );
  const parts = sorted.map((tier, index) => {
    const hours = tier.soGioTruocToiThieu;
    const rate = `${tier.tyLeHoan}%`;
    if (index === 0) {
      return hours > 0
        ? `hủy trước giờ hẹn ít nhất ${hours} giờ hoàn ${rate}`
        : `hủy trước giờ hẹn hoàn ${rate}`;
    }
    const upper = sorted[index - 1]?.soGioTruocToiThieu ?? hours;
    return hours > 0
      ? `hủy từ ${hours} đến dưới ${upper} giờ trước giờ hẹn hoàn ${rate}`
      : `hủy trong vòng dưới ${upper} giờ trước giờ hẹn hoàn ${rate}`;
  });
  const lowest = sorted[sorted.length - 1]?.soGioTruocToiThieu ?? 0;
  if (lowest > 0) {
    parts.push(`hủy trong vòng dưới ${lowest} giờ trước giờ hẹn không hoàn`);
  }
  parts.push('đã quá giờ hẹn thì không hoàn');
  return parts.join('; ');
}
