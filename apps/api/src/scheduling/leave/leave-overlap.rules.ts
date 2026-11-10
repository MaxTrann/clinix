import type { CaLamViec } from '../../admin/entities/enums.js';

// `scheduling/` không được import `doctor/` (H20, quét ở architecture.spec) nên hai kiểu dưới đây lặp lại giá trị enum của
// `doctor/entities/enums.ts` (HINH_THUC_NGHI, TRANG_THAI_YEU_CAU_NGHI_PHEP); giá trị khớp nên entity gán được cho các kiểu này.
export type LeaveKind = 'CaNgay' | 'TheoCa';
export type LeaveState = 'ChoDuyet' | 'DaDuyet' | 'TuChoi';

// Luật thuần của D4 (PLAN doctor 5.10): một ca thuộc khoảng nghỉ của yêu cầu nào. Ngày là chuỗi 'YYYY-MM-DD',
// so sánh chuỗi cho đúng thứ tự thời gian (không qua Date nên không lệch múi giờ: H1).

/** Chỉ yêu cầu CHỜ DUYỆT hoặc ĐÃ DUYỆT mới chặn khung giờ (2.4 TYN b5, booking D4); `TuChoi` thì không. */
export const BLOCKING_LEAVE_STATES = ['ChoDuyet', 'DaDuyet'] as const;

/** Phần của một yêu cầu nghỉ đủ để quyết định ca nào bị phủ. */
export interface LeaveWindow {
  hinhThucNghi: LeaveKind;
  ngayBatDau: string;
  ngayKetThuc: string;
  /** Có giá trị khi `TheoCa`; `null` khi `CaNgay`. */
  ca: CaLamViec | null;
}

/**
 * `CaNgay` phủ cả hai ca của mọi ngày trong [ngayBatDau, ngayKetThuc] (gồm hai đầu);
 * `TheoCa` chỉ phủ đúng ca đó của đúng ngày đó (DB đã ép ngày bắt đầu = ngày kết thúc).
 */
export function leaveCoversShift(
  leave: LeaveWindow,
  shift: { ngay: string; ca: CaLamViec },
): boolean {
  if (shift.ngay < leave.ngayBatDau || shift.ngay > leave.ngayKetThuc)
    return false;
  return leave.hinhThucNghi === 'CaNgay' || leave.ca === shift.ca;
}

export interface BlockingLeaveRef {
  yeuCauNghiPhepId: string;
  trangThai: LeaveState;
}

/** Id bigint dạng chuỗi so như số (không mất độ chính xác, '9' < '10'). */
const byNumericId = (a: string, b: string): number =>
  a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);

/**
 * Nhiều yêu cầu cùng chặn một ca thì chọn MỘT kết quả cố định: `DaDuyet` trước `ChoDuyet`, cùng trạng thái thì mã nhỏ nhất.
 * Cố định để booking báo lỗi nhất quán, không phụ thuộc thứ tự dòng MySQL trả về.
 */
export function pickBlockingLeave<T extends BlockingLeaveRef>(
  candidates: readonly T[],
): T | null {
  const rank = (state: LeaveState) => (state === 'DaDuyet' ? 0 : 1);
  const sorted = [...candidates].sort(
    (x, y) =>
      rank(x.trangThai) - rank(y.trangThai) ||
      byNumericId(x.yeuCauNghiPhepId, y.yeuCauNghiPhepId),
  );
  return sorted[0] ?? null;
}
