import {
  errorMessageFor,
  GENERIC_ERROR_MESSAGE,
} from '../../../../../shared/api/error-message';
import {
  ApiError,
  NetworkError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../../../shared/api/errors';
import { BOOKING_ERROR_CODES } from '../../../api/booking-errors';
import {
  BUSY_MESSAGE,
  cannotCancelMessage,
  notCancellableMessage,
} from '../../common/failure-text';
import { REFUND_TEXT } from '../../common/refund-text';
import { LIST_TEXT } from '../list-messages';

// Chữ của trang chi tiết lịch hẹn và hộp huỷ (booking F2). Chữ của Figma `420:2`, `426:2`, `691:2`, `421:2` khi có (đã bỏ các chuỗi mô phỏng, PLAN 4.4); còn lại
// là [đề xuất], Đại duyệt 12/11/2026 (TRACKING 3.27 F2-J: ba câu lấy từ PLAN 5.14 và F1, các câu còn lại chờ nhóm duyệt cùng Figma).
export const DETAIL_TEXT = {
  title: 'Chi tiết lịch hẹn',
  backToList: 'Lịch hẹn của tôi',
  summary: 'Tóm tắt lịch hẹn',
  loading: 'Đang tải lịch hẹn...',
  notFound: 'Không tìm thấy lịch hẹn này.',
  forbidden: 'Bạn không có quyền xem lịch hẹn này.',
  doctor: 'Bác sĩ',
  visitDate: 'Ngày khám',
  branch: 'Chi nhánh',
  person: 'Người khám',
  infoTitle: 'Thông tin lịch hẹn',
  service: 'Dịch vụ',
  reason: 'Lý do khám',
  noReason: 'Không ghi lý do',
  recordTitle: 'Hồ sơ khám bệnh',
  recordNote:
    'Hồ sơ khám bệnh sẽ xuất hiện khi bác sĩ hoàn tất và ghi chú buổi khám.',
  costTitle: 'Chi phí & Thanh toán',
  price: 'Giá khám',
  deposit: 'Cọc yêu cầu',
  // Figma ghi "Chưa ghi nhận qua ví CLINIX"; đổi vì phương thức thanh toán còn VNPay, MoMo (B2: `PaymentMethod`)
  noPayment: 'Chưa ghi nhận thanh toán',
  paid: 'Đã thu',
  remaining: 'Còn phải thu',
  refund: 'Hoàn tiền',
  refundDone: 'Đã hoàn',
  refundFailed: 'Hoàn tiền chưa thành công',
  counter: 'Thu tại quầy',
  noCollect: 'Không thu',
  costNote: 'Giá khám chỉ mang tính tham khảo. Thanh toán trực tiếp tại quầy.',
  waitingDeposit: 'Chờ xác nhận thanh toán cọc',
  payBefore: 'Hạn thanh toán',
  payButton: 'Thanh toán',
  payNotReady: 'Chưa được triển khai',
  timelineTitle: 'Trạng thái lịch hẹn',
  upcoming: 'Chưa đến',
  passed: 'Đã qua',
  current: 'Hiện tại',
  cancelButton: 'Hủy lịch hẹn',
} as const;

export const CANCEL_TEXT = {
  title: 'Xác nhận hủy lịch hẹn?',
  warning: 'Sau khi hủy, khung giờ được trả lại và không thể hoàn tác.',
  paidDeposit: 'Cọc đã thanh toán',
  noDeposit: 'Chưa có cọc',
  expectedRefund: 'Hoàn dự kiến',
  noRefund: 'Không hoàn',
  // Thay chú thích mô phỏng của Figma ("Tỷ lệ hoàn là chính sách đề xuất trong bản demo."): Q18 yêu cầu ghi "dự kiến" ở hộp xác nhận
  estimateNote: 'Số tiền hoàn là dự kiến, được tính lại khi bạn xác nhận hủy.',
  keep: 'Giữ lịch',
  confirm: 'Xác nhận hủy',
  confirming: 'Đang hủy…',
  loadingPreview: 'Đang tải số tiền hoàn dự kiến...',
  retry: 'Thử lại',
  reload: 'Tải lại chi tiết',
  close: 'Đóng',
  cancelled: 'Đã hủy lịch hẹn.',
  // Chuyển lên `common/refund-text.ts` ở F9 (hộp huỷ của Lễ tân dùng chung); giữ khoá cũ để mọi chỗ đọc `CANCEL_TEXT.x` vẫn chạy
  refundPaid: REFUND_TEXT.paid,
  noRefundPaid: REFUND_TEXT.none,
  differs: 'Số tiền hoàn thực tế khác số dự kiến vì đã qua mốc thời gian hoàn.',
} as const;

// Dòng mốc dưới "Hoàn dự kiến": chỉ khi `mocApDung` khác `null` (Đại duyệt 12/11/2026)
export const cutoffLabel = (hours: number) =>
  `Áp dụng khi hủy trước giờ khám từ ${hours} giờ`;

const FORBIDDEN_CANCEL = 'Bạn không có quyền hủy lịch hẹn này.';
// POST huỷ không biết kết quả khi mất mạng hay quá giờ: máy chủ có thể đã huỷ xong (nếp patient F6)
const UNSURE =
  'Mất kết nối khi đang hủy, chưa rõ lịch hẹn đã được hủy hay chưa.';

// `cannotCancelMessage`, `notCancellableMessage` và câu bận chuyển lên `common/failure-text.ts` ở F9 (Lễ tân dùng chung)
export { cannotCancelMessage };

// ---- Lỗi của hộp huỷ ----
// `final`: không thử lại được (cùng yêu cầu cùng kết quả): chỉ còn đóng. `retry`: bấm lại được (503 hoàn tác trọn; xem trước chỉ đọc). `uncertain`: gửi huỷ mà
// không biết máy chủ đã xử lý chưa: giữ nút xác nhận (bấm lại an toàn, lần hai ra 409 `DaHuy`) và thêm `Tải lại chi tiết`.
// `reloadDetail`: chi tiết đang hiện đã lệch máy chủ (409, hay xem trước nói không huỷ được) nên tải lại.
export interface CancelFailure {
  message: string;
  kind: 'final' | 'retry' | 'uncertain';
  reloadDetail: boolean;
}

function describeApiFailure(error: ApiError): CancelFailure {
  switch (error.maLoi) {
    case BOOKING_ERROR_CODES.UNAUTHENTICATED:
      return {
        message: LIST_TEXT.sessionExpired,
        kind: 'final',
        reloadDetail: false,
      };
    case BOOKING_ERROR_CODES.FORBIDDEN:
      return { message: FORBIDDEN_CANCEL, kind: 'final', reloadDetail: false };
    case BOOKING_ERROR_CODES.NOT_FOUND:
      return {
        message: DETAIL_TEXT.notFound,
        kind: 'final',
        reloadDetail: false,
      };
    case BOOKING_ERROR_CODES.NOT_CANCELLABLE:
      return {
        message: notCancellableMessage(error.chiTiet),
        kind: 'final',
        reloadDetail: true,
      };
    case BOOKING_ERROR_CODES.SYSTEM_BUSY:
      return { message: BUSY_MESSAGE, kind: 'retry', reloadDetail: false };
    default:
      return {
        message: GENERIC_ERROR_MESSAGE,
        kind: 'retry',
        reloadDetail: false,
      };
  }
}

// `phase`: 'preview' (chỉ đọc, thử lại luôn an toàn) hay 'submit' (POST huỷ: mạng, quá giờ, phản hồi lạ là "chưa rõ")
export function describeCancelError(
  error: unknown,
  phase: 'preview' | 'submit',
): CancelFailure {
  if (error instanceof ApiError) return describeApiFailure(error);
  const unsure =
    phase === 'submit' &&
    (error instanceof NetworkError ||
      error instanceof TimeoutError ||
      error instanceof UnexpectedResponseError);
  if (unsure)
    return { message: UNSURE, kind: 'uncertain', reloadDetail: false };
  return {
    message: errorMessageFor(error),
    kind: 'retry',
    reloadDetail: false,
  };
}
