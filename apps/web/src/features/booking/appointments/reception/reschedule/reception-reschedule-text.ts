import { RESCHEDULE_ERROR_CODES } from '../../common/reschedule-errors';
import type { FailureContext } from '../../common/reschedule-failure';
import { STAFF_REASON_LIMITS } from '../../common/reschedule-reason-rules';
import { RESCHEDULE_TEXT } from '../../common/reschedule-text';

// Chữ RIÊNG của Lễ tân đổi lịch hộ (reschedule F3). Toàn bộ là [đề xuất], chờ nhóm duyệt ở PR (Q13; Figma chưa có frame cho đổi lịch hộ: PLAN reschedule 4.4). Chữ dùng chung với Bệnh nhân (hai thẻ giờ, "Chọn
// khung giờ khác", "Thử lại"…) ở `common/reschedule-text.ts`; câu theo `maLoi` ở `common/reschedule-errors.ts` (PLAN 5.13), không lặp ở đây.
export const RECEPTION_RESCHEDULE_TEXT = {
  // Nút ở chi tiết lịch (WDO-01)
  changeButton: 'Đổi lịch hộ',
  // Trang chọn khung giờ và màn xác nhận (WDO-02, WDO-03)
  title: 'Đổi lịch hộ bệnh nhân',
  confirmTitle: 'Xác nhận đổi lịch hộ',
  confirmButton: 'Xác nhận đổi lịch',
  intro:
    'Lịch hiện tại sẽ chuyển sang "Đã đổi lịch" và bệnh nhân nhận thông báo về lịch mới.',
  // `coYeuCauChoDuyet = true`: KHÔNG chặn đổi hộ (KDL-19); yêu cầu cũ thành tồn, chỉ từ chối được (Q7 g)
  pendingRequest:
    'Lịch hẹn này đang có yêu cầu đổi lịch chờ duyệt. Nếu đổi hộ, yêu cầu đó không thể duyệt nữa (chỉ từ chối được).',
  // Ô lý do BẮT BUỘC (Q9): hai dòng nhắc nằm cùng chỗ gợi ý của ô
  reasonLabel: RESCHEDULE_TEXT.reasonLabel,
  reasonHint:
    'Bệnh nhân sẽ đọc lý do này. Không nhập thông tin cá nhân hay mật khẩu.',
  // 400 `LY_DO_BAT_BUOC` là MỘT mã cho thiếu, rỗng, quá dài và chữ giống bí mật (bị bộ che bí mật của máy chủ che)
  reasonInvalid:
    'Lý do phải từ 1 đến 255 ký tự và không giống mật khẩu hay mã bí mật.',
  // Kết quả (WDO-04, WDO-05)
  doneNotice: 'Đã đổi lịch hộ bệnh nhân. Đây là lịch hẹn mới.',
  systemError: 'Không thực hiện được, vui lòng thử lại.',
  // POST không biết kết quả khi mất mạng hay quá giờ: máy chủ có thể đã ghi. Gửi lại vẫn an toàn: lần hai ra 409 `LICH_HEN_KHONG_CHO_DOI` (lịch cũ đã `DaDoiLich`), không bao giờ đổi hai lần.
  uncertain:
    'Mất kết nối khi đang gửi, chưa rõ lịch hẹn đã được đổi hay chưa. Hãy xem chi tiết lịch hẹn trước khi gửi lại.',
  afterUncertainHint:
    'Có thể lịch hẹn đã được đổi ở lần trước. Hãy xem chi tiết lịch hẹn.',
  seeDetail: 'Xem chi tiết lịch hẹn',
} as const;

// Ô lý do của Lễ tân: 1 đến 255 đơn vị UTF-16 (`unit: 'utf16'`, đúng máy chủ B7). Hằng cấp module: không dựng lại mỗi lần vẽ.
export const RECEPTION_REASON = {
  label: RECEPTION_RESCHEDULE_TEXT.reasonLabel,
  hint: RECEPTION_RESCHEDULE_TEXT.reasonHint,
  ...STAFF_REASON_LIMITS,
  unit: 'utf16' as const,
};

// Ngữ cảnh của `describeRescheduleFailure` cho Lễ tân (WDO-05, WDO-11): trường lỗi là `lyDo`; KHÔNG có hạn mức tự đổi nên `VUOT_SO_LAN_TU_DOI` không mở ô lý do; lần gửi lại sau "chưa rõ" mà ra 409
// `LICH_HEN_KHONG_CHO_DOI` nghĩa là lần trước đã đổi (Lễ tân vẫn thấy lịch `DaDoiLich`); 500 `LOI_HE_THONG` (AuditError, DB nguyên vẹn) có câu riêng và cho gửi lại.
export const RECEPTION_FAILURE_CONTEXT: FailureContext = {
  reasonField: 'lyDo',
  reasonInvalidMessage: RECEPTION_RESCHEDULE_TEXT.reasonInvalid,
  askReasonOnOverLimit: false,
  uncertainMessage: RECEPTION_RESCHEDULE_TEXT.uncertain,
  afterUncertainHint: RECEPTION_RESCHEDULE_TEXT.afterUncertainHint,
  succeededAfterUncertain: [RESCHEDULE_ERROR_CODES.NOT_RESCHEDULABLE],
  systemErrorMessage: RECEPTION_RESCHEDULE_TEXT.systemError,
};
