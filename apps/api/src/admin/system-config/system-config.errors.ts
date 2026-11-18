import {
  AppException,
  type FieldError,
} from '../../common/errors/app.exception.js';
import {
  COMMON_ERROR_CODES,
  INVALID_DATA_MESSAGE,
} from '../../common/errors/error-codes.js';

// Mã của MỘT trường trong loi[{truong, ma}] của 400 DU_LIEU_KHONG_HOP_LE (PLAN admin 5.9; admin B5 TRACKING 9A.1 mục 2.2).
// Frontend chọn câu thông báo theo MÃ. `LY_DO_BAT_BUOC` dùng chung nghĩa với appointments và doctor (nếp của repo, thay cho
// `THIEU_LY_DO` ở PLAN 5.9: lệch có chủ ý, phiên kiểm đã duyệt). Ba mã còn lại là mã mới của B5 `[đề xuất]`.
export const CONFIG_FIELD_CODES = {
  invalidValue: 'CAU_HINH_GIA_TRI_KHONG_HOP_LE',
  reasonRequired: 'LY_DO_BAT_BUOC',
  weightsSum: 'TONG_TRONG_SO_KHAC_1',
  missingOnCreate: 'CAU_HINH_THIEU_GIA_TRI',
} as const;

// Không tham số nào đổi (PLAN 5.9: 400 KHONG_CO_THAY_DOI, không ghi nhật ký giả, Q38).
export const NO_CHANGE_CODE = 'KHONG_CO_THAY_DOI';

export function configInvalidData(loi: FieldError[]): AppException {
  return new AppException(400, COMMON_ERROR_CODES.INVALID_DATA, {
    thongBao: INVALID_DATA_MESSAGE,
    loi,
  });
}

export function configNoChange(): AppException {
  return new AppException(400, NO_CHANGE_CODE, {
    thongBao: 'Không có thay đổi nào để lưu.',
  });
}
