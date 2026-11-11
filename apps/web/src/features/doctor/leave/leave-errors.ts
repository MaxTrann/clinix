import {
  ApiError,
  NetworkError,
  TimeoutError,
} from '../../../shared/api/errors';
import { errorMessageFor } from '../../../shared/api/error-message';
import {
  FIELD_MESSAGES,
  REASON_MAX,
  REASON_MIN,
  type LeaveField,
  type LeaveFieldErrors,
} from './leave-form';

// Mã lỗi → câu chữ (PLAN doctor 5.14; câu `[đề xuất]`, chờ nhóm duyệt). Chọn theo `maLoi` và `loi[].ma`, KHÔNG dùng `thongBao` của API.
// Hai con số dưới đây là hằng của server (B11: MAX_LEAVE_DAYS, MAX_LEAVE_DAYS_AHEAD; Q19, Q25): đổi ở server thì đổi ở đây.
const MAX_LEAVE_DAYS = 31;
const MAX_LEAVE_DAYS_AHEAD = 90;

const BUSINESS_MESSAGES: Record<string, string> = {
  NGAY_NGHI_DA_QUA: 'Không thể xin nghỉ cho ngày đã qua.',
  NGHI_NGOAI_LICH_LAM_VIEC:
    'Ngày/ca xin nghỉ không có trong lịch làm việc đã phân công của bạn.',
  YEU_CAU_NGHI_TRUNG: 'Bạn đã có yêu cầu nghỉ trùng thời gian này.',
  QUA_NHIEU_YEU_CAU_CHO_DUYET: 'Bạn đang có quá nhiều yêu cầu chờ duyệt.',
  KHOANG_NGHI_QUA_DAI: `Khoảng nghỉ tối đa ${MAX_LEAVE_DAYS} ngày.`,
  NGHI_QUA_XA: `Chỉ xin nghỉ trong ${MAX_LEAVE_DAYS_AHEAD} ngày tới.`,
  CA_DA_KET_THUC: 'Ca này đã kết thúc trong hôm nay.',
};

// Lỗi của MỘT trường trong `loi[]` (400 `DU_LIEU_KHONG_HOP_LE`): hiện dưới đúng ô (WN-03).
const FIELD_CODE_MESSAGES: Record<string, string> = {
  CA_BAT_BUOC: FIELD_MESSAGES.shiftRequired,
  CA_KHONG_HOP_LE: 'Ca không hợp lệ.',
  CA_KHONG_DUOC_CHON: 'Nghỉ cả ngày không chọn ca.',
  NGHI_THEO_CA_CHI_MOT_NGAY: 'Nghỉ theo ca chỉ chọn một ngày.',
  LY_DO_BAT_BUOC: `Vui lòng nhập lý do (${REASON_MIN}–${REASON_MAX} ký tự).`,
  LY_DO_KHONG_HOP_LE: `Vui lòng nhập lý do (${REASON_MIN}–${REASON_MAX} ký tự).`,
  NGAY_KHONG_HOP_LE: FIELD_MESSAGES.dateRequired,
  KHOANG_NGAY_KHONG_HOP_LE: FIELD_MESSAGES.dateOrder,
  HINH_THUC_KHONG_HOP_LE: 'Loại nghỉ không hợp lệ.',
};

const KNOWN_FIELDS: readonly LeaveField[] = [
  'hinhThuc',
  'tuNgay',
  'denNgay',
  'ca',
  'lyDo',
];

export const SEND_UNCERTAIN_MESSAGE =
  'Chưa rõ yêu cầu đã được gửi chưa (mất kết nối hoặc quá thời gian chờ). Nội dung của bạn vẫn được giữ; hãy kiểm tra "Lịch sử yêu cầu nghỉ" rồi gửi lại nếu chưa có.';

export interface LeaveSubmitFailure {
  // Lỗi theo trường, hiện dưới ô tương ứng
  fields: LeaveFieldErrors;
  // Lỗi chung của cả form (nghiệp vụ 409, mạng, 500…); `null` nếu chỉ có lỗi theo trường
  message: string | null;
}

/** Biến lỗi khi gửi yêu cầu nghỉ thành câu hiển thị. Không bao giờ in `thongBao` của server hay chi tiết kỹ thuật. */
export function describeLeaveSubmitError(error: unknown): LeaveSubmitFailure {
  if (error instanceof ApiError) {
    const fields: LeaveFieldErrors = {};
    let unmatched = false;
    for (const { truong, ma } of error.loi ?? []) {
      const message = FIELD_CODE_MESSAGES[ma];
      if (message && (KNOWN_FIELDS as readonly string[]).includes(truong))
        fields[truong as LeaveField] ??= message;
      else unmatched = true;
    }
    if (Object.keys(fields).length > 0 && !unmatched)
      return { fields, message: null };
    const business = BUSINESS_MESSAGES[error.maLoi];
    if (business) return { fields, message: business };
    return { fields, message: errorMessageFor(error) };
  }
  // Không có phản hồi: không biết máy chủ đã nhận chưa, nên không tự gửi lại và nhắc xem lịch sử (WN-10)
  if (error instanceof NetworkError || error instanceof TimeoutError)
    return { fields: {}, message: SEND_UNCERTAIN_MESSAGE };
  return { fields: {}, message: errorMessageFor(error) };
}
