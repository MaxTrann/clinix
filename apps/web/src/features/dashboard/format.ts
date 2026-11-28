import { formatDate, isoWeekday } from '../../shared/schedule/week';

// Định dạng hiển thị của dashboard (dashboard F1). Chỉ ĐỊNH DẠNG số máy chủ trả, không tính lại (T5).

const WEEKDAY_NAMES = [
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
  'Chủ Nhật',
];

/** 33.3 ⇒ "33,3%"; 100 ⇒ "100,0%"; `null` ⇒ "—" (mẫu số 0). Dấu phẩy thập phân theo tiếng Việt (Figma ghi "0.0%" là chữ mẫu). */
export function formatPercent(value: number | null): string {
  if (value === null) return '—';
  return `${value.toLocaleString('vi-VN', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

/** Số đếm có dấu chấm ngăn nghìn: 12500 ⇒ "12.500". */
export function formatCount(value: number): string {
  return value.toLocaleString('vi-VN');
}

/** "2026-10-18" ⇒ "Chủ Nhật, 18 tháng 10, 2026" (dòng dưới tiêu đề, Figma `507:307`). */
export function formatLongDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  const weekday = WEEKDAY_NAMES[isoWeekday(isoDate) - 1] ?? '';
  return `${weekday}, ${Number(day)} tháng ${Number(month)}, ${year}`;
}

/** "12/10/2026 – 18/10/2026" (Figma `507:334`). */
export function formatRange(tuNgay: string, denNgay: string): string {
  return `${formatDate(tuNgay)} – ${formatDate(denNgay)}`;
}
