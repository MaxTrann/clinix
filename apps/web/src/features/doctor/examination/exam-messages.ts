import {
  errorMessageFor,
  GENERIC_ERROR_MESSAGE,
} from '../../../shared/api/error-message';
import {
  ApiError,
  NetworkError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../shared/api/errors';
import {
  EXAM_TEXT_MAX,
  FOLLOW_UP_MAX_DAYS,
  TEXT_FIELDS,
  type FieldCode,
  type FieldErrors,
  type RecordField,
} from './exam-record-form';

// Chữ và câu lỗi của nút `Hoàn thành ca khám` (doctor-exam F1; Figma `459:2`, `461:2`; PLAN 5.14). Chữ có trong Figma: `action`, `prompt`, `confirm`, `cancel`.
// Còn lại là [đề xuất], chờ nhóm duyệt (Figma không có khung cho đang gửi, thành công, lỗi): `groupLabel`, `confirming`, `reload`, `done`, `unsure` và các câu lỗi
// (Đại duyệt qua phiên kiểm 15/11/2026; `Không tìm thấy ca khám này.` thêm "ca khám này" so với PLAN 5.14 cho đủ ý).
export const COMPLETE_TEXT = {
  action: 'Hoàn thành ca khám',
  prompt: 'Xác nhận hoàn thành?',
  groupLabel: 'Xác nhận hoàn thành ca khám',
  confirm: 'Xác nhận',
  confirming: 'Đang hoàn thành...',
  cancel: 'Hủy',
  reload: 'Tải lại chi tiết',
  done: 'Đã hoàn thành ca khám.',
  already: 'Ca khám này đã được hoàn thành.',
  notFound: 'Không tìm thấy ca khám này.',
  notReceived: 'Chỉ hoàn thành được ca khám đã tiếp đón.',
  busy: 'Hệ thống đang bận, thử lại sau ít phút.',
  // Hai câu dưới chép chữ của booking (`COMMON_LIST_TEXT.sessionExpired`, `COMMON_ACTION_TEXT.forbidden`): Q20 phương án C cấm `features/doctor` import `features/booking`
  sessionExpired: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  forbidden: 'Bạn không có quyền thực hiện thao tác này.',
  unsure:
    'Chưa rõ ca khám đã được hoàn thành chưa (mất kết nối hoặc quá thời gian chờ). Hãy tải lại chi tiết để kiểm tra.',
} as const;

// `final`   chỉ còn đóng hàng xác nhận (cùng yêu cầu cùng kết quả, hoặc lịch đã đổi);
// `retry`   bấm lại được (503 hoàn tác trọn, lỗi lạ): hàng xác nhận ở lại;
// `uncertain` chưa rõ máy chủ đã xử lý chưa (mạng, quá giờ, 200 sai hình dạng): KHÔNG tự gửi lại, mời tải lại chi tiết;
// `already` 409 mà lịch ĐÃ `HoanThanh` (bấm lần hai hay ở tab khác): không phải lỗi, nơi gọi hiện như thành công.
// `refresh`: có tải lại chi tiết hay không (dữ liệu đang hiện đã lệch máy chủ nên nút phải khớp lại).
export type FailureKind = 'final' | 'retry' | 'uncertain' | 'already';

export interface CompleteFailure {
  message: string;
  kind: FailureKind;
  refresh: boolean;
}

const MA_LOI = {
  notFound: 'KHONG_TIM_THAY',
  invalidTransition: 'CHUYEN_TRANG_THAI_KHONG_HOP_LE',
  busy: 'HE_THONG_DANG_BAN',
  forbidden: 'KHONG_DU_QUYEN',
  unauthenticated: 'CHUA_DANG_NHAP',
} as const;

const COMPLETED_STATE = 'HoanThanh';

// Đọc một khoá của `chiTiet` (kiểu `unknown` do máy chủ gửi): không phải đối tượng hay thiếu khoá ⇒ `undefined`
function detailField(chiTiet: unknown, key: string): unknown {
  return typeof chiTiet === 'object' && chiTiet !== null
    ? (chiTiet as Record<string, unknown>)[key]
    : undefined;
}

const failure = (
  message: string,
  kind: FailureKind,
  refresh: boolean,
): CompleteFailure => ({ message, kind, refresh });

// 409: chỉ khi `chiTiet.tuTrangThai` đúng là `HoanThanh` mới coi là "đã hoàn thành"; thiếu hay lạ thì KHÔNG đoán
function invalidTransition(error: ApiError): CompleteFailure {
  return detailField(error.chiTiet, 'tuTrangThai') === COMPLETED_STATE
    ? failure(COMPLETE_TEXT.already, 'already', true)
    : failure(COMPLETE_TEXT.notReceived, 'final', true);
}

// Khoá là `maLoi`; dùng `Map` (không phải đối tượng thường) để `maLoi` lạ như "constructor" không trúng khoá của nguyên mẫu
const RULES = new Map<string, (error: ApiError) => CompleteFailure>([
  [MA_LOI.notFound, () => failure(COMPLETE_TEXT.notFound, 'final', true)],
  [MA_LOI.invalidTransition, invalidTransition],
  [MA_LOI.busy, () => failure(COMPLETE_TEXT.busy, 'retry', false)],
  [MA_LOI.forbidden, () => failure(COMPLETE_TEXT.forbidden, 'final', false)],
  [
    MA_LOI.unauthenticated,
    () => failure(COMPLETE_TEXT.sessionExpired, 'final', false),
  ],
]);

// Chọn câu theo `maLoi` (và `chiTiet.tuTrangThai`), KHÔNG theo mã HTTP hay `thongBao` (CODING_CONVENTION). Hàm thuần: không đọc đồng hồ, không đụng DOM.
export function describeCompleteFailure(error: unknown): CompleteFailure {
  if (error instanceof ApiError) {
    const rule = RULES.get(error.maLoi);
    return rule === undefined
      ? failure(GENERIC_ERROR_MESSAGE, 'retry', false)
      : rule(error);
  }
  // Mạng đứt, quá giờ, phản hồi lạ (nginx 502, 200 sai hình dạng): máy chủ có thể đã xử lý xong ⇒ "chưa rõ", không tự gửi lại
  if (
    error instanceof NetworkError ||
    error instanceof TimeoutError ||
    error instanceof UnexpectedResponseError
  ) {
    return failure(COMPLETE_TEXT.unsure, 'uncertain', false);
  }
  return failure(errorMessageFor(error), 'retry', false);
}

// Dấu chấm ngăn nghìn kiểu Việt Nam ("2.000"), viết tay để không phụ thuộc `Intl` và ngôn ngữ của máy
export function formatCount(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Chữ và câu lỗi của hộp `Ghi chú khám` / `Chỉnh sửa ghi chú khám` (doctor-exam F3; Figma `460:2`, `463:2`; PLAN 5.14). Chữ có trong Figma: `titleNew`, `titleEdit`, `optional`, `placeholders`, `cancel`, `save`.
// Còn lại là [đề xuất] ĐÃ ĐƯỢC ĐẠI DUYỆT trực tiếp 16/11/2026 (Figma không có khung cho lỗi, đang lưu, 409, bộ đếm); riêng `unsaved` và việc dùng `reload` cho lỗi mạng Đại duyệt cùng ngày ở câu (b2) và
// còn ghi [đề xuất] ở PLAN 5.14 để xem lại. Số trong chữ lấy từ hằng của `exam-record-form.ts` (MỘT nơi). Hai câu 401 và 403 chép chữ F1 (Q20 phương án C cấm import booking).
export const SAVE_TEXT = {
  titleNew: 'Ghi chú khám',
  titleEdit: 'Chỉnh sửa ghi chú khám',
  optional: '(tùy chọn)',
  placeholders: {
    trieuChung: 'Mô tả triệu chứng bệnh nhân đã khai...',
    chanDoanSoBo: 'Ghi nhận chẩn đoán ban đầu...',
    huongXuLy: 'Hướng điều trị, lời khuyên cho bệnh nhân...',
  },
  cancel: 'Hủy',
  save: 'Lưu ghi chú',
  saving: 'Đang lưu...',
  reload: 'Tải lại bản mới',
  saved: 'Đã lưu hồ sơ khám.',
  latest: 'Bản mới nhất',
  keepMine: 'Giữ bản của tôi',
  useLatest: 'Dùng bản mới nhất',
  required: {
    trieuChung: 'Vui lòng nhập triệu chứng.',
    chanDoanSoBo: 'Vui lòng nhập chẩn đoán sơ bộ.',
    huongXuLy: 'Vui lòng nhập hướng xử lý / lời khuyên.',
  },
  tooLong: `Tối đa ${formatCount(EXAM_TEXT_MAX)} ký tự.`,
  invalidDate: 'Ngày tái khám không hợp lệ.',
  outOfRange: `Ngày tái khám phải từ ngày khám đến ${FOLLOW_UP_MAX_DAYS} ngày sau.`,
  rejected: 'Nội dung có đoạn giống mật khẩu hoặc mã bí mật; hãy viết lại.',
  conflict:
    'Hồ sơ khám vừa được cập nhật ở nơi khác. Hãy tải lại để xem bản mới nhất.',
  notWritable:
    'Chỉ ghi được hồ sơ khám khi bệnh nhân đã được tiếp đón hoặc ca khám đã hoàn thành.',
  notFound: 'Không tìm thấy ca khám này.',
  busy: 'Hệ thống đang bận, thử lại sau ít phút.',
  sessionExpired: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  forbidden: 'Bạn không có quyền thực hiện thao tác này.',
  unsure:
    'Chưa rõ hồ sơ đã được lưu chưa (mất kết nối hoặc quá thời gian chờ). Nội dung của bạn vẫn còn ở đây.',
  unsaved: 'Hồ sơ chưa được lưu. Bấm Lưu ghi chú để thử lại.',
} as const;

// Câu lỗi của MỘT ô theo mã (lỗi ở máy và lỗi máy chủ dùng chung bảng này)
export function fieldMessage(field: RecordField, code: FieldCode): string {
  switch (code) {
    case 'BAT_BUOC':
      return field === 'ngayTaiKhamDuKien'
        ? SAVE_TEXT.invalidDate
        : SAVE_TEXT.required[field];
    case 'QUA_DAI':
      return SAVE_TEXT.tooLong;
    case 'NGAY_NGOAI_KHOANG':
      return SAVE_TEXT.outOfRange;
    case 'NOI_DUNG_KHONG_HOP_LE':
      return SAVE_TEXT.rejected;
    case 'NGAY_KHONG_HOP_LE':
      return SAVE_TEXT.invalidDate;
  }
}

// `field`     400 có `loi[]` hiểu được: lỗi hiện DƯỚI đúng ô, nội dung giữ nguyên, không dải chung (`message` là `null`);
// `retry`     503, lỗi lạ, 400 không ánh xạ được (lỗi lập trình): bấm Lưu lại được;
// `final`     404, 401, 403, 409 `KHONG_THE_GHI_HO_SO_KHAM`: Lưu khoá, chỉ còn `Hủy`;
// `conflict`  409 `HO_SO_KHAM_DA_THAY_DOI` (sửa chồng): Lưu khoá tới khi tải lại và chọn bản;
// `uncertain` mạng, quá giờ, 200 sai hình dạng: máy chủ có thể đã lưu, KHÔNG tự gửi lại, Lưu vẫn bấm lại được (an toàn nhờ token).
// `refresh`: có tải lại chi tiết ngay hay không (dữ liệu đang hiện chắc chắn lệch máy chủ).
export type SaveFailureKind =
  'field' | 'retry' | 'final' | 'conflict' | 'uncertain';

export interface SaveFailure {
  message: string | null;
  kind: SaveFailureKind;
  fields: FieldErrors;
  refresh: boolean;
}

const saveFailure = (
  message: string | null,
  kind: SaveFailureKind,
  refresh = false,
  fields: FieldErrors = {},
): SaveFailure => ({ message, kind, fields, refresh });

const SAVE_CODES = {
  validation: 'DU_LIEU_KHONG_HOP_LE',
  notWritable: 'KHONG_THE_GHI_HO_SO_KHAM',
  changed: 'HO_SO_KHAM_DA_THAY_DOI',
} as const;

const RECORD_FIELDS: ReadonlySet<string> = new Set<RecordField>([
  ...TEXT_FIELDS,
  'ngayTaiKhamDuKien',
]);
const TEXT_CODES: ReadonlySet<string> = new Set<FieldCode>([
  'BAT_BUOC',
  'QUA_DAI',
  'NOI_DUNG_KHONG_HOP_LE',
]);

// Ô nào nhận mã nào: ba ô chữ nhận `BAT_BUOC`, `QUA_DAI`, `NOI_DUNG_KHONG_HOP_LE`; ô ngày chỉ nhận `NGAY_KHONG_HOP_LE`. Khoá lạ, mã lạ, phần tử sai dạng bị bỏ; cùng một ô giữ lỗi ĐẦU.
function readFieldErrors(loi: unknown): FieldErrors {
  const fields: FieldErrors = {};
  if (!Array.isArray(loi)) return fields;
  for (const entry of loi as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { truong, ma } = entry as Record<string, unknown>;
    if (typeof truong !== 'string' || typeof ma !== 'string') continue;
    if (!RECORD_FIELDS.has(truong)) continue;
    const field = truong as RecordField;
    if (fields[field] !== undefined) continue;
    const accepted =
      field === 'ngayTaiKhamDuKien'
        ? ma === 'NGAY_KHONG_HOP_LE'
        : TEXT_CODES.has(ma);
    if (accepted) fields[field] = ma as FieldCode;
  }
  return fields;
}

function invalidData(error: ApiError): SaveFailure {
  const fields = readFieldErrors(error.loi);
  return Object.keys(fields).length > 0
    ? saveFailure(null, 'field', false, fields)
    : saveFailure(GENERIC_ERROR_MESSAGE, 'retry');
}

// Khoá là `maLoi`; dùng `Map` để `maLoi` lạ như "constructor" không trúng khoá của nguyên mẫu
const SAVE_RULES = new Map<string, (error: ApiError) => SaveFailure>([
  [SAVE_CODES.validation, invalidData],
  [SAVE_CODES.changed, () => saveFailure(SAVE_TEXT.conflict, 'conflict')],
  [
    SAVE_CODES.notWritable,
    () => saveFailure(SAVE_TEXT.notWritable, 'final', true),
  ],
  [MA_LOI.notFound, () => saveFailure(SAVE_TEXT.notFound, 'final', true)],
  [MA_LOI.busy, () => saveFailure(SAVE_TEXT.busy, 'retry')],
  [MA_LOI.forbidden, () => saveFailure(SAVE_TEXT.forbidden, 'final')],
  [
    MA_LOI.unauthenticated,
    () => saveFailure(SAVE_TEXT.sessionExpired, 'final'),
  ],
]);

// Chọn câu theo `maLoi` (và `loi[].ma`), KHÔNG theo mã HTTP hay `thongBao`. Hàm thuần: không đọc đồng hồ, không đụng DOM. Không bao giờ đưa nội dung hồ sơ vào câu lỗi.
export function describeSaveFailure(error: unknown): SaveFailure {
  if (error instanceof ApiError) {
    const rule = SAVE_RULES.get(error.maLoi);
    return rule === undefined
      ? saveFailure(GENERIC_ERROR_MESSAGE, 'retry')
      : rule(error);
  }
  // Mạng đứt, quá giờ, phản hồi lạ (nginx 502, 200 sai hình dạng): máy chủ có thể đã lưu xong ⇒ "chưa rõ", không tự gửi lại
  if (
    error instanceof NetworkError ||
    error instanceof TimeoutError ||
    error instanceof UnexpectedResponseError
  ) {
    return saveFailure(SAVE_TEXT.unsure, 'uncertain');
  }
  return saveFailure(errorMessageFor(error), 'retry');
}
