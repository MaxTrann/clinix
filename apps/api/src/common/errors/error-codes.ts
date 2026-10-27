// Mã lỗi ổn định dùng chung cho mọi module (PLAN auth mục 5.5, plan admin mục 5.9). Frontend chọn thông báo theo MÃ, không theo câu chữ.
// Mã nghiệp vụ riêng của từng module (EMAIL_DA_DUNG, YEU_CAU_DANG_CHO…) nằm ở module đó; ở đây chỉ có mã chung cho lỗi giao thức.
export const COMMON_ERROR_CODES = {
  INTERNAL: 'LOI_HE_THONG', // [đề xuất] mọi lỗi ngoài dự kiến, kèm requestId
  BAD_REQUEST: 'YEU_CAU_KHONG_HOP_LE', // [đề xuất] 4xx chung (JSON hỏng, tham số sai…)
  INVALID_DATA: 'DU_LIEU_KHONG_HOP_LE', // plan admin 5.9: lỗi kiểm dữ liệu, kèm loi[{truong, ma}]
  UNAUTHENTICATED: 'CHUA_DANG_NHAP', // A4 (auth.constants.ts)
  FORBIDDEN: 'KHONG_DU_QUYEN', // A4 và plan admin 5.9
  NOT_FOUND: 'KHONG_TIM_THAY', // plan admin 5.9: cả route lạ lẫn tài nguyên không có/ngoài phạm vi (cùng thân phản hồi)
  METHOD_NOT_ALLOWED: 'PHUONG_THUC_KHONG_DUOC_PHEP', // [đề xuất]
  PAYLOAD_TOO_LARGE: 'DU_LIEU_QUA_LON', // [đề xuất]
} as const;

// Mã của MỘT trường trong loi[{truong, ma}] khi dự án chưa đặt mã riêng
export const FIELD_ERROR_CODES = {
  NOT_ALLOWED: 'TRUONG_KHONG_DUOC_PHEP', // [đề xuất] trường lạ (forbidNonWhitelisted)
} as const;

// Mã ổn định: chữ HOA, số, gạch dưới, bắt đầu bằng chữ. Thông điệp lỗi khớp mẫu này được coi là mã (cách A3/A4 ném lỗi);
// thông điệp tự do ("Cannot GET /x", "Bad Request"…) thì không bao giờ được chuyển ra ngoài.
export const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export function isErrorCode(value: unknown): value is string {
  return typeof value === 'string' && ERROR_CODE_PATTERN.test(value);
}

export interface ErrorDefaults {
  maLoi: string;
  thongBao: string;
}

export const INVALID_DATA_MESSAGE = 'Dữ liệu không hợp lệ.';
const BAD_REQUEST_DEFAULTS: ErrorDefaults = {
  maLoi: COMMON_ERROR_CODES.BAD_REQUEST,
  thongBao: 'Yêu cầu không hợp lệ.',
};

// Mã và câu mặc định theo trạng thái HTTP. `thongBao` chỉ để người đọc/log, frontend KHÔNG dựa vào nó (câu chữ chốt ở PLAN 5.5 và Figma).
export function defaultsForStatus(status: number): ErrorDefaults {
  switch (status) {
    case 401:
      return {
        maLoi: COMMON_ERROR_CODES.UNAUTHENTICATED,
        thongBao: 'Bạn chưa đăng nhập hoặc phiên đăng nhập không còn hiệu lực.',
      };
    case 403:
      return {
        maLoi: COMMON_ERROR_CODES.FORBIDDEN,
        thongBao: 'Bạn không có quyền thực hiện thao tác này.',
      };
    case 404:
      return {
        maLoi: COMMON_ERROR_CODES.NOT_FOUND,
        thongBao: 'Không tìm thấy dữ liệu.',
      };
    case 405:
      return {
        maLoi: COMMON_ERROR_CODES.METHOD_NOT_ALLOWED,
        thongBao: 'Phương thức không được hỗ trợ.',
      };
    case 413:
      return {
        maLoi: COMMON_ERROR_CODES.PAYLOAD_TOO_LARGE,
        thongBao: 'Dữ liệu gửi lên quá lớn.',
      };
    default:
      return status >= 500
        ? {
            maLoi: COMMON_ERROR_CODES.INTERNAL,
            thongBao: 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.',
          }
        : BAD_REQUEST_DEFAULTS;
  }
}
