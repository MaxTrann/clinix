import type { EntityManager } from 'typeorm';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { addMoney } from '../../pricing/money.js';
import {
  BOOKING_NOTIFICATION_EVENTS,
  HOLD_EXPIRED_CANCEL_REASON,
} from '../appointments.constants.js';
import type { AppointmentNotifier } from '../ports/appointment-notifier.port.js';
import type { SlotHoldService } from '../slots/slot-hold.service.js';
import { lockSlot } from '../slots/slot-lock.js';
import { readLichHenKeys } from './lich-hen-keys.query.js';

// `AppointmentTransitionService.confirmPaid` (task B11; PLAN booking 5.2, 5.5, 5.10 B, H16; Q4, Q20): `payment` gọi TRONG giao dịch của chính nó khi đã thu thật; `ChoThanhToan` thành `DaXacNhan`
// và khung giờ `DangGiuCho` thành `DaDat` trong CÙNG giao dịch đó (không có khe "đã trả tiền mà lịch vẫn chờ"). Họ B của khuôn bảy bước (chú thích đầu `appointment-transition.service.ts`): nhận
// `em` của NGƯỜI GỌI, KHÔNG mở giao dịch, KHÔNG bắt lỗi DB, KHÔNG ném `AppException`. `UPDATE lich_hen` nằm ở `state/` đúng luật AR-06; `khung_gio` chỉ ghi qua `SlotHoldService.markBooked`.
//
// ĐIỀU KIỆN NGƯỜI GỌI (`payment`) PHẢI GIỮ (TRACKING 3.24.1; PLAN 5.10 hàng `payment`):
//  1. Gọi trong giao dịch của chính mình qua `withBookingTransaction` (READ COMMITTED, thử lại 1213 và 1205 bằng cách CHẠY LẠI thân từ đầu): thân phải chạy lại được và không có tác dụng phụ ngoài DB.
//  2. Gọi TRƯỚC mọi ghi hay khoá ở tầng 7 và trước mọi INSERT hay UPDATE vào bảng có khoá ngoại tới `lich_hen` (`giao_dich_thanh_toan`, `thong_bao`…): InnoDB xin khoá CHIA SẺ trên hàng cha `lich_hen`,
//     trong khi `expire` (và `cancel`) giữ `khung_gio` X rồi xin `lich_hen` X ⇒ vòng chờ ⇒ 1213. Thứ tự của `payment`: `confirmPaid` → (biết kết quả) → `giao_dich_thanh_toan` → `vi_noi_bo` → bảng chỉ-thêm.
//  3. Chưa giữ khoá `khung_gio` hay `lich_hen` của booking khi gọi.
//  4. CHỈ gọi khi đã thu ĐỦ cọc: `confirmPaid` KHÔNG phán xét số tiền (tiền đã qua cổng thanh toán thì không thể từ chối; `payment` quyết khi nào gọi, Q20). `soTienDaThu` chỉ được kiểm định dạng
//     và đi vào thông báo (`daThu`, Q46).
//  5. Xử lý tiền theo kết quả: `HetHanGiuCho` ⇒ hoàn TOÀN BỘ vào ví (Q4); các `InvalidState` do `payment` quyết.
// Lỗi 1213 và 1205 (từ bất kỳ câu nào, kể cả `notify`) nổi nguyên ra giao dịch của người gọi để vỏ của họ thử lại cả giao dịch; chỉ dữ liệu lệch mới ném `Error` thường (hoàn tác trọn).
//
// Q4: KHÔNG tự kiểm đồng hồ và không nhận `now`: lịch còn `ChoThanhToan` (job chưa quét, khung giờ chưa ai giữ lại) thì VẪN xác nhận, kể cả quá `han_thanh_toan` và cả khi giờ hẹn đã qua nếu còn trong hạn giữ chỗ.

export interface ConfirmPaidInput {
  lichHenId: string;
  /** Tổng tiền `payment` đã thu thật cho lịch, chuỗi decimal không âm (H11, ví dụ "150000.00"); sai định dạng ⇒ `RangeError` trước mọi câu SQL */
  soTienDaThu: string;
}

export type ConfirmPaidOutcome =
  /** `ChoThanhToan` thành `DaXacNhan` (`han_thanh_toan` NULL), khung giờ `DaDat`, đã ghi thông báo `LichHenDaXacNhan` trong giao dịch của người gọi */
  | { kind: 'Confirmed' }
  /** Đã `DaXacNhan`: không ghi gì, không thông báo lần hai */
  | { kind: 'AlreadyConfirmed' }
  /** `DaHuy` do hết hạn giữ chỗ: không đổi gì; `payment` hoàn toàn bộ vào ví (Q4). Mã nội bộ, không ra HTTP (PLAN 5.14) */
  | { kind: 'HetHanGiuCho' }
  /** Mọi trạng thái còn lại: `DaTiepDon`, `DaHuy` do người dùng, `HoanThanh`, `VangMat`, `DaDoiLich` */
  | { kind: 'InvalidState'; trangThai: TrangThaiLichHen };

/** Hàng `lich_hen` đọc DƯỚI khoá. `benhNhanId` là tài khoản đặt (nhận thông báo, PLAN 5.12); bất biến sau khi chèn nên đọc cùng câu khoá, không thêm cột vào `readLichHenKeys`. */
interface LockedAppointment {
  trangThai: TrangThaiLichHen;
  lyDoHuy: string | null;
  benhNhanId: string;
}

/**
 * Lịch `DaHuy` do HẾT HẠN giữ chỗ (HG-12) hay do người dùng (HG-13)? DDL `lich_hen` không có cột riêng cho việc này: tín hiệu duy nhất là `ly_do_huy` = `HOLD_EXPIRED_CANCEL_REASON`, mà
 * `cancelLapsedHold` (B6b) là nơi DUY NHẤT ghi. Lý do người dùng và Lễ tân là chữ tự do (Q27): ai gõ đúng câu đó cũng bị coi là hết hạn; hậu quả nhẹ (`HetHanGiuCho` thay vì
 * `InvalidState`, cả hai đều "lịch không được xác nhận, tiền phải về ví"). ĐỪNG đổi chữ hằng sau khi có dữ liệu thật: dòng cũ sẽ không còn nhận ra (TRX-01 ghim chữ).
 */
export function isHoldExpiredCancellation(row: {
  trangThai: string;
  lyDoHuy: string | null;
}): boolean {
  return (
    row.trangThai === 'DaHuy' && row.lyDoHuy === HOLD_EXPIRED_CANCEL_REASON
  );
}

// `FOR UPDATE` theo khoá chính (tầng 6, quy tắc 7), đọc trạng thái MỚI NHẤT dưới khoá. `CAST … AS CHAR`: id là bigint, driver có thể trả số.
const LOCK_APPOINTMENT_SQL = `SELECT trang_thai AS trangThai, ly_do_huy AS lyDoHuy, CAST(benh_nhan_id AS CHAR) AS benhNhanId
FROM lich_hen WHERE lich_hen_id = ?
FOR UPDATE`;

// Điều kiện `trang_thai = 'ChoThanhToan'` lặp lại trong `UPDATE`: lưới an toàn thứ hai (đúng 1 hàng). `han_thanh_toan` về NULL (PLAN 5.2: lịch đã xác nhận không còn hạn).
const CONFIRM_SQL = `UPDATE lich_hen SET trang_thai = 'DaXacNhan', han_thanh_toan = NULL
WHERE lich_hen_id = ? AND trang_thai = 'ChoThanhToan'`;

/** Số tiền đã thu ra dạng chuẩn hai chữ số thập phân ("150000.5" thành "150000.50"); không phải số tiền không âm thì `RangeError` (lỗi lập trình của người gọi, chưa chạm DB). */
function normalizeCollected(value: unknown): string {
  if (typeof value !== 'string')
    throw new RangeError('soTienDaThu phải là chuỗi decimal');
  try {
    return addMoney(value, '0.00');
  } catch {
    throw new RangeError('soTienDaThu không phải số tiền không âm');
  }
}

export interface ConfirmPaidDeps {
  slotHolds: SlotHoldService;
  notifier: AppointmentNotifier;
}

/** Thân của `confirmPaid` (họ B: chỉ nhận `em`). Có thể chạy lại từ đầu khi vỏ của người gọi thử lại: không giữ trạng thái giữa các lần, không tác dụng phụ ngoài `em`. */
export async function confirmPaidWithin(
  em: EntityManager,
  input: ConfirmPaidInput,
  deps: ConfirmPaidDeps,
): Promise<ConfirmPaidOutcome> {
  const daThu = normalizeCollected(input.soTienDaThu);

  // Bước 1 đến 2: đọc thường khoá bất biến rồi khoá `khung_gio` (tầng 5). `payment` lấy id từ chính dữ liệu của nó nên không có lịch hay khung giờ là DỮ LIỆU LỆCH: ném `Error` để hoàn tác,
  // không thêm kiểu kết quả thứ năm (TRACKING 3.24.2 (c)).
  const keys = await readLichHenKeys(em, input.lichHenId);
  if (keys === null)
    throw new Error(`lịch hẹn ${input.lichHenId} không tồn tại`);
  const slot = await lockSlot(em, keys.khungGioId);
  if (slot === null)
    throw new Error(
      `khung giờ ${keys.khungGioId} của lịch ${input.lichHenId} không tồn tại`,
    );

  // Bước 2 đến 3: khoá `lich_hen` theo khoá chính (tầng 6) và kiểm LẠI trạng thái dưới khoá
  const rows = await em.query<LockedAppointment[]>(LOCK_APPOINTMENT_SQL, [
    input.lichHenId,
  ]);
  const row = rows[0];
  if (row === undefined)
    throw new Error(`lịch hẹn ${input.lichHenId} biến mất dưới khoá`);

  // Bước 6: các nhánh từ chối là KẾT QUẢ CÓ KIỂU, chưa ghi gì nên không có gì để hoàn tác
  if (row.trangThai === 'DaXacNhan') return { kind: 'AlreadyConfirmed' };
  if (isHoldExpiredCancellation(row)) return { kind: 'HetHanGiuCho' };
  if (row.trangThai !== 'ChoThanhToan')
    return { kind: 'InvalidState', trangThai: row.trangThai };

  // Bước 5: ghi lịch rồi khung giờ rồi thông báo, cùng giao dịch của người gọi. Lỗi nào sau lần ghi đầu cũng là `Error` thường: hoàn tác CẢ ba (và phần của `payment`), không commit nửa chừng.
  const confirmed: { affectedRows?: number } = await em.query(CONFIRM_SQL, [
    input.lichHenId,
  ]);
  if (confirmed.affectedRows !== 1)
    throw new Error(
      `lịch hẹn ${input.lichHenId} không còn ChoThanhToan dưới khoá khi xác nhận`,
    );
  // `markBooked` KHÔNG so `giu_cho_den` với đồng hồ (chỉ đòi `DangGiuCho`), nên hạn đã qua mà chưa ai giữ lại vẫn thành `DaDat` (Q4). `Stale` = INV-02 vỡ (lịch chờ mà khung giờ không giữ).
  const booked = await deps.slotHolds.markBooked(em, slot);
  if (booked.kind !== 'Done')
    throw new Error(
      `khung giờ ${slot.khungGioId} không còn DangGiuCho dưới khoá khi xác nhận thanh toán`,
    );
  // Thông báo ghi TRONG giao dịch (Q29, phương án A): hoàn tác theo nếu giao dịch của `payment` hoàn tác (CG-02). Lỗi `notify` nổi lên, không bị nuốt.
  await deps.notifier.notify(em, {
    loaiSuKien: BOOKING_NOTIFICATION_EVENTS.CONFIRMED,
    lichHenId: input.lichHenId,
    taiKhoanId: row.benhNhanId,
    daThu,
  });
  return { kind: 'Confirmed' };
}
