import { errorMessageFor } from '../../../../shared/api/error-message';
import {
  ApiError,
  NetworkError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../../shared/api/errors';
import {
  BOOKING_ERROR_CODES,
  knownBookingErrorByCode,
} from '../../api/booking-errors';
import { COMMON_ACTION_TEXT } from './action-text';
import { CODE_INVALID_INPUT } from './error-kinds';
import { COMMON_LIST_TEXT } from './list-text';
import {
  CODE_SYSTEM_ERROR,
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

// NGỮ CẢNH của nơi dùng (reschedule F3): Bệnh nhân và Lễ tân đổi hộ dùng cùng bảng mã nhưng khác tên trường lý do, có hay không hạn mức tự đổi, câu "chưa rõ" và mã nghĩa là "lần gửi trước đã thành công".
// Mặc định là Bệnh nhân (`PATIENT_FAILURE_CONTEXT`) nên nơi gọi cũ của F2 không đổi.
export interface FailureContext {
  // `loi[].truong` của 400 khi ô lý do sai (Bệnh nhân `lyDoYeuCau`, Lễ tân `lyDo`)
  reasonField: string;
  // Câu cạnh ô lý do khi máy chủ từ chối chữ
  reasonInvalidMessage: string;
  // `VUOT_SO_LAN_TU_DOI` lúc gửi ⇒ mở ô lý do tại chỗ (chỉ đường Bệnh nhân có hạn mức)
  askReasonOnOverLimit: boolean;
  // Câu cho "chưa rõ" (mạng, quá giờ, phản hồi lạ lúc gửi) và gợi ý thêm khi lần gửi lại cho thấy lần trước đã thành công
  uncertainMessage: string;
  afterUncertainHint: string;
  // `maLoi` (ngoài 404) mà sau một lần "chưa rõ" nghĩa là lần trước đã thành công
  succeededAfterUncertain: readonly string[];
  // Câu riêng cho `LOI_HE_THONG` (500); vắng thì dùng câu chung
  systemErrorMessage?: string;
}

export const PATIENT_FAILURE_CONTEXT: FailureContext = {
  reasonField: 'lyDoYeuCau',
  reasonInvalidMessage: RESCHEDULE_TEXT.reasonRange(
    REQUEST_REASON_LIMITS.min,
    REQUEST_REASON_LIMITS.max,
  ),
  askReasonOnOverLimit: true,
  uncertainMessage: RESCHEDULE_TEXT.uncertain,
  afterUncertainHint: RESCHEDULE_TEXT.afterUncertainHint,
  succeededAfterUncertain: [RESCHEDULE_ERROR_CODES.REQUEST_PENDING],
};

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

function describeApiFailure(
  error: ApiError,
  phase: FailurePhase,
  context: FailureContext,
): RescheduleFailure {
  const { maLoi } = error;
  if (maLoi === BOOKING_ERROR_CODES.UNAUTHENTICATED) {
    return failure('session', COMMON_LIST_TEXT.sessionExpired, maLoi);
  }
  if (
    maLoi === BOOKING_ERROR_CODES.NOT_FOUND ||
    maLoi === BOOKING_ERROR_CODES.FORBIDDEN
  ) {
    return failure('notFound', COMMON_ACTION_TEXT.notFound, maLoi);
  }
  if (
    phase === 'submit' &&
    context.askReasonOnOverLimit &&
    maLoi === RESCHEDULE_ERROR_CODES.OVER_SELF_LIMIT
  ) {
    const known = rescheduleMessageForCode(maLoi);
    return failure('needsReason', known?.message ?? '', maLoi);
  }
  if (maLoi === CODE_INVALID_INPUT) {
    return phase === 'submit' &&
      error.loi?.some((item) => item.truong === context.reasonField)
      ? failure('reasonInvalid', context.reasonInvalidMessage, maLoi)
      : failure('retry', errorMessageFor(error), maLoi);
  }
  if (maLoi === CODE_SYSTEM_ERROR && context.systemErrorMessage !== undefined) {
    return failure('retry', context.systemErrorMessage, maLoi);
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
  context: FailureContext = PATIENT_FAILURE_CONTEXT,
): RescheduleFailure {
  if (error instanceof ApiError) {
    return describeApiFailure(error, phase, context);
  }
  const unsure =
    phase === 'submit' &&
    (error instanceof NetworkError ||
      error instanceof TimeoutError ||
      error instanceof UnexpectedResponseError);
  if (unsure) return failure('uncertain', context.uncertainMessage);
  return failure('retry', errorMessageFor(error));
}

// Sau một lần gửi "chưa rõ", lần gửi lại mà ra 404 (lịch cũ đã được đổi) hay mã `succeededAfterUncertain` của nơi dùng (Bệnh nhân: 409 `DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET`, yêu cầu đã được gửi; Lễ tân: 409
// `LICH_HEN_KHONG_CHO_DOI`, lịch cũ đã thành `DaDoiLich` mà Lễ tân vẫn thấy) thì lần trước thật ra đã thành công: thêm gợi ý (WDH-46, WDH-47, WDO-11)
export function withUncertainHint(
  current: RescheduleFailure,
  context: FailureContext = PATIENT_FAILURE_CONTEXT,
): RescheduleFailure {
  const lastTimeSucceeded =
    current.kind === 'notFound' ||
    (current.maLoi !== null &&
      context.succeededAfterUncertain.includes(current.maLoi));
  return lastTimeSucceeded
    ? {
        ...current,
        message: `${current.message} ${context.afterUncertainHint}`,
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
