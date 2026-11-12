import type { EntityManager } from 'typeorm';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';

// `AppointmentTransitionService.complete` (task B11; PLAN booking 5.2, 5.10 D6; MT-04, CG-07): `doctor` gọi trong giao dịch của nó khi Bác sĩ hoàn tất ca khám; `DaTiepDon` thành `HoanThanh`.
// `HoanThanh` CHỈ qua hàm này (CNTT: chỉ Bác sĩ; AR-06: `UPDATE lich_hen` chỉ ở `state/`). Họ B của khuôn bảy bước: nhận `em` của NGƯỜI GỌI, KHÔNG mở giao dịch, KHÔNG bắt lỗi DB, KHÔNG ném
// `AppException`. KHÔNG đụng khung giờ (vẫn `DaDat`): không `lockSlot`, không câu nào chạm `khung_gio`; chỉ khoá `lich_hen` theo khoá chính (tầng 6, bỏ qua tầng 5).
//
// ĐIỀU KIỆN NGƯỜI GỌI (`doctor`) PHẢI GIỮ: (1) gọi qua `withBookingTransaction`, thân chạy lại được và không có tác dụng phụ ngoài DB; (2) gọi TRƯỚC khi ghi `ho_so_kham` (bảng đó sẽ có khoá
// ngoại tới `lich_hen`: ghi trước rồi mới khoá X là tự nâng khoá chia sẻ lên X, hai giao dịch cùng ca thì deadlock); (3) `bacSiId` lấy từ access token, không từ dữ liệu người dùng gửi.
//
// Kiểm SỞ HỮU TRƯỚC TRẠNG THÁI: lịch của bác sĩ khác (hay không tồn tại) luôn ra `NotAssigned`, không bao giờ `InvalidState`, nên không lộ trạng thái hay sự tồn tại của lịch người khác
// (`doctor` trả CÙNG một 404 `KHONG_TIM_THAY` như route B5). Không ghi mốc thời gian (không có cột; `cap_nhat_lan_cuoi` tự cập nhật), không thông báo (PLAN 5.12 không có sự kiện).

export interface CompleteInput {
  lichHenId: string;
  /** `bac_si.tai_khoan_id` của bác sĩ đang đăng nhập, dạng chuỗi (từ access token) */
  bacSiId: string;
}

export type CompleteOutcome =
  /** `DaTiepDon` thành `HoanThanh`; khung giờ giữ `DaDat` */
  | { kind: 'Completed' }
  /** Không có lịch đó HOẶC lịch của bác sĩ khác (không phân biệt) */
  | { kind: 'NotAssigned' }
  /** Lịch của đúng bác sĩ nhưng không còn `DaTiepDon` dưới khoá (kể cả đã `HoanThanh`: idempotent không được, báo trạng thái) */
  | { kind: 'InvalidState'; trangThai: TrangThaiLichHen };

interface LockedAppointment {
  bacSiId: string;
  trangThai: TrangThaiLichHen;
}

// `FOR UPDATE` theo khoá chính (tầng 6, quy tắc 7). `CAST … AS CHAR`: id là bigint, driver có thể trả số.
const LOCK_APPOINTMENT_SQL = `SELECT CAST(bac_si_id AS CHAR) AS bacSiId, trang_thai AS trangThai
FROM lich_hen WHERE lich_hen_id = ?
FOR UPDATE`;

// Điều kiện bác sĩ và trạng thái lặp lại trong `UPDATE`: lưới an toàn thứ hai (đúng 1 hàng)
const COMPLETE_SQL = `UPDATE lich_hen SET trang_thai = 'HoanThanh'
WHERE lich_hen_id = ? AND bac_si_id = ? AND trang_thai = 'DaTiepDon'`;

/** Thân của `complete` (họ B: chỉ nhận `em`). Có thể chạy lại từ đầu khi vỏ của người gọi thử lại. */
export async function completeWithin(
  em: EntityManager,
  input: CompleteInput,
): Promise<CompleteOutcome> {
  const rows = await em.query<LockedAppointment[]>(LOCK_APPOINTMENT_SQL, [
    input.lichHenId,
  ]);
  const row = rows[0];
  // So chuỗi với chuỗi; `bacSiId` sai kiểu thì không khớp ⇒ `NotAssigned` (đóng theo mặc định)
  if (row === undefined || row.bacSiId !== input.bacSiId)
    return { kind: 'NotAssigned' };
  if (row.trangThai !== 'DaTiepDon')
    return { kind: 'InvalidState', trangThai: row.trangThai };

  const result: { affectedRows?: number } = await em.query(COMPLETE_SQL, [
    input.lichHenId,
    input.bacSiId,
  ]);
  if (result.affectedRows !== 1)
    throw new Error(
      `lịch hẹn ${input.lichHenId} không còn DaTiepDon dưới khoá khi hoàn thành`,
    );
  return { kind: 'Completed' };
}
