import { AppException } from '../../common/errors/app.exception.js';
import {
  COMMON_ERROR_CODES,
  INVALID_DATA_MESSAGE,
} from '../../common/errors/error-codes.js';

// Mã `ma` của MỘT trường trong loi[{truong, ma}] của 400 DU_LIEU_KHONG_HOP_LE (admin B19 TRACKING 9A.10 mục 2.5).
// Chỉ là mã mức trường, KHÔNG có mã HTTP mới (cùng nếp `ma` của B17). `[đề xuất]` Đại duyệt 19/11/2026.
export const NO_SHOW_FIELD_CODES = {
  notPatient: 'TAI_KHOAN_KHONG_PHAI_BENH_NHAN',
} as const;

// Mã và chữ NGUYÊN VĂN PLAN admin 5.9 (nguồn TK b4). B18 (`account-lock/`) cũng dùng đúng mã và chữ này ở file lỗi riêng của nó;
// gộp về một nơi dùng chung là việc sau khi cả hai merge (TECH_DEBT).
export const STATE_NOT_ALLOWED_CODE = 'TRANG_THAI_KHONG_PHU_HOP';
const STATE_NOT_ALLOWED_MESSAGE =
  'Trạng thái hiện tại của tài khoản không cho phép thao tác này.';

/**
 * 409: Bệnh nhân không có gì để mở khoá (cờ đang tắt, hoặc chưa có dòng `benh_nhan` vì chưa xác minh OTP).
 * Không idempotent có chủ ý: Q31 chỉ cho hiện nút khi đang bị khoá, nên gọi lên cờ đang tắt là giao diện cũ hoặc đã có người mở trước.
 */
export function accountStateNotAllowed(): AppException {
  return new AppException(409, STATE_NOT_ALLOWED_CODE, {
    thongBao: STATE_NOT_ALLOWED_MESSAGE,
  });
}

/** 400: đích không phải Bệnh nhân (TK-32). Chỉ Bệnh nhân có cờ khoá đặt lịch do no-show. */
export function accountNotPatient(): AppException {
  return new AppException(400, COMMON_ERROR_CODES.INVALID_DATA, {
    thongBao: INVALID_DATA_MESSAGE,
    loi: [{ truong: 'id', ma: NO_SHOW_FIELD_CODES.notPatient }],
  });
}
