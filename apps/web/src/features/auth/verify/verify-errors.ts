import { errorMessageFor } from '../../../shared/api/error-message';
import { ApiError, RequestAbortedError } from '../../../shared/api/errors';
import { describeDelivery } from '../register/register-errors';

const WRONG_CODE_MESSAGE = 'Mã OTP không đúng. Vui lòng kiểm tra lại.';
const EXPIRED_MESSAGE = 'Mã OTP đã hết hạn. Vui lòng bấm "Gửi lại mã".';
const OUT_OF_TRIES_MESSAGE =
  'Bạn đã nhập sai quá 5 lần. Mã đã bị vô hiệu, vui lòng bấm "Gửi lại mã".';
const REPLACED_MESSAGE =
  'Yêu cầu xác minh này đã được thay bằng lần đăng ký mới hơn. Vui lòng đăng ký lại.';
const REREGISTER_MESSAGE =
  'Yêu cầu xác minh không còn hiệu lực. Vui lòng đăng ký lại bằng email này.';
const SUSPENDED_MESSAGE =
  'Tài khoản đã bị ngưng hoạt động. Vui lòng liên hệ quản trị viên.';
const INVALID_OTP_MESSAGE = 'Mã OTP gồm đúng 6 chữ số.';
const INVALID_DATA_MESSAGE = 'Dữ liệu không hợp lệ.';
const SYSTEM_MESSAGE = 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.';

export type VerifyFailure =
  // Mã sai: nhập lại
  | { kind: 'wrongCode'; message: string }
  // Mã không dùng được nữa: chỉ còn Gửi lại mã
  | { kind: 'deadCode'; message: string }
  | { kind: 'reregister'; message: string }
  | { kind: 'suspended'; message: string }
  | { kind: 'tooSoon'; seconds: number }
  | { kind: 'mailFailed'; maXacThucId: string; coTheGuiLaiLuc: string }
  | { kind: 'message'; message: string }
  | { kind: 'ignored' };

function describeShared(error: ApiError): VerifyFailure | null {
  switch (error.maLoi) {
    case 'OTP_BI_THAY_THE':
      return { kind: 'reregister', message: REPLACED_MESSAGE };
    case 'CAN_DANG_KY_LAI':
      return { kind: 'reregister', message: REREGISTER_MESSAGE };
    case 'TAI_KHOAN_NGUNG':
      return { kind: 'suspended', message: SUSPENDED_MESSAGE };
    case 'LOI_HE_THONG':
      return { kind: 'message', message: SYSTEM_MESSAGE };
    case 'DU_LIEU_KHONG_HOP_LE': {
      const isOtp = error.loi?.some(({ ma }) => ma === 'OTP_KHONG_HOP_LE');
      return {
        kind: 'message',
        message: isOtp ? INVALID_OTP_MESSAGE : INVALID_DATA_MESSAGE,
      };
    }
  }
  return null;
}

function describeUnknown(error: unknown): VerifyFailure {
  if (error instanceof RequestAbortedError) return { kind: 'ignored' };
  return { kind: 'message', message: errorMessageFor(error) };
}

export function describeVerifyError(error: unknown): VerifyFailure {
  if (!(error instanceof ApiError)) return describeUnknown(error);
  switch (error.maLoi) {
    case 'OTP_SAI':
      return { kind: 'wrongCode', message: WRONG_CODE_MESSAGE };
    case 'OTP_HET_HAN':
      return { kind: 'deadCode', message: EXPIRED_MESSAGE };
    case 'OTP_HET_LUOT':
      return { kind: 'deadCode', message: OUT_OF_TRIES_MESSAGE };
  }
  return describeShared(error) ?? describeUnknown(error);
}

export function describeResendError(error: unknown): VerifyFailure {
  if (!(error instanceof ApiError)) return describeUnknown(error);
  switch (error.maLoi) {
    // Ở `resend-otp`, OTP_SAI nghĩa là id hoặc email không hợp lệ: coi như phải đăng ký lại (TRACKING auth mục 5 điểm 13)
    case 'OTP_SAI':
      return { kind: 'reregister', message: REREGISTER_MESSAGE };
    case 'GUI_LAI_QUA_SOM':
    case 'GUI_MAIL_LOI':
      return describeDelivery(error);
  }
  return describeShared(error) ?? describeUnknown(error);
}
