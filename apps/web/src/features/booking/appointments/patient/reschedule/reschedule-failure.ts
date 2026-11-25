import { errorMessageFor } from '../../../../../shared/api/error-message';
import {
  ApiError,
  NetworkError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../../../shared/api/errors';
import {
  BOOKING_ERROR_CODES,
  knownBookingErrorByCode,
} from '../../../api/booking-errors';
import { CODE_INVALID_INPUT } from '../../common/error-kinds';
import { DETAIL_TEXT } from '../detail/detail-messages';
import { LIST_TEXT } from '../list-messages';
import {
  RESCHEDULE_ERROR_CODES,
  rescheduleMessageForCode,
} from './reschedule-errors';
import { REQUEST_REASON_LIMITS } from './reschedule-reason-rules';
import { RESCHEDULE_TEXT } from './reschedule-text';

// Lỗi của màn xác nhận đổi lịch ⇒ LOẠI HÀNH ĐỘNG (reschedule F2; PLAN reschedule 5.13; TRACKING 1.14 mục B6). Chọn theo `maLoi`, KHÔNG theo `thongBao` hay mã HTTP (CODING_CONVENTION); câu hiển thị
// lấy từ `rescheduleMessageForCode` của F1 (chín mã 5.13 và mã dùng lại của booking), không có bảng câu thứ hai. Hàm thuần.
//   needsReason    VUOT_SO_LAN_TU_DOI lúc gửi (race hết lần): ở lại, mở ô lý do
//   reasonInvalid  400 lỗi ở trường `lyDoYeuCau`: ở lại, lỗi cạnh ô, giữ chữ
//   slotGone       khung giờ vừa bị đặt, giữ, qua giờ hay biến mất lúc GỬI: về lưới và tải lại lưới
//   pickAnother    lỗi của khung giờ: câu kèm liên kết "Chọn khung giờ khác"
//   backToDetail   lịch (hay hồ sơ) không đổi được: câu kèm liên kết về chi tiết lịch hẹn
//   notFound       404, 403: MỘT thẻ chung (không lộ lịch có tồn tại hay không)
//   session        401: phiên hết hạn
//   retry          hệ thống bận, chưa cấu hình, lỗi lạ: có "Thử lại"
//   uncertain      mạng, quá giờ, phản hồi lạ lúc GỬI: máy chủ có thể đã ghi; gửi lại vẫn an toàn (lần hai ra 404 hay 409, không bao giờ đổi hai lần)
export type RescheduleFailureKind =
  | 'needsReason'
  | 'reasonInvalid'
  | 'slotGone'
  | 'pickAnother'
  | 'backToDetail'
  | 'notFound'
  | 'session'
  | 'retry'
  | 'uncertain';

export interface RescheduleFailure {
  kind: RescheduleFailureKind;
  message: string;
  // Mã lỗi của máy chủ khi có (để trang về lưới kèm đúng câu); null với lỗi không phải ApiError
  maLoi: string | null;
}

// `load`: GET xem trước ở màn xác nhận. `submit`: POST gửi đổi lịch.
export type FailurePhase = 'load' | 'submit';

const SLOT_GONE_CODES: ReadonlySet<string> = new Set([
  BOOKING_ERROR_CODES.SLOT_TAKEN,
  BOOKING_ERROR_CODES.SLOT_HELD,
  BOOKING_ERROR_CODES.SLOT_PAST,
  BOOKING_ERROR_CODES.SLOT_NOT_FOUND,
]);

// Mã khung giờ ngoài `scope: 'slot'` của booking mà chọn khung giờ khác vẫn sửa được
const PICK_ANOTHER_CODES: ReadonlySet<string> = new Set([
  RESCHEDULE_ERROR_CODES.SAME_AS_CURRENT_SLOT,
  RESCHEDULE_ERROR_CODES.OTHER_DOCTOR,
  BOOKING_ERROR_CODES.OVERLAPPING_APPOINTMENT,
]);

export function isSlotGoneCode(maLoi: string): boolean {
  return SLOT_GONE_CODES.has(maLoi);
}

function failure(
  kind: RescheduleFailureKind,
  message: string,
  maLoi: string | null = null,
): RescheduleFailure {
  return { kind, message, maLoi };
}

const FIELD_REASON = 'lyDoYeuCau';

function describeApiFailure(
  error: ApiError,
  phase: FailurePhase,
): RescheduleFailure {
  const { maLoi } = error;
  if (maLoi === BOOKING_ERROR_CODES.UNAUTHENTICATED) {
    return failure('session', LIST_TEXT.sessionExpired, maLoi);
  }
  if (
    maLoi === BOOKING_ERROR_CODES.NOT_FOUND ||
    maLoi === BOOKING_ERROR_CODES.FORBIDDEN
  ) {
    return failure('notFound', DETAIL_TEXT.notFound, maLoi);
  }
  if (phase === 'submit' && maLoi === RESCHEDULE_ERROR_CODES.OVER_SELF_LIMIT) {
    const known = rescheduleMessageForCode(maLoi);
    return failure('needsReason', known?.message ?? '', maLoi);
  }
  if (maLoi === CODE_INVALID_INPUT) {
    return phase === 'submit' &&
      error.loi?.some((item) => item.truong === FIELD_REASON)
      ? failure(
          'reasonInvalid',
          RESCHEDULE_TEXT.reasonRange(
            REQUEST_REASON_LIMITS.min,
            REQUEST_REASON_LIMITS.max,
          ),
          maLoi,
        )
      : failure('retry', errorMessageFor(error), maLoi);
  }
  const known = rescheduleMessageForCode(maLoi, error.chiTiet);
  if (known === undefined) {
    return failure('retry', errorMessageFor(error), maLoi);
  }
  if (isSlotGoneCode(maLoi)) {
    // Lúc GỬI: về lưới. Lúc TẢI màn xác nhận (URL cũ mở lại): chỉ hiện câu kèm liên kết, không tự chuyển trang
    return failure(
      phase === 'submit' ? 'slotGone' : 'pickAnother',
      known.message,
      maLoi,
    );
  }
  const slotScope = knownBookingErrorByCode(maLoi)?.scope === 'slot';
  if (slotScope || PICK_ANOTHER_CODES.has(maLoi)) {
    return failure('pickAnother', known.message, maLoi);
  }
  return failure(
    known.retryable ? 'retry' : 'backToDetail',
    known.message,
    maLoi,
  );
}

export function describeRescheduleFailure(
  error: unknown,
  phase: FailurePhase,
): RescheduleFailure {
  if (error instanceof ApiError) return describeApiFailure(error, phase);
  const unsure =
    phase === 'submit' &&
    (error instanceof NetworkError ||
      error instanceof TimeoutError ||
      error instanceof UnexpectedResponseError);
  if (unsure) return failure('uncertain', RESCHEDULE_TEXT.uncertain);
  return failure('retry', errorMessageFor(error));
}

// Sau một lần gửi "chưa rõ", lần gửi lại mà ra 404 (lịch cũ đã được đổi) hay 409 `DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET` (yêu cầu đã được gửi) thì lần trước thật ra đã thành công: thêm gợi ý (WDH-46, WDH-47)
export function withUncertainHint(
  current: RescheduleFailure,
): RescheduleFailure {
  const lastTimeSucceeded =
    current.kind === 'notFound' ||
    current.maLoi === RESCHEDULE_ERROR_CODES.REQUEST_PENDING;
  return lastTimeSucceeded
    ? {
        ...current,
        message: `${current.message} ${RESCHEDULE_TEXT.afterUncertainHint}`,
      }
    : current;
}

// Câu cho `lichMoi.lyDoKhongHopLe` của preview (khung giờ đã chọn không dùng được): theo mã; vắng hay mã lạ ⇒ câu riêng của khung giờ
export function candidateReasonMessage(maLoi: string | undefined): string {
  return (
    (maLoi === undefined ? undefined : rescheduleMessageForCode(maLoi))
      ?.message ?? RESCHEDULE_TEXT.slotNotUsable
  );
}
