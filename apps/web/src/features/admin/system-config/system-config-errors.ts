import { errorMessageFor } from '../../../shared/api/error-message';
import { ApiError, type FieldError } from '../../../shared/api/errors';
import { isConfigKey } from './system-config-params';
import type { ConfigKey } from './system-config-types';
import {
  NO_CHANGE_MESSAGE,
  REASON_REQUIRED_MESSAGE,
  REQUIRED_MESSAGE,
  WEIGHT_SUM_MESSAGE,
  invalidValueMessage,
  type FieldErrors,
} from './system-config-validation';

// Mã lỗi của API (B5, TRACKING admin 9A.1 mục 2.2) sang chữ và ô trên màn hình. Giao diện chọn câu theo MÃ, không theo `thongBao`.
// Chữ lấy từ PLAN 5.9 khi có ("Bạn không có quyền thực hiện thao tác này.", "Hệ thống chưa được cấu hình.", "Vui lòng nhập lý do thay đổi.",
// "Không có thay đổi nào để lưu."), còn lại là `[đề xuất]`.

export const FORBIDDEN_MESSAGE = 'Bạn không có quyền thực hiện thao tác này.';
export const NOT_CONFIGURED_MESSAGE = 'Hệ thống chưa được cấu hình.';
export const INVALID_FORM_MESSAGE =
  'Một số thông tin chưa hợp lệ. Vui lòng kiểm tra lại các trường.';
// 500 LOI_HE_THONG: giao dịch đã hoàn tác (kể cả khi ghi nhật ký lỗi), nên được nói chắc là cấu hình chưa đổi
export const SERVER_ERROR_MESSAGE =
  'Không lưu được. Cấu hình chưa bị thay đổi, vui lòng thử lại.';
export const GENERIC_SAVE_ERROR_MESSAGE =
  'Không lưu được cấu hình. Vui lòng thử lại.';
// Mạng hoặc hết hạn chờ: máy chủ có thể đã lưu xong. Gửi lại cùng giá trị sau khi đã lưu chỉ nhận KHONG_CO_THAY_DOI, không gây hại.
export const UNKNOWN_RESULT_HINT = 'Chưa rõ cấu hình đã được lưu hay chưa.';

export interface SaveFailure {
  // Lỗi từng ô tham số (hộp xác nhận được đóng để người dùng thấy ô)
  fields: FieldErrors;
  // Lỗi ở ô lý do (hộp xác nhận vẫn mở)
  reason?: string;
  // Thông báo chung
  banner?: string;
  // Giữ hộp mở để bấm "Xác nhận lưu" lại (lỗi tạm thời hoặc lỗi ở ô lý do)
  keepDialogOpen: boolean;
}

function fieldMessage(key: ConfigKey, code: string): string | undefined {
  if (code === 'CAU_HINH_GIA_TRI_KHONG_HOP_LE') return invalidValueMessage(key);
  if (code === 'TONG_TRONG_SO_KHAC_1') return WEIGHT_SUM_MESSAGE;
  if (code === 'CAU_HINH_THIEU_GIA_TRI') return REQUIRED_MESSAGE;
  return undefined;
}

function fromFieldErrors(items: readonly FieldError[]): SaveFailure {
  const fields: FieldErrors = {};
  let reason: string | undefined;
  for (const { truong, ma } of items) {
    if (truong === 'lyDo') {
      if (ma === 'LY_DO_BAT_BUOC' || ma === 'THIEU_LY_DO')
        reason = REASON_REQUIRED_MESSAGE;
      continue;
    }
    if (!isConfigKey(truong)) continue;
    const message = fieldMessage(truong, ma);
    if (message !== undefined) fields[truong] = message;
  }
  if (Object.keys(fields).length > 0) return { fields, keepDialogOpen: false };
  if (reason !== undefined) return { fields, reason, keepDialogOpen: true };
  return { fields, banner: INVALID_FORM_MESSAGE, keepDialogOpen: false };
}

/** Lỗi của `PUT /admin/system-config` sang cách hiển thị. Luôn giữ nguyên dữ liệu và lý do đã nhập (làm ở nơi gọi). */
export function describeSaveFailure(error: unknown): SaveFailure {
  if (error instanceof ApiError) {
    if (error.maLoi === 'DU_LIEU_KHONG_HOP_LE')
      return fromFieldErrors(error.loi ?? []);
    if (error.maLoi === 'THIEU_LY_DO')
      return {
        fields: {},
        reason: REASON_REQUIRED_MESSAGE,
        keepDialogOpen: true,
      };
    if (error.maLoi === 'KHONG_CO_THAY_DOI')
      return { fields: {}, banner: NO_CHANGE_MESSAGE, keepDialogOpen: false };
    if (error.status === 403 || error.maLoi === 'KHONG_DU_QUYEN')
      return { fields: {}, banner: FORBIDDEN_MESSAGE, keepDialogOpen: false };
    if (error.maLoi === 'HE_THONG_CHUA_CAU_HINH')
      return {
        fields: {},
        banner: NOT_CONFIGURED_MESSAGE,
        keepDialogOpen: false,
      };
    return {
      fields: {},
      banner:
        error.status === 500 && error.maLoi === 'LOI_HE_THONG'
          ? SERVER_ERROR_MESSAGE
          : GENERIC_SAVE_ERROR_MESSAGE,
      keepDialogOpen: true,
    };
  }
  // Mất mạng, hết hạn chờ, phản hồi không phải JSON: không biết máy chủ đã xử lý hay chưa
  return {
    fields: {},
    banner: `${errorMessageFor(error)} ${UNKNOWN_RESULT_HINT}`,
    keepDialogOpen: true,
  };
}
