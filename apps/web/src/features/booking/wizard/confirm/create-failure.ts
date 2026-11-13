import { GENERIC_ERROR_MESSAGE } from '../../../../shared/api/error-message';
import { ApiError } from '../../../../shared/api/errors';
import {
  BOOKING_ERROR_CODES,
  knownBookingError,
} from '../../api/booking-errors';
import { CODE_INVALID_INPUT } from '../../appointments/common/error-kinds';
import { BUSY_MESSAGE } from '../../appointments/common/failure-text';
import { COMMON_LIST_TEXT } from '../../appointments/common/list-text';

// Câu và cách xử lý khi `POST /booking/appointments` lỗi (booking F5; PLAN 5.14, TRACKING 3.34 F5-G, F5-H). Hàm thuần: không đọc đồng hồ, không đụng DOM, không biết đường dẫn (nơi vẽ
// đổi `links` thành liên kết). Chọn câu theo `maLoi` (và `loi[].ma`, `chiTiet`), KHÔNG theo mã HTTP hay `thongBao` (CODING_CONVENTION). Các mã của luật đặt lịch (A2, A3, A4, A6, ngừng hồ sơ)
// lấy từ MỘT bảng `knownBookingError` mà Bước 4 cũng dùng; ở đây chỉ thêm phần riêng của lời gọi TẠO.
//   retry      bấm lại được: 503 (giao dịch hoàn tác trọn), lỗi lạ, khung giờ đang giữ (thử lại sau ít phút), hệ thống chưa cấu hình
//   final      cùng yêu cầu sẽ cùng kết quả (khung giờ đã đặt, hồ sơ, chi nhánh, quyền, phiên): chỉ còn rời đi sửa
//   uncertain  CHƯA RÕ máy chủ đã tạo lịch chưa (mạng đứt, quá giờ, phản hồi sai hình dạng, bị huỷ giữa chừng): KHÔNG chuyển bước, KHÔNG tự gửi lại
export type CreateFailureKind = 'retry' | 'final' | 'uncertain';
// Đích của liên kết đi kèm câu: `reselect` chọn lại khung giờ (tạm Bước 1, F3 (k)), `editProfile` và `editReason` về Bước 4 (bản nháp còn nguyên), `myAppointments` "Lịch hẹn của tôi"
export type CreateFailureLink =
  'reselect' | 'editProfile' | 'editReason' | 'myAppointments';

export interface CreateFailure {
  message: string;
  kind: CreateFailureKind;
  links: CreateFailureLink[];
  // Câu giải thích thêm (vì sao bấm lại có thể báo khung giờ đang giữ)
  note?: string;
}

// Mã TRƯỜNG ở `loi[].ma` của 400 `DU_LIEU_KHONG_HOP_LE` (PLAN 5.14); luật client trùng luật server nên hiếm khi xảy ra
const FIELD_CODE_INVALID_VISIT_REASON = 'LY_DO_KHAM_KHONG_HOP_LE';

export const CREATE_FAILURE_TEXT = {
  // [đề xuất] chờ nhóm duyệt cùng bảng 5.14
  uncertain:
    'Chưa rõ lịch hẹn đã được tạo hay chưa vì không nhận được phản hồi từ máy chủ. Hãy kiểm tra ở Lịch hẹn của tôi trước khi đặt lại.',
  uncertainNote:
    'Nếu lịch đã được tạo, đặt lại cùng khung giờ sẽ báo khung giờ đang được giữ hoặc đã có người đặt, vì chính lịch đó đang giữ khung giờ này.',
  afterUncertainNote:
    'Nếu lúc trước bạn chưa nhận được kết quả, đây có thể chính là lịch bạn vừa đặt: hãy kiểm tra ở Lịch hẹn của tôi.',
  invalidVisitReason: 'Lý do khám không hợp lệ (tối đa 500 ký tự).',
} as const;

const SLOT_CONFLICT_CODES: ReadonlySet<string> = new Set([
  BOOKING_ERROR_CODES.SLOT_TAKEN,
  BOOKING_ERROR_CODES.SLOT_HELD,
]);

// Liên kết theo nhóm nguyên nhân của bảng `knownBookingError`
const SCOPE_LINKS = {
  slot: ['reselect'],
  profile: ['editProfile'],
  account: [],
} as const;

function describeApiError(
  error: ApiError,
  afterUncertain: boolean,
): CreateFailure {
  if (error.maLoi === BOOKING_ERROR_CODES.UNAUTHENTICATED) {
    return {
      message: COMMON_LIST_TEXT.sessionExpired,
      kind: 'final',
      links: [],
    };
  }
  // 503: hết lượt thử lại deadlock, giao dịch hoàn tác trọn (PLAN 5.3 quy tắc 5) nên bấm lại an toàn
  if (error.maLoi === BOOKING_ERROR_CODES.SYSTEM_BUSY) {
    return { message: BUSY_MESSAGE, kind: 'retry', links: [] };
  }
  if (
    error.maLoi === CODE_INVALID_INPUT &&
    error.loi?.some((item) => item.ma === FIELD_CODE_INVALID_VISIT_REASON)
  ) {
    return {
      message: CREATE_FAILURE_TEXT.invalidVisitReason,
      kind: 'final',
      links: ['editReason'],
    };
  }

  const known = knownBookingError(error);
  if (known === undefined) {
    // Mã lạ, 500 JSON `LOI_HE_THONG`, 400 khác: máy chủ ĐÃ trả lời lỗi (không phải mất phản hồi) nên bấm lại được
    return { message: GENERIC_ERROR_MESSAGE, kind: 'retry', links: [] };
  }
  // 404 `KHONG_TIM_THAY`: câu trung tính (do hồ sơ hay khung giờ) nên cho cả hai đường sửa
  const links: CreateFailureLink[] =
    error.maLoi === BOOKING_ERROR_CODES.NOT_FOUND
      ? ['editProfile', 'reselect']
      : [...SCOPE_LINKS[known.scope]];
  const kind: CreateFailureKind = known.retryable ? 'retry' : 'final';
  // Sau một lần "chưa rõ", khung giờ báo đã đặt hay đang giữ có thể là của CHÍNH lịch vừa tạo: nói rõ và chỉ nơi kiểm tra
  if (afterUncertain && SLOT_CONFLICT_CODES.has(error.maLoi)) {
    return {
      message: known.message,
      kind,
      links: [...links, 'myAppointments'],
      note: CREATE_FAILURE_TEXT.afterUncertainNote,
    };
  }
  return { message: known.message, kind, links };
}

// `afterUncertain`: trước đó đã có MỘT lần "chưa rõ" trong phiên Bước 5 này (chỉ ở bộ nhớ của hook).
// Mọi lỗi KHÔNG phải `ApiError` (`NetworkError`, `TimeoutError`, `UnexpectedResponseError` kể cả 502 hay 504 HTML và 201 sai hình dạng, `RequestAbortedError`, hay lỗi không biết loại)
// nghĩa là không có phản hồi nghiệp vụ đáng tin: máy chủ CÓ THỂ đã tạo lịch ⇒ "chưa rõ", không bao giờ coi là thất bại chắc chắn.
export function describeCreateFailure(
  error: unknown,
  options: { afterUncertain: boolean },
): CreateFailure {
  if (error instanceof ApiError) {
    return describeApiError(error, options.afterUncertain);
  }
  return {
    message: CREATE_FAILURE_TEXT.uncertain,
    kind: 'uncertain',
    links: ['myAppointments'],
    note: CREATE_FAILURE_TEXT.uncertainNote,
  };
}
