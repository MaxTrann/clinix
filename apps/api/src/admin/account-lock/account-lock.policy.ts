import {
  awaitingActivationError,
  forbiddenError,
  lastSystemAdminError,
  notFoundError,
  selfLockError,
  stateNotAllowedError,
} from './account-lock.errors.js';
import type { LockTarget, PolicyInput } from './account-lock.types.js';

/** Quản trị viên Toàn hệ thống: loại duy nhất cần đếm "còn ít nhất một" và khoá cả tập. */
export function isSystemAdmin(
  target: Pick<LockTarget, 'loaiTaiKhoan' | 'phamViQuanTri'>,
): boolean {
  return (
    target.loaiTaiKhoan === 'QuanTriVien' &&
    target.phamViQuanTri === 'ToanHeThong'
  );
}

/**
 * Ma trận quyền và thứ tự kiểm của khoá / mở khoá (PLAN admin 5.6, bước 2b đến 6). Hàm THUẦN: không DB, không đồng hồ.
 * Bước (1) tồn tại và (2) tầm nhìn đã xử lý bằng truy vấn có điều kiện phạm vi (cùng một đường mã, 404); ở đây chỉ còn phần
 * "thấy được thì làm được gì", theo ĐÚNG thứ tự và mã ĐẦU TIÊN thắng:
 *  (2b) Chi nhánh: Quản trị viên và nhân sự chi nhánh khác ⇒ 404 (phòng thủ: truy vấn đã loại); Bệnh nhân ⇒ 403;
 *  (3)  hành động hợp lệ với loại đích: lock và unlock hợp lệ với cả bốn loại (chỉ "mở khoá no-show" của B19 mới giới hạn loại);
 *  (4)  tự khoá (chỉ `lock`) ⇒ TU_KHOA_TAI_KHOAN. Admin Chi nhánh không bao giờ tới đây với chính mình: họ là Quản trị viên,
 *       nằm ngoài tầm nhìn của Chi nhánh (Q27) nên đã 404 ở (2b), đúng TK-14 (đọc TK-16 là chỉ Toàn hệ thống tự khoá);
 *  (5)  trạng thái: ChoKichHoat ⇒ TAI_KHOAN_CHO_KICH_HOAT; khoá khi đã ngưng, mở khoá khi đang hoạt động ⇒ TRANG_THAI_KHONG_PHU_HOP;
 *  (6)  khoá Toàn hệ thống: phải còn ít nhất một tài khoản Toàn hệ thống KHÁC đang hoạt động trong tập đã khoá hàng (A5).
 */
export function decideLockAction(input: PolicyInput): void {
  const { action, scope, actorId, target, systemAdmins } = input;

  if (scope.kind === 'ChiNhanh') {
    if (target.loaiTaiKhoan === 'QuanTriVien') throw notFoundError();
    if (target.loaiTaiKhoan === 'BenhNhan') throw forbiddenError();
    if (target.chiNhanhId !== scope.chiNhanhId) throw notFoundError();
  }

  if (action === 'lock' && actorId === target.taiKhoanId) throw selfLockError();

  if (target.trangThai === 'ChoKichHoat') throw awaitingActivationError();
  if (action === 'lock' && target.trangThai === 'NgungHoatDong')
    throw stateNotAllowedError();
  if (action === 'unlock' && target.trangThai === 'DangHoatDong')
    throw stateNotAllowedError();

  if (action === 'lock' && isSystemAdmin(target)) {
    const stillActive = systemAdmins.some(
      (other) =>
        other.taiKhoanId !== target.taiKhoanId &&
        other.trangThai === 'DangHoatDong',
    );
    if (!stillActive) throw lastSystemAdminError();
  }
}
