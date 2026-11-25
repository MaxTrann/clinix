import { GENERIC_ERROR_MESSAGE } from '../../../../../shared/api/error-message';
import {
  BOOKING_ERROR_CODES,
  knownBookingErrorByCode,
} from '../../../api/booking-errors';
import { CODE_INVALID_INPUT } from '../error-kinds';
import {
  again,
  describeFailure,
  stops,
  type FailureRule,
  type StatusFailure,
} from '../status-failure';
import { COMMON_LIST_TEXT } from '../list-text';
import { HANDLE_TEXT } from './request-handle-text';
import { notApprovableMessage } from './request-states';

// Câu lỗi của hai route GHI (duyệt, từ chối) yêu cầu đổi lịch (reschedule F4 Pha B1; PLAN reschedule 5.13; bảng mã lỗi ghi ở kế hoạch `1.16` mục 2.5; 409 từ chối có kiểu của B9 thì yêu cầu VẪN `ChoDuyet`). Dùng lại
// `describeFailure` của `common/status-failure.ts` (bảng chung: 401, 403, 503, chưa cấu hình, mạng, quá giờ, 200 sai hình dạng) và THÊM mã riêng qua `extraRules` (đứng TRƯỚC bảng chung, nên ghi đè được câu
// "không tìm thấy lịch hẹn"). Chọn theo `maLoi` (và `loi[].truong`), KHÔNG theo mã HTTP hay `thongBao`; không bao giờ in mã thô. Hàm thuần.
//   final     chỉ còn đóng hộp (cùng yêu cầu cùng kết quả); `refresh: 'detail'` ⇒ tải lại chi tiết để nút và câu khớp máy chủ
//   retry     giữ hộp, bấm lại được (đổi ghi chú hay chọn khung giờ khác)
//   uncertain mạng, quá giờ, 200 sai hình dạng: máy chủ CÓ THỂ đã ghi ⇒ giữ hộp kèm "Tải lại chi tiết", KHÔNG tự gửi lại
const CODES = {
  handled: 'YEU_CAU_DA_XU_LY',
  missing: 'YEU_CAU_DOI_LICH_KHONG_TON_TAI',
  notReschedulable: 'LICH_HEN_KHONG_CHO_DOI',
  tooLate: 'LICH_HEN_DA_QUA_GIO',
  chainTooLong: 'CHUOI_DOI_LICH_QUA_DAI',
  serviceChanged: 'LICH_HEN_KHAC_DICH_VU_HIEN_TAI',
  branchChanged: 'LICH_HEN_KHAC_CHI_NHANH_HIEN_TAI',
  sameSlot: 'KHUNG_GIO_TRUNG_LICH_CU',
  otherDoctor: 'KHUNG_GIO_KHAC_BAC_SI',
  systemError: 'LOI_HE_THONG',
  // B9: 401 có BA mã; `CHUA_DANG_NHAP` đã có ở bảng chung, hai mã sau (token hỏng; Lễ tân bị khoá hay thu hồi phiên) cùng nghĩa "phiên hết hiệu lực"
  badToken: 'TOKEN_KHONG_HOP_LE',
  sessionRevoked: 'PHIEN_HET_HIEU_LUC',
} as const;

// Lỗi 400 ở TRƯỜNG `ghiChu` (rỗng, quá dài, ký tự điều khiển, chữ bị bộ che bí mật chặn: máy chủ dùng một mã trường cho mọi nguyên nhân) ⇒ lỗi CẠNH Ô, giữ chữ. Trường khác ⇒ câu chung.
const NOTE_FIELD = 'ghiChu';

// Mã của booking mà hộp Duyệt KHÔNG dùng câu của nó (đã có câu riêng ở bảng chung hay ở đây)
const SKIPPED_BOOKING_CODES: ReadonlySet<string> = new Set([
  BOOKING_ERROR_CODES.LOCKED_NO_SHOW,
  BOOKING_ERROR_CODES.FORBIDDEN,
  BOOKING_ERROR_CODES.NOT_CONFIGURED,
  BOOKING_ERROR_CODES.NOT_FOUND,
  BOOKING_ERROR_CODES.UNAUTHENTICATED,
  BOOKING_ERROR_CODES.SYSTEM_BUSY,
]);

const GONE_SLOT_CODES = [
  BOOKING_ERROR_CODES.SLOT_TAKEN,
  BOOKING_ERROR_CODES.SLOT_HELD,
  BOOKING_ERROR_CODES.SLOT_PAST,
];

// Lịch gốc không còn duyệt được: chỉ còn đóng, chi tiết tải lại ra `coTheDuyet = false` (Từ chối vẫn dùng được, R6)
const NOT_APPROVABLE_CODES = [
  CODES.notReschedulable,
  CODES.tooLate,
  BOOKING_ERROR_CODES.RELATIVE_DEACTIVATED,
  CODES.chainTooLong,
];

function buildRules(canPickAnother: boolean): ReadonlyMap<string, FailureRule> {
  const rules = new Map<string, FailureRule>();

  // Mã đã có của booking (khung giờ, nghỉ phép, giờ hoạt động, trùng giờ…): ĐÚNG câu của `booking-errors.ts`, không bảng câu thứ hai; bấm lại được (chọn khung giờ khác, hay từ chối)
  for (const code of Object.values(BOOKING_ERROR_CODES)) {
    if (SKIPPED_BOOKING_CODES.has(code)) continue;
    if (knownBookingErrorByCode(code) === undefined) continue;
    rules.set(code, (error) =>
      again(
        knownBookingErrorByCode(error.maLoi, error.chiTiet)?.message ??
          GENERIC_ERROR_MESSAGE,
      ),
    );
  }

  // Khung giờ vừa bị đặt, giữ chỗ hay qua giờ: GIỮ hộp, tải lại chi tiết cho trạng thái khung giờ khớp. Chưa có nút "Chọn khung giờ khác" thì không hứa việc không làm được.
  const goneMessage = canPickAnother
    ? HANDLE_TEXT.slotGonePick
    : HANDLE_TEXT.slotGone;
  for (const code of GONE_SLOT_CODES) {
    rules.set(code, (): StatusFailure => ({
      message: goneMessage,
      kind: 'retry',
      refresh: 'detail',
    }));
  }
  rules.set(CODES.sameSlot, () => again(HANDLE_TEXT.sameSlot));
  rules.set(CODES.otherDoctor, () => again(HANDLE_TEXT.otherDoctor));

  for (const code of NOT_APPROVABLE_CODES) {
    rules.set(code, () => stops(notApprovableMessage(code), 'detail'));
  }
  rules.set(CODES.serviceChanged, () =>
    stops(HANDLE_TEXT.serviceChanged, 'detail'),
  );
  rules.set(CODES.branchChanged, () =>
    stops(HANDLE_TEXT.branchChanged, 'detail'),
  );

  // Hai mã 404 khác nhau giữa GET (B8: `KHONG_TIM_THAY`) và POST (B9: `YEU_CAU_DOI_LICH_KHONG_TON_TAI`) cùng MỘT câu; đứng trước bảng chung nên thắng câu "lịch hẹn"
  rules.set(CODES.handled, () => stops(HANDLE_TEXT.alreadyHandled, 'detail'));
  rules.set(CODES.missing, () => stops(HANDLE_TEXT.notFound, 'detail'));
  rules.set(BOOKING_ERROR_CODES.NOT_FOUND, () =>
    stops(HANDLE_TEXT.notFound, 'detail'),
  );

  rules.set(CODES.systemError, () => again(HANDLE_TEXT.systemError));
  for (const code of [CODES.badToken, CODES.sessionRevoked]) {
    rules.set(code, () => stops(COMMON_LIST_TEXT.sessionExpired, 'none'));
  }
  rules.set(CODE_INVALID_INPUT, (error) =>
    error.loi?.some((item) => item.truong === NOTE_FIELD)
      ? again(HANDLE_TEXT.noteInvalid, 'reason')
      : again(GENERIC_ERROR_MESSAGE),
  );
  return rules;
}

// Hai bảng dựng MỘT lần (chỉ khác câu "khung giờ không còn trống")
const RULES_WITH_PICK = buildRules(true);
const RULES_WITHOUT_PICK = buildRules(false);

// `canPickAnother`: hộp Duyệt có nút "Chọn khung giờ khác" (B2) hay chưa; quyết định câu của ba mã khung giờ
export function describeHandleFailure(
  error: unknown,
  options: { canPickAnother?: boolean } = {},
): StatusFailure {
  return describeFailure(
    error,
    HANDLE_TEXT.unsure,
    options.canPickAnother === true ? RULES_WITH_PICK : RULES_WITHOUT_PICK,
  );
}
