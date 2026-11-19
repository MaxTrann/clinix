import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import type { ResendTarget } from './account-resend.types.js';

const notFound = (): AppException =>
  new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
const forbidden = (): AppException =>
  new AppException(403, COMMON_ERROR_CODES.FORBIDDEN);

/**
 * Ma trận quyền của "Gửi lại liên kết kích hoạt" (PLAN admin 5.6, bước 2b). Hàm THUẦN: không DB, không đồng hồ.
 * Bước (1) tồn tại và (2) tầm nhìn đã xử lý bằng truy vấn có điều kiện phạm vi (cùng MỘT đường mã, 404); ở đây chỉ còn phần
 * "thấy được thì làm được gì". Loại đích và trạng thái (bước 3 và 5) KHÔNG kiểm ở đây: `ActivationLinkService.issue` (B14) trả
 * `TAI_KHOAN_KHONG_CHO_KICH_HOAT` cho Bệnh nhân và cho nhân sự không còn `ChoKichHoat`, rồi mới kiểm giới hạn gửi lại (Q23).
 *
 *  - Toàn hệ thống: mọi đích (kể cả Quản trị viên, mọi chi nhánh) đi tiếp.
 *  - Chi nhánh: Quản trị viên ⇒ 404 (Q27) và nhân sự chi nhánh khác ⇒ 404 (cả hai đã bị truy vấn tầm nhìn loại trước, giữ ở đây để phòng thủ);
 *    Bệnh nhân (thấy được vì có lịch tại chi nhánh) ⇒ 403, vì ma trận chỉ cho Chi nhánh gửi lại cho Bác sĩ và Lễ tân của chính mình.
 */
export function decideResendAccess(
  scope: AdminScope,
  target: Pick<ResendTarget, 'loaiTaiKhoan' | 'chiNhanhId'>,
): void {
  if (scope.kind !== 'ChiNhanh') return;
  if (target.loaiTaiKhoan === 'QuanTriVien') throw notFound();
  if (target.loaiTaiKhoan === 'BenhNhan') throw forbidden();
  if (target.chiNhanhId !== scope.chiNhanhId) throw notFound();
}
