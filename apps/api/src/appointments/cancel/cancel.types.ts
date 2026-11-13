import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import type { OnChanged } from '../state/on-changed.js';

// HỢP ĐỒNG của huỷ lịch hẹn dùng chung (PLAN booking 5.6; TRACKING 3.23 B10-C, đã duyệt 12/11/2026). Chỉ KIỂU và hằng, không dịch vụ: module `doctor` (duyệt nghỉ phép, B15 đến B17),
// Lễ tân (B12) và Quản trị viên (B14) `import type` từ đây mà không kéo theo `AppointmentCancellationService`.
//
// Khác PLAN 5.6 (đã sửa 5.6 cùng PR): (1) `actor` và `reason` là MỘT union gắn với nhau, cặp sai không biên dịch được; (2) KHÔNG có `HetHanGiuCho`: hết hạn giữ chỗ là `expire` của B9
// (không hoàn, không thông báo, Q6); (3) chỉ `maLichHen` (cả bốn người gọi đều có mã); (4) `lyDo` bắt buộc cho Lễ tân và Quản trị viên (Q27), tuỳ chọn cho Bệnh nhân, KHÔNG có cho `HeThong`
// (nghỉ phép là chữ hằng, Q27); (5) không có `khungGioGiaiPhong` (với `Cancelled` luôn đúng, INV-2, INV-3); (6) không có nhánh `Failed`: kết quả nghiệp vụ là giá trị trả về, lỗi hệ thống thì NÉM.

/** Bốn lý do huỷ qua `cancel` (hết hạn giữ chỗ không đi đường này). */
export const CANCEL_REASONS = [
  'BenhNhanHuy',
  'LeTanHuy',
  'QtvOverride',
  'BacSiNghiPhep',
] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

export type CancelActor =
  | { kind: 'BenhNhan'; accountId: string }
  | { kind: 'LeTan'; accountId: string; chiNhanhId: string }
  | { kind: 'QuanTriVien'; accountId: string; scope: AdminScope }
  | { kind: 'HeThong' };

type ActorOf<K extends CancelActor['kind']> = Extract<CancelActor, { kind: K }>;

/**
 * Đầu vào của `AppointmentCancellationService.cancel`. `maLichHen` đã chuẩn hoá chữ hoa (người gọi qua `ParseAppointmentCodePipe`; `findAffectedByLeave` trả mã đã đúng dạng).
 * `lyDo` vào `ly_do_huy` (≤ 255): Bệnh nhân tuỳ chọn (vắng ⇒ hằng "Bệnh nhân hủy lịch hẹn"), Lễ tân và Quản trị viên bắt buộc, `HeThong` không có.
 */
export type CancelInput = { maLichHen: string } & (
  | { actor: ActorOf<'BenhNhan'>; reason: 'BenhNhanHuy'; lyDo?: string }
  | { actor: ActorOf<'LeTan'>; reason: 'LeTanHuy'; lyDo: string }
  // `onChanged` (B14, tuỳ chọn, CHỈ biến thể này): điểm cắm audit `OverrideLichHen`, gọi một lần SAU thông báo, dưới khoá, TRONG giao dịch của lần huỷ (thử lại 1213, 1205 chạy lại cả nó), kèm trạng thái nguồn; ném ⇒ hoàn tác TẤT CẢ. Không đổi `CancelOutcome`.
  | {
      actor: ActorOf<'QuanTriVien'>;
      reason: 'QtvOverride';
      lyDo: string;
      onChanged?: OnChanged;
    }
  // `lyDo?: never`: người gọi `HeThong` KHÔNG được truyền lý do (Q27: nghỉ phép là chữ hằng; lý do nghỉ của bác sĩ là dữ liệu riêng tư). `never` làm cả `{ …, lyDo: 'x' }` lẫn một biến có kiểu `lyDo: string` bị tsc từ chối.
  | { actor: ActorOf<'HeThong'>; reason: 'BacSiNghiPhep'; lyDo?: never }
);

/** Số hoàn do lần huỷ này TÍNH RA: `tyLe` là phần trăm nguyên 0 đến 100, `soTien` là chuỗi decimal 2 chữ số (H11). */
export interface RefundAmount {
  tyLe: number;
  soTien: string;
}

/**
 * Kết quả nghiệp vụ. Idempotent cho lô của `doctor`: lịch đã `DaHuy` (vì bất kỳ lý do nào) là `AlreadyCancelled` (coi là thành công, không hoàn tiền và không mời chờ lần hai);
 * `NotFound` = không có, của người khác, ngoài phạm vi (cùng một thân 404); `NotCancellable` = ma trận không cho `actor` này đi từ trạng thái đó sang `DaHuy` (HLH A1).
 * `hoanCoc` là `null` khi chưa thu đồng nào (lịch cọc 0đ, hay `ChoThanhToan` chưa thanh toán).
 * Lỗi hệ thống KHÔNG nằm ở đây mà được NÉM: `AppException` 503 `HE_THONG_DANG_BAN` khi hết lượt thử lại 1213/1205, hay `Error` khi dữ liệu hỏng (giao dịch đã hoàn tác trọn).
 */
export type CancelOutcome =
  | { kind: 'Cancelled'; maLichHen: string; hoanCoc: RefundAmount | null }
  | { kind: 'AlreadyCancelled' }
  | { kind: 'NotCancellable'; trangThai: TrangThaiLichHen }
  | { kind: 'NotFound' };
