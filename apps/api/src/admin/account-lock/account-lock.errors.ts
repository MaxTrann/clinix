import { AppException } from '../../common/errors/app.exception.js';

// Mã lỗi nghiệp vụ của khoá / mở khoá tài khoản (PLAN admin 5.9; TK A4, A5, A6, b4). Cả bốn là 409; câu chữ NGUYÊN VĂN bảng 5.9.
// B19 và B20 cần cùng giá trị mã nhưng giữ file lỗi riêng (không import chéo thư mục), nên chỉ GIÁ TRỊ chuỗi phải trùng.
export const ACCOUNT_LOCK_ERROR_CODES = {
  SELF_LOCK: 'TU_KHOA_TAI_KHOAN',
  LAST_SYSTEM_ADMIN: 'CON_IT_NHAT_MOT_ADMIN_TOAN_HE_THONG',
  AWAITING_ACTIVATION: 'TAI_KHOAN_CHO_KICH_HOAT',
  STATE_NOT_ALLOWED: 'TRANG_THAI_KHONG_PHU_HOP',
} as const;

export const ACCOUNT_LOCK_MESSAGES = {
  SELF_LOCK: 'Không thể tự khoá tài khoản của chính mình.',
  LAST_SYSTEM_ADMIN:
    'Phải còn ít nhất một Quản trị viên Toàn hệ thống đang hoạt động.',
  AWAITING_ACTIVATION:
    'Tài khoản đang chờ kích hoạt. Hãy dùng "Gửi lại liên kết kích hoạt".',
  STATE_NOT_ALLOWED:
    'Trạng thái hiện tại của tài khoản không cho phép thao tác này.',
} as const;

export const selfLockError = (): AppException =>
  new AppException(409, ACCOUNT_LOCK_ERROR_CODES.SELF_LOCK, {
    thongBao: ACCOUNT_LOCK_MESSAGES.SELF_LOCK,
  });

export const lastSystemAdminError = (): AppException =>
  new AppException(409, ACCOUNT_LOCK_ERROR_CODES.LAST_SYSTEM_ADMIN, {
    thongBao: ACCOUNT_LOCK_MESSAGES.LAST_SYSTEM_ADMIN,
  });

export const awaitingActivationError = (): AppException =>
  new AppException(409, ACCOUNT_LOCK_ERROR_CODES.AWAITING_ACTIVATION, {
    thongBao: ACCOUNT_LOCK_MESSAGES.AWAITING_ACTIVATION,
  });

export const stateNotAllowedError = (): AppException =>
  new AppException(409, ACCOUNT_LOCK_ERROR_CODES.STATE_NOT_ALLOWED, {
    thongBao: ACCOUNT_LOCK_MESSAGES.STATE_NOT_ALLOWED,
  });

// Hai lỗi chung dùng đúng mã và câu mặc định của PLAN 5.9. Id không tồn tại và id ngoài tầm nhìn PHẢI ném cùng một lỗi này (Q40).
export const notFoundError = (): AppException =>
  new AppException(404, 'KHONG_TIM_THAY');

export const forbiddenError = (): AppException =>
  new AppException(403, 'KHONG_DU_QUYEN');
