import { ApiError } from '../../../../../shared/api/errors';
import {
  BOOKING_ERROR_CODES,
  knownBookingErrorByCode,
} from '../../../api/booking-errors';
import { BUSY_MESSAGE } from '../../common/failure-text';

// Mã lỗi nghiệp vụ của đổi lịch và câu hiển thị (PLAN reschedule 5.13; reschedule F1, F2 dùng lại cho `POST`). Chữ là `[đề xuất]` (Q13), Đại sửa khi duyệt PR. Giao diện chọn câu theo
// `maLoi`, KHÔNG theo `thongBao` hay mã HTTP (CODING_CONVENTION): cùng mã ở thân 409 hay ở `lyDoKhongDoi` của preview 200 ra cùng một câu.
export const RESCHEDULE_ERROR_CODES = {
  NOT_RESCHEDULABLE: 'LICH_HEN_KHONG_CHO_DOI',
  TOO_LATE: 'LICH_HEN_DA_QUA_GIO',
  SAME_AS_CURRENT_SLOT: 'KHUNG_GIO_TRUNG_LICH_CU',
  OTHER_DOCTOR: 'KHUNG_GIO_KHAC_BAC_SI',
  SERVICE_CHANGED: 'LICH_HEN_KHAC_DICH_VU_HIEN_TAI',
  BRANCH_CHANGED: 'LICH_HEN_KHAC_CHI_NHANH_HIEN_TAI',
  OVER_SELF_LIMIT: 'VUOT_SO_LAN_TU_DOI',
  REQUEST_PENDING: 'DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET',
  CHAIN_TOO_LONG: 'CHUOI_DOI_LICH_QUA_DAI',
} as const;

// Câu CỦA 5.13, nguyên văn. Dùng `Map` (không phải đối tượng thường) để `maLoi` lạ như "constructor" không trúng khoá của nguyên mẫu.
// `VUOT_SO_LAN_TU_DOI` không dùng `chiTiet` (câu 5.13 không có số).
const OWN_TEXT = new Map<string, string>([
  [
    RESCHEDULE_ERROR_CODES.NOT_RESCHEDULABLE,
    'Lịch hẹn này hiện không thể đổi. Chỉ lịch đã xác nhận mới đổi được.',
  ],
  [RESCHEDULE_ERROR_CODES.TOO_LATE, 'Đã quá giờ hẹn nên không thể đổi lịch.'],
  [
    RESCHEDULE_ERROR_CODES.SAME_AS_CURRENT_SLOT,
    'Bạn đang chọn đúng khung giờ hiện tại. Vui lòng chọn khung giờ khác.',
  ],
  [
    RESCHEDULE_ERROR_CODES.OTHER_DOCTOR,
    'Chỉ đổi được sang khung giờ của cùng bác sĩ. Muốn đổi bác sĩ, vui lòng huỷ và đặt lại.',
  ],
  [
    RESCHEDULE_ERROR_CODES.SERVICE_CHANGED,
    'Bác sĩ đã thay đổi dịch vụ so với lúc đặt. Vui lòng huỷ và đặt lịch mới.',
  ],
  [
    RESCHEDULE_ERROR_CODES.BRANCH_CHANGED,
    'Bác sĩ đã thay đổi chi nhánh so với lúc đặt. Vui lòng huỷ và đặt lịch mới.',
  ],
  [
    RESCHEDULE_ERROR_CODES.OVER_SELF_LIMIT,
    'Bạn đã dùng hết số lần tự đổi. Hãy nhập lý do để gửi yêu cầu cho lễ tân.',
  ],
  [
    RESCHEDULE_ERROR_CODES.REQUEST_PENDING,
    'Lịch hẹn này đã có yêu cầu đổi lịch đang chờ duyệt.',
  ],
  [
    RESCHEDULE_ERROR_CODES.CHAIN_TOO_LONG,
    'Lịch hẹn này đã đổi quá nhiều lần. Vui lòng huỷ và đặt lịch mới.',
  ],
]);

// Mã của bảng booking mà trang đổi lịch KHÔNG dùng câu của nó: câu của chúng nói về việc ĐẶT lịch ("Tài khoản này không được phép đặt lịch", "Không tìm thấy thông tin để đặt lịch…"),
// còn 404, 403 ở trang đổi lịch là MỘT thẻ chung (cùng thân, không lộ lịch có tồn tại hay không) và 401 là câu phiên hết hạn.
const NOT_FOR_RESCHEDULE: ReadonlySet<string> = new Set([
  BOOKING_ERROR_CODES.NOT_FOUND,
  BOOKING_ERROR_CODES.FORBIDDEN,
  BOOKING_ERROR_CODES.LOCKED_NO_SHOW,
  BOOKING_ERROR_CODES.UNAUTHENTICATED,
]);

// Câu chung khi preview nói không đổi được mà không kèm mã (hoặc mã lạ): không bao giờ in mã thô ra màn hình
export const RESCHEDULE_NOT_ALLOWED_MESSAGE =
  'Lịch hẹn này hiện không thể đổi.';

export interface RescheduleMessage {
  message: string;
  // Có đáng thử lại không (hệ thống bận hoặc chưa cấu hình có thể đã khác sau đó); lỗi nghiệp vụ thì không: cùng yêu cầu cùng kết quả
  retryable: boolean;
}

// Câu cho một `maLoi`; undefined nếu mã lạ hay không thuộc trang đổi lịch (nơi gọi dùng thẻ hoặc câu chung của `ErrorState`)
export function rescheduleMessageForCode(
  maLoi: string,
  chiTiet?: unknown,
): RescheduleMessage | undefined {
  const own = OWN_TEXT.get(maLoi);
  if (own !== undefined) return { message: own, retryable: false };
  if (maLoi === BOOKING_ERROR_CODES.SYSTEM_BUSY) {
    return { message: BUSY_MESSAGE, retryable: true };
  }
  if (NOT_FOR_RESCHEDULE.has(maLoi)) return undefined;
  const known = knownBookingErrorByCode(maLoi, chiTiet);
  return known === undefined
    ? undefined
    : { message: known.message, retryable: known.retryable };
}

export function rescheduleMessageForError(
  error: unknown,
): RescheduleMessage | undefined {
  return error instanceof ApiError
    ? rescheduleMessageForCode(error.maLoi, error.chiTiet)
    : undefined;
}

// Câu cho `lyDoKhongDoi` của preview 200 (`choPhepDoi = false`): vắng hoặc mã lạ ⇒ câu chung
export function rescheduleReasonMessage(lyDoKhongDoi: string | undefined) {
  return (
    (lyDoKhongDoi === undefined
      ? undefined
      : rescheduleMessageForCode(lyDoKhongDoi)
    )?.message ?? RESCHEDULE_NOT_ALLOWED_MESSAGE
  );
}
