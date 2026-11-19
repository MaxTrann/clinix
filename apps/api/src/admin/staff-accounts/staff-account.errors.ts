import { REGISTER_ERROR_CODES } from '../../auth/auth.constants.js';
import {
  AppException,
  type FieldError,
} from '../../common/errors/app.exception.js';
import {
  COMMON_ERROR_CODES,
  INVALID_DATA_MESSAGE,
} from '../../common/errors/error-codes.js';

// Mã lỗi của task B15 (PLAN admin 5.9). Chữ của ba mã đầu là chữ ĐÃ duyệt ở PLAN 5.9; FE chọn thông báo theo MÃ, câu này chỉ là mặc định cho người
// đọc phản hồi thô. Mã trường (STAFF_ACCOUNT_FIELD_CODES) là `[đề xuất]` của B15, nằm trong `loi[{truong, ma}]` của 400 DU_LIEU_KHONG_HOP_LE.
export const STAFF_ACCOUNT_ERROR_CODES = {
  // 409; cùng mã với đăng ký của auth, nhưng chữ KHÔNG có "Vui lòng đăng nhập" (người gọi là Quản trị viên)
  EMAIL_IN_USE: REGISTER_ERROR_CODES.EMAIL_IN_USE,
  // 400
  TITLE_DEGREE_MISMATCH: 'CHUC_DANH_HOC_VI_KHONG_TUONG_THICH',
  // 400 (cũng cho dịch vụ không tồn tại: không có hàng liên kết chi nhánh–dịch vụ)
  SERVICE_NOT_AT_BRANCH: 'DICH_VU_KHONG_O_CHI_NHANH',
} as const;

// "Thiếu" và "sai" của một trường dùng CHUNG một mã (trường vắng cũng không hợp lệ).
export const STAFF_ACCOUNT_FIELD_CODES = {
  role: 'VAI_TRO_KHONG_HOP_LE',
  // Sai dạng, không tồn tại và ngoài phạm vi người gọi: CÙNG mã và cùng thân, để không lộ chi nhánh khác (Q40, NS-06)
  branch: 'CHI_NHANH_KHONG_HOP_LE',
  // Sai dạng, không tồn tại và `NgungHoatDong` (Q19)
  specialty: 'CHUYEN_KHOA_KHONG_HOP_LE',
  serviceId: 'DICH_VU_KHAM_ID_KHONG_HOP_LE',
  title: 'CHUC_DANH_KHONG_HOP_LE',
  degree: 'HOC_VI_KHONG_HOP_LE',
  experience: 'SO_NAM_KINH_NGHIEM_KHONG_HOP_LE',
  adminScope: 'PHAM_VI_KHONG_HOP_LE',
} as const;

const invalidField = (loi: FieldError[]): AppException =>
  new AppException(400, COMMON_ERROR_CODES.INVALID_DATA, {
    thongBao: INVALID_DATA_MESSAGE,
    loi,
  });

/** 403 `KHONG_DU_QUYEN`: Quản trị viên Chi nhánh chọn vai trò Quản trị viên (NS-07). */
export const notAllowed = (): AppException =>
  new AppException(403, COMMON_ERROR_CODES.FORBIDDEN);

/** 400 trên `chiNhanhId`: chi nhánh không tồn tại HOẶC ngoài phạm vi, cùng một thân (Q40, NS-06). */
export const invalidBranch = (): AppException =>
  invalidField([
    { truong: 'chiNhanhId', ma: STAFF_ACCOUNT_FIELD_CODES.branch },
  ]);

/** 400 trên `chuyenKhoaId`: không tồn tại hoặc `NgungHoatDong` (Q19, NS-16). */
export const invalidSpecialty = (): AppException =>
  invalidField([
    { truong: 'chuyenKhoaId', ma: STAFF_ACCOUNT_FIELD_CODES.specialty },
  ]);

export const titleDegreeMismatch = (): AppException =>
  new AppException(400, STAFF_ACCOUNT_ERROR_CODES.TITLE_DEGREE_MISMATCH, {
    thongBao: 'Chức danh và học vị không tương thích.',
  });

export const serviceNotAtBranch = (): AppException =>
  new AppException(400, STAFF_ACCOUNT_ERROR_CODES.SERVICE_NOT_AT_BRANCH, {
    thongBao: 'Dịch vụ khám chính không được cung cấp tại chi nhánh đã chọn.',
  });

export const emailInUse = (): AppException =>
  new AppException(409, STAFF_ACCOUNT_ERROR_CODES.EMAIL_IN_USE, {
    thongBao: 'Email này đã được sử dụng.',
  });
