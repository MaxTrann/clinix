import type { EntityManager } from 'typeorm';

// `AppointmentTransitionService.markReplaced` (reschedule B1; PLAN reschedule 5.3, 5.5 bước 7; quy tắc DB 2): lịch cũ `DaXacNhan` thành `DaDoiLich`, SAU khi lịch mới đã được chèn trong CÙNG giao dịch.
// Là ô `DoiLich: DaXacNhan → DaDoiLich` của ma trận (actor `DoiLich` chỉ có đúng ô này); KHÔNG có API đổi trạng thái tay, và Q24 vẫn cấm override tới `DaDoiLich`. Họ B của khuôn bảy bước
// (chú thích đầu `appointment-transition.service.ts`): nhận `em` của NGƯỜI GỌI, KHÔNG mở giao dịch, KHÔNG ném `AppException`, KHÔNG đọc thêm.
//
// MỘT câu `UPDATE` và CHỈ đổi `trang_thai`: không SET cột nào khác, đặc biệt các mốc thời gian của B19 (lịch bị thay giữ nguyên `thoi_diem_xac_nhan`, `thoi_diem_tiep_don`, …). Điều kiện `trang_thai = 'DaXacNhan'`
// nằm trong chính câu lệnh (lưới an toàn thứ hai dưới khoá): đúng 1 hàng bị ảnh hưởng ⇒ `Replaced`; mọi trường hợp khác (lịch đã `DaHuy`, `VangMat`…, hay không còn hàng đó) ⇒ `InvalidState`, không ghi gì.
// Nguồn là HẰNG `DaXacNhan` nên hàm không gọi `canTransition` lúc chạy (như `expire`); test khẳng định ô có trong ma trận (HDL-02) và câu SQL đúng ô đó (HDL-01).
//
// Điều kiện người gọi phải giữ: đã khoá `lich_hen` theo khoá chính (tầng 6, `reschedule-locks.ts`), đã chèn lịch mới (`insertLichHen` với `lichHenTruocId` = lịch này) và đã đặt khung giờ mới;
// `UPDATE` này đi SAU các lần ghi có khoá ngoại để không xin thêm khoá ngược chiều (X1 M5: không khoá mới nào được sinh ra). `cap_nhat_lan_cuoi` do DB tự đổi (`ON UPDATE`), không phải do câu này.

export type MarkReplacedInput = {
  lichHenId: string;
};

export type MarkReplacedOutcome =
  /** Lịch thành `DaDoiLich`, mọi cột khác giữ nguyên; đúng 1 hàng bị ảnh hưởng */
  | { kind: 'Replaced' }
  /** Lịch không còn `DaXacNhan` dưới khoá (hoặc không còn hàng): không ghi gì. Người gọi hoàn tác cả giao dịch (lịch mới đã chèn không được commit mồ côi) */
  | { kind: 'InvalidState' };

// Mọi câu `UPDATE lich_hen` của `state/` đều bắt đầu bằng `UPDATE lich_hen SET trang_thai = ` (nhiều test khớp đầu câu này)
const MARK_REPLACED_SQL = `UPDATE lich_hen SET trang_thai = 'DaDoiLich'
WHERE lich_hen_id = ? AND trang_thai = 'DaXacNhan'`;

/** Thân của `markReplaced` (họ B: chỉ nhận `em`). Có thể chạy lại từ đầu khi vỏ của người gọi thử lại: không giữ trạng thái, không tác dụng phụ ngoài `em`. */
export async function markReplacedWithin(
  em: EntityManager,
  input: MarkReplacedInput,
): Promise<MarkReplacedOutcome> {
  const result: { affectedRows?: number } = await em.query(MARK_REPLACED_SQL, [
    input.lichHenId,
  ]);
  return result.affectedRows === 1
    ? { kind: 'Replaced' }
    : { kind: 'InvalidState' };
}
