import { addDays } from '../../../shared/schedule/week';

// Bộ lọc của trang Tổng quan Quản trị viên (dashboard F1; PLAN dashboard 5.5, 5.11; Q7, T6, T11). Hàm THUẦN: nhận "hôm nay" từ nơi gọi (giờ Việt Nam),
// không đọc đồng hồ, nên test chạy được ở mọi ngày. Ngày là chuỗi `YYYY-MM-DD`; cộng trừ ngày qua `shared/schedule/week` (UTC thuần, không lệch múi giờ máy).
// URL là NGUỒN DUY NHẤT của bộ lọc (T11): tải lại hay quay lại trang không mất bộ lọc.

export const DEFAULT_RANGE_DAYS = 30;
export const MAX_RANGE_DAYS = 366;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const BRANCH_ID = /^[1-9]\d{0,18}$/;

/** Bộ lọc đọc từ URL. `tuNgay`, `denNgay` là `null` khi URL không có (máy chủ tự dùng 30 ngày mặc định). */
export interface DashboardFilter {
  tuNgay: string | null;
  denNgay: string | null;
  chiNhanhId: string | null;
}

/** Lỗi kiểm tại chỗ trước khi gọi API (PLAN 5.11): thiếu một đầu, đảo ngược, quá 366 ngày, ngày không có thật. */
export type RangeProblem = 'THIEU_NGAY' | 'DAO_NGUOC' | 'QUA_DAI' | 'NGAY_SAI';

export const RANGE_PROBLEM_TEXT: Record<RangeProblem, string> = {
  THIEU_NGAY: 'Chọn đủ hai ngày; "Đến ngày" không được trước "Từ ngày".',
  DAO_NGUOC: 'Chọn đủ hai ngày; "Đến ngày" không được trước "Từ ngày".',
  QUA_DAI: 'Khoảng thời gian tối đa 366 ngày.',
  NGAY_SAI: 'Ngày không hợp lệ.',
};

/** Ngày lịch có thật (`2026-02-30` sai). */
export function isCalendarDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [match[1], match[2], match[3]].map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Số ngày của khoảng, tính cả hai đầu (âm hoặc 0 khi đảo ngược). */
export function dayCount(tuNgay: string, denNgay: string): number {
  const from = Date.parse(`${tuNgay}T00:00:00Z`);
  const to = Date.parse(`${denNgay}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000) + 1;
}

/** `null` khi khoảng hợp lệ (cùng luật với API, để không gọi rồi mới nhận 400). */
export function rangeProblem(
  tuNgay: string,
  denNgay: string,
): RangeProblem | null {
  if (tuNgay === '' || denNgay === '') return 'THIEU_NGAY';
  if (!isCalendarDate(tuNgay) || !isCalendarDate(denNgay)) return 'NGAY_SAI';
  const days = dayCount(tuNgay, denNgay);
  if (days < 1) return 'DAO_NGUOC';
  if (days > MAX_RANGE_DAYS) return 'QUA_DAI';
  return null;
}

/**
 * Đọc bộ lọc từ URL (DWB-10). Tham số hỏng (một ngày, ngày sai, đảo ngược, quá dài, id chi nhánh sai dạng) thì bỏ và dùng mặc định, không gọi API với
 * giá trị chắc chắn bị 400. `chiNhanhId` chỉ đọc khi người xem được chọn chi nhánh (Toàn hệ thống); Quản trị viên Chi nhánh KHÔNG gửi (DWB-05).
 */
export function filterFromSearch(
  params: URLSearchParams,
  canPickBranch: boolean,
): DashboardFilter {
  const tuNgay = params.get('tuNgay');
  const denNgay = params.get('denNgay');
  const validRange =
    tuNgay !== null &&
    denNgay !== null &&
    rangeProblem(tuNgay, denNgay) === null;
  const chiNhanhId = params.get('chiNhanhId');
  return {
    tuNgay: validRange ? tuNgay : null,
    denNgay: validRange ? denNgay : null,
    chiNhanhId:
      canPickBranch && chiNhanhId !== null && BRANCH_ID.test(chiNhanhId)
        ? chiNhanhId
        : null,
  };
}

/** Bộ lọc ⇒ tham số URL (bỏ giá trị `null`). */
export function filterToSearch(filter: DashboardFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.tuNgay !== null && filter.denNgay !== null) {
    params.set('tuNgay', filter.tuNgay);
    params.set('denNgay', filter.denNgay);
  }
  if (filter.chiNhanhId !== null) params.set('chiNhanhId', filter.chiNhanhId);
  return params;
}

/** Khoảng mặc định: 30 ngày kết thúc ở hôm nay, gồm cả hôm nay (khớp mặc định của API). */
export function defaultRange(today: string): {
  tuNgay: string;
  denNgay: string;
} {
  return { tuNgay: addDays(today, -(DEFAULT_RANGE_DAYS - 1)), denNgay: today };
}

/** Bốn nút chọn nhanh kỳ của Figma `507:2` (làm sớm mục "làm sau" của PLAN 6.5, quyết định của Trung 28/11/2026). Chỉ điền hai ô ngày. */
export const PERIOD_PRESETS = [
  { key: '7-ngay', label: '7 ngày' },
  { key: '30-ngay', label: '30 ngày' },
  { key: 'thang-nay', label: 'Tháng này' },
  { key: 'nam-nay', label: 'Năm nay' },
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number]['key'];

/** Khoảng của một nút kỳ, luôn kết thúc ở hôm nay ("Năm nay" tối đa 366 ngày nên vẫn hợp lệ). */
export function presetRange(
  preset: PeriodPreset,
  today: string,
): { tuNgay: string; denNgay: string } {
  switch (preset) {
    case '7-ngay':
      return { tuNgay: addDays(today, -6), denNgay: today };
    case '30-ngay':
      return defaultRange(today);
    case 'thang-nay':
      return { tuNgay: `${today.slice(0, 8)}01`, denNgay: today };
    case 'nam-nay':
      return { tuNgay: `${today.slice(0, 5)}01-01`, denNgay: today };
  }
}

/** Nút kỳ đang khớp khoảng hiện tại (để tô sáng); URL không có ngày là khoảng mặc định 30 ngày. */
export function activePreset(
  range: { tuNgay: string; denNgay: string },
  today: string,
): PeriodPreset | null {
  const match = PERIOD_PRESETS.find(({ key }) => {
    const candidate = presetRange(key, today);
    return (
      candidate.tuNgay === range.tuNgay && candidate.denNgay === range.denNgay
    );
  });
  return match?.key ?? null;
}
