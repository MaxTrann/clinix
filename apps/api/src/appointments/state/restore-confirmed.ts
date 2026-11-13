import type { EntityManager } from 'typeorm';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { canTransition } from './appointment-state.matrix.js';
import { lockAppointment } from './cancel-appointment.query.js';
import type { OnChanged } from './on-changed.js';
import { setStatus } from './set-status.query.js';

// `AppointmentTransitionService.restoreConfirmed` (task B14; PLAN booking 5.2, 5.7; Q24; CNTT A3 "khôi phục"; TRACKING 3.31 B14-C): lịch thành `DaXacNhan` từ `VangMat` (khôi phục) hoặc từ `DaTiepDon` (lùi một bước).
// CHỈ Quản trị viên override làm được (ô `QuanTriVien` của ma trận; `ChoThanhToan → DaXacNhan` là `confirmPaid` của `payment`, không phải đây). Họ B của khuôn bảy bước (chú thích đầu
// `appointment-transition.service.ts`): nhận `em` của NGƯỜI GỌI, KHÔNG mở giao dịch, KHÔNG bắt lỗi DB, KHÔNG ném `AppException`; kết quả là giá trị có kiểu, người gọi đổi sang lỗi API SAU commit.
//
// KHOÁ: chỉ `lich_hen` theo khoá chính (tầng 6, quy tắc 7). KHÔNG khoá `khung_gio` (cả ba trạng thái nguồn và đích đều giữ khung giờ `DaDat`, INV-3) và KHÔNG khoá hay ghi `benh_nhan`: khôi phục KHÔNG trừ
// `so_lan_no_show` và không mở cờ khoá đặt lịch (Q24: đó là việc của use case "Điều chỉnh số lần no-show", CT-20). KHÔNG thông báo (PLAN 5.12 không có sự kiện) và không cổng nào sau commit.
// Không cần `now` hay `config`: ma trận không đặt điều kiện thời gian hay tiền cho Quản trị viên (quy tắc 40, 47). Phạm vi (`canAct`) kiểm DƯỚI khoá; `NotFound` được hỏi TRƯỚC trạng thái để người ngoài
// phạm vi không đoán được trạng thái lịch của chi nhánh khác. `onChanged` (tuỳ chọn, `on-changed.ts`) là điểm cắm audit của B14.
// LƯU Ý CHO B13 (TRACKING 3.31 B14-B 8): lịch vừa khôi phục mà ca đã kết thúc vẫn nằm trong tập ứng viên của job tự Vắng mặt (`DaXacNhan` và ca đã kết thúc).

export type RestoreConfirmedInput = {
  lichHenId: string;
  /** Chỉ Quản trị viên; trường này để ma trận quyết nguồn (`VangMat`, `DaTiepDon`) thay vì cứng trong hàm */
  actor: 'QuanTriVien';
  /** Phạm vi theo `BranchAccessPolicy.canAccessBranch`; `false` ⇒ `NotFound`. Kiểm DƯỚI khoá lịch */
  canAct: (target: { chiNhanhId: string }) => boolean;
  /** Điểm cắm audit: gọi một lần sau khi đã đổi, dưới khoá, kèm trạng thái nguồn */
  onChanged?: OnChanged;
};

export type RestoreConfirmedOutcome =
  /** `VangMat` hoặc `DaTiepDon` thành `DaXacNhan`; khung giờ giữ `DaDat`; `benh_nhan` không đổi; không thông báo */
  | { kind: 'Restored' }
  /** Không có lịch đó, hoặc ngoài phạm vi của người gọi: cùng một 404 */
  | { kind: 'NotFound' }
  /** Ma trận không cho đi từ trạng thái này sang `DaXacNhan` (kể cả đã `DaXacNhan`) dưới khoá */
  | { kind: 'InvalidState'; trangThai: TrangThaiLichHen };

/** Thân của `restoreConfirmed` (họ B: chỉ nhận `em`). Có thể chạy lại từ đầu khi vỏ của người gọi thử lại: không giữ trạng thái, không tác dụng phụ ngoài `em`. */
export async function restoreConfirmedWithin(
  em: EntityManager,
  input: RestoreConfirmedInput,
): Promise<RestoreConfirmedOutcome> {
  // Bước 2 đến 3: khoá `lich_hen` theo khoá chính rồi kiểm LẠI phạm vi và trạng thái dưới khoá
  const row = await lockAppointment(em, input.lichHenId);
  if (row === null || !input.canAct({ chiNhanhId: row.chiNhanhId }))
    return { kind: 'NotFound' };

  // Bước 4: ma trận với trạng thái nguồn ĐỌC DƯỚI KHOÁ. Ô `QuanTriVien → DaXacNhan` không có điều kiện, nên từ chối duy nhất có thể ra là `KhongHopLe`
  const decision = canTransition({
    actor: input.actor,
    from: row.trangThai,
    to: 'DaXacNhan',
  });
  // Bước 6: từ chối là KẾT QUẢ CÓ KIỂU, trước lần ghi đầu tiên nên không có gì để hoàn tác
  if (!decision.ok) {
    if (decision.reason === 'KhongHopLe')
      return { kind: 'InvalidState', trangThai: row.trangThai };
    throw new Error(
      `ma trận từ chối ${decision.reason} cho đích DaXacNhan của Quản trị viên: nhánh không có trong restoreConfirmed`,
    );
  }

  // Bước 5: `UPDATE` có điều kiện trạng thái nguồn. Không còn đúng 1 hàng dưới khoá là dữ liệu lệch: ném `Error` để người gọi hoàn tác trọn.
  const changed = await setStatus(em, {
    lichHenId: input.lichHenId,
    from: row.trangThai,
    to: 'DaXacNhan',
  });
  if (!changed)
    throw new Error(
      `lịch hẹn ${input.lichHenId} không còn ${row.trangThai} dưới khoá khi khôi phục DaXacNhan`,
    );
  // Điểm cắm audit của Quản trị viên (B14): sau lần ghi, dưới khoá, một lần; ném ⇒ người gọi hoàn tác trọn
  await input.onChanged?.(em, { from: row.trangThai });
  return { kind: 'Restored' };
}
