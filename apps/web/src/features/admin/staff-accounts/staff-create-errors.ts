import { GENERIC_ERROR_MESSAGE } from '../../../shared/api/error-message';
import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../shared/api/errors';
import { FIELD_MESSAGES } from '../../auth';
import { FORBIDDEN_MESSAGE } from '../account-common/account-errors';
import {
  EXPERIENCE_MESSAGE,
  TITLE_DEGREE_MESSAGE,
  type FieldErrors,
  type FieldName,
} from './staff-create-model';

// Lỗi của `POST /admin/staff-accounts` (B15; PLAN 5.9) sang chữ. Chọn câu theo MÃ (`maLoi`, `loi[].ma`), không theo `thongBao` hay mã HTTP.
// Chữ lấy NGUYÊN VĂN từ PLAN 5.9 khi có; còn lại là `[đề xuất]` (TRACKING admin 9A.21). Không bao giờ in tên trường thô hay thông điệp của máy chủ.

export const EMAIL_IN_USE_MESSAGE = 'Email này đã được sử dụng.';
export const GENERAL_INVALID_MESSAGE =
  'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.';
export const INVALID_FIELD_MESSAGE = 'Giá trị không hợp lệ.';
export const SERVER_CREATE_MESSAGE =
  'Không thực hiện được. Chưa có tài khoản nào được tạo, vui lòng thử lại.';
export const UNKNOWN_CREATE_MESSAGE =
  'Chưa rõ tài khoản đã được tạo hay chưa. Hãy kiểm tra danh sách nhân sự trước khi tạo lại.';
const SERVICE_NOT_AT_BRANCH_MESSAGE =
  'Dịch vụ khám chính không được cung cấp tại chi nhánh đã chọn.';

/**
 * Kết quả giải thích một lỗi. `fields`: lỗi vào đúng ô (kèm câu chung nếu còn lỗi không gắn được vào ô nào); `message`: lỗi chung của biểu mẫu;
 * `unknown`: mất mạng hay hết hạn chờ, chưa rõ máy chủ đã tạo hay chưa; `ignored`: nơi gọi tự huỷ, không có gì để báo.
 */
export type CreateFailure =
  | { kind: 'fields'; fields: FieldErrors; message?: string }
  | { kind: 'message'; message: string }
  | { kind: 'unknown' }
  | { kind: 'ignored' };

// `truong` của `loi[]` là tên khoá của thân (DTO B15) và cũng là tên ô của biểu mẫu
const KNOWN_FIELDS: readonly FieldName[] = [
  'hoTen',
  'email',
  'soDienThoai',
  'chiNhanhId',
  'chuyenKhoaId',
  'dichVuKhamId',
  'chucDanh',
  'hocVi',
  'soNamKinhNghiem',
  'phamVi',
];

// Mã mức trường trong `loi[{truong, ma}]` của 400 DU_LIEU_KHONG_HOP_LE
const FIELD_CODE_MESSAGES: Record<string, string> = {
  HO_TEN_KHONG_HOP_LE: FIELD_MESSAGES.HO_TEN_KHONG_HOP_LE,
  EMAIL_KHONG_HOP_LE: FIELD_MESSAGES.EMAIL_KHONG_HOP_LE,
  SDT_KHONG_HOP_LE: FIELD_MESSAGES.SDT_KHONG_HOP_LE,
  // Cố ý KHÔNG phân biệt "ngoài phạm vi" với "không tồn tại" (Q40, NS-06): không lộ chi nhánh khác
  CHI_NHANH_KHONG_HOP_LE: 'Chi nhánh không hợp lệ.',
  CHUYEN_KHOA_KHONG_HOP_LE: 'Chuyên khoa không hợp lệ hoặc đã ngừng hoạt động.',
  DICH_VU_KHAM_ID_KHONG_HOP_LE: 'Dịch vụ khám chính không hợp lệ.',
  CHUC_DANH_KHONG_HOP_LE: 'Chức danh không hợp lệ.',
  HOC_VI_KHONG_HOP_LE: 'Học vị không hợp lệ.',
  SO_NAM_KINH_NGHIEM_KHONG_HOP_LE: EXPERIENCE_MESSAGE,
  PHAM_VI_KHONG_HOP_LE: 'Phạm vi không hợp lệ.',
};

// Lỗi nghiệp vụ có mã riêng (không nằm trong `loi[]`), mỗi mã gắn vào MỘT ô
const BUSINESS_FIELD_ERRORS: Record<string, [FieldName, string]> = {
  EMAIL_DA_DUNG: ['email', EMAIL_IN_USE_MESSAGE],
  CHUC_DANH_HOC_VI_KHONG_TUONG_THICH: ['hocVi', TITLE_DEGREE_MESSAGE],
  DICH_VU_KHONG_O_CHI_NHANH: ['dichVuKhamId', SERVICE_NOT_AT_BRANCH_MESSAGE],
};

function lookup<T>(table: Record<string, T>, key: string): T | undefined {
  // `Object.hasOwn`: mã như `constructor` hay `__proto__` không được lọt vào qua nguyên mẫu
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

const isKnownField = (value: unknown): value is FieldName =>
  typeof value === 'string' &&
  (KNOWN_FIELDS as readonly string[]).includes(value);

function fromFieldList(list: unknown): CreateFailure {
  const fields: FieldErrors = {};
  let unmapped = false;
  for (const item of Array.isArray(list) ? list : []) {
    if (typeof item !== 'object' || item === null) continue;
    const { truong, ma } = item as { truong?: unknown; ma?: unknown };
    if (!isKnownField(truong) || typeof ma !== 'string') {
      // Trường lạ, vai trò sai, `TRUONG_KHONG_DUOC_PHEP`: lỗi chung, không in tên trường
      if (typeof truong === 'string' && typeof ma === 'string') unmapped = true;
      continue;
    }
    // Ô trùng thì giữ lỗi ĐẦU TIÊN
    fields[truong] ??= lookup(FIELD_CODE_MESSAGES, ma) ?? INVALID_FIELD_MESSAGE;
  }
  if (Object.keys(fields).length === 0)
    return { kind: 'message', message: GENERAL_INVALID_MESSAGE };
  return unmapped
    ? { kind: 'fields', fields, message: GENERAL_INVALID_MESSAGE }
    : { kind: 'fields', fields };
}

/**
 * Phản hồi không đọc được (không phải JSON của API): 5xx là proxy cắt kết nối hay hết hạn chờ (nginx 502, 504), 2xx là thân hỏng. Cả hai trường hợp máy chủ CÓ THỂ đã tạo
 * tài khoản nên là "chưa rõ" (phát hiện khi đo trình duyệt 23/11/2026). 4xx là proxy từ chối trước khi tới API: chưa tạo gì, câu chung.
 */
const isUnreadableMaybeProcessed = (error: UnexpectedResponseError) =>
  error.status >= 500 || (error.status >= 200 && error.status < 300);

/** Lỗi của lần tạo sang chữ và vị trí (ô nào, hay cả biểu mẫu). Không bao giờ ném. */
export function describeCreateFailure(error: unknown): CreateFailure {
  if (error instanceof RequestAbortedError) return { kind: 'ignored' };
  if (error instanceof NetworkError || error instanceof TimeoutError)
    return { kind: 'unknown' };
  if (error instanceof UnexpectedResponseError)
    return isUnreadableMaybeProcessed(error)
      ? { kind: 'unknown' }
      : { kind: 'message', message: GENERIC_ERROR_MESSAGE };
  if (!(error instanceof ApiError))
    return { kind: 'message', message: GENERIC_ERROR_MESSAGE };

  if (error.maLoi === 'DU_LIEU_KHONG_HOP_LE') return fromFieldList(error.loi);
  const business = lookup(BUSINESS_FIELD_ERRORS, error.maLoi);
  if (business !== undefined)
    return { kind: 'fields', fields: { [business[0]]: business[1] } };
  if (error.maLoi === 'KHONG_DU_QUYEN')
    return { kind: 'message', message: FORBIDDEN_MESSAGE };
  if (error.maLoi === 'LOI_HE_THONG')
    return { kind: 'message', message: SERVER_CREATE_MESSAGE };
  return { kind: 'message', message: GENERIC_ERROR_MESSAGE };
}
