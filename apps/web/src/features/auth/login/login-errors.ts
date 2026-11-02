import { errorMessageFor } from '../../../shared/api/error-message';
import { ApiError, RequestAbortedError } from '../../../shared/api/errors';

// Đổi lỗi của POST /auth/login thành việc giao diện phải hiện. Câu chữ theo PLAN auth mục 5.5, chọn theo `maLoi` và `loi[].ma`;
// KHÔNG dùng `thongBao` của API và không có nhánh "Còn N lần" (G1).
const PASSWORD_MAX_LENGTH = 64;

const INVALID_DATA_MESSAGE = 'Dữ liệu không hợp lệ.';
const INVALID_PASSWORD_MESSAGE =
  'Mật khẩu từ 8 đến 64 ký tự, gồm ít nhất một chữ số và một ký tự đặc biệt (ví dụ ! @ # $ % .).';
const UNVERIFIED_MESSAGE =
  'Email của bạn chưa được xác minh. Nhập mã OTP đã nhận hoặc bấm "Gửi lại mã".';
const REREGISTER_MESSAGE =
  'Yêu cầu xác minh email không còn hiệu lực. Vui lòng đăng ký lại bằng email này.';

interface MessageRule {
  message: string;
  // D3: chỉ xoá ô mật khẩu ở các lỗi có frame; lỗi tạm thời giữ lại để khỏi gõ lại
  clearPassword: boolean;
}

const MESSAGE_RULES: Record<string, MessageRule> = {
  DANG_NHAP_SAI: {
    message: 'Email hoặc mật khẩu không đúng.',
    clearPassword: true,
  },
  TAI_KHOAN_NGUNG: {
    message: 'Tài khoản đã bị ngưng hoạt động. Vui lòng liên hệ quản trị viên.',
    clearPassword: true,
  },
  TAI_KHOAN_CHUA_KICH_HOAT: {
    message:
      'Tài khoản nhân sự này chưa được kích hoạt. Hãy dùng link kích hoạt trong email để thiết lập mật khẩu.',
    clearPassword: true,
  },
  LOI_HE_THONG: {
    message: 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.',
    clearPassword: false,
  },
  ORIGIN_KHONG_HOP_LE: {
    message: 'Yêu cầu không đến từ trang web được phép.',
    clearPassword: false,
  },
  // Ba mã dưới chỉ gặp khi /auth/me lỗi ngay sau đăng nhập
  PHIEN_HET_HIEU_LUC: {
    message: 'Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.',
    clearPassword: false,
  },
  TOKEN_KHONG_HOP_LE: {
    message:
      'Phiên làm việc không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
    clearPassword: false,
  },
  CHUA_DANG_NHAP: {
    message: 'Vui lòng đăng nhập để tiếp tục.',
    clearPassword: false,
  },
};

const FIELD_MESSAGES: Record<string, string> = {
  EMAIL_KHONG_HOP_LE: 'Email không hợp lệ.',
  MAT_KHAU_KHONG_HOP_LE: INVALID_PASSWORD_MESSAGE,
};

const CODE_STATES_WITH_ID = ['ConHan', 'HetHan', 'DaThuHoi', 'ChuaGui'];

export interface LoginFieldErrors {
  email?: string;
  matKhau?: string;
}

// `chiTiet` của EMAIL_CHUA_XAC_MINH khi còn mã để nhập; `CanDangKyLai` không bao giờ tới được kiểu này nên id luôn có
export interface UnverifiedDetail {
  maXacThucId: string;
  trangThaiMa: 'ConHan' | 'HetHan' | 'DaThuHoi' | 'ChuaGui';
  hetHanLuc: string | null;
}

// Hợp đồng bàn giao cho màn OTP của F2 qua `location.state` (TRACKING auth mục 5). Không bao giờ chứa mật khẩu.
export interface VerifyEmailHandoff {
  email: string;
  chiTiet: UnverifiedDetail;
}

export type LoginFailure =
  | { kind: 'message'; message: string; clearPassword: boolean }
  | { kind: 'fields'; fields: LoginFieldErrors }
  | { kind: 'locked'; seconds: number }
  | { kind: 'unverified'; message: string; chiTiet: UnverifiedDetail }
  | { kind: 'reregister'; message: string }
  | { kind: 'ignored' };

function plainMessage(message: string): LoginFailure {
  return { kind: 'message', message, clearPassword: false };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isLoginField(truong: string): truong is keyof LoginFieldErrors {
  return truong === 'email' || truong === 'matKhau';
}

function describeLock(error: ApiError): LoginFailure {
  const seconds = isRecord(error.chiTiet) ? error.chiTiet.soGiayConLai : null;
  if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) {
    return { kind: 'locked', seconds };
  }
  return plainMessage(errorMessageFor(error));
}

function describeUnverified(error: ApiError): LoginFailure {
  const { chiTiet } = error;
  if (isRecord(chiTiet) && chiTiet.trangThaiMa === 'CanDangKyLai') {
    return { kind: 'reregister', message: REREGISTER_MESSAGE };
  }
  // Chỉ mở đường tới màn nhập mã khi chắc chắn có id, để không bao giờ gọi verify-otp với null
  if (
    isRecord(chiTiet) &&
    typeof chiTiet.maXacThucId === 'string' &&
    chiTiet.maXacThucId !== '' &&
    CODE_STATES_WITH_ID.includes(String(chiTiet.trangThaiMa))
  ) {
    return {
      kind: 'unverified',
      message: UNVERIFIED_MESSAGE,
      chiTiet: chiTiet as unknown as UnverifiedDetail,
    };
  }
  return plainMessage(UNVERIFIED_MESSAGE);
}

function describeFields(error: ApiError): LoginFailure {
  const fields: LoginFieldErrors = {};
  for (const { truong, ma } of error.loi ?? []) {
    if (isLoginField(truong)) {
      fields[truong] ??= FIELD_MESSAGES[ma] ?? INVALID_DATA_MESSAGE;
    }
  }
  if (Object.keys(fields).length === 0) {
    return plainMessage(INVALID_DATA_MESSAGE);
  }
  return { kind: 'fields', fields };
}

export function describeLoginError(error: unknown): LoginFailure {
  if (error instanceof RequestAbortedError) return { kind: 'ignored' };
  if (!(error instanceof ApiError)) return plainMessage(errorMessageFor(error));

  switch (error.maLoi) {
    case 'TAI_KHOAN_BI_KHOA_TAM':
      return describeLock(error);
    case 'EMAIL_CHUA_XAC_MINH':
      return describeUnverified(error);
    case 'DU_LIEU_KHONG_HOP_LE':
      return describeFields(error);
  }
  const rule = MESSAGE_RULES[error.maLoi];
  return rule
    ? { kind: 'message', ...rule }
    : plainMessage(errorMessageFor(error));
}

// Câu tĩnh cho trình đọc màn hình: đọc một lần, không đọc lại mỗi giây
export function lockAnnouncement(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  return `Tài khoản bị khóa tạm thời do nhập sai nhiều lần. Thử lại sau khoảng ${minutes} phút.`;
}

export function verifyEmailHandoff(
  email: string,
  chiTiet: UnverifiedDetail,
): VerifyEmailHandoff {
  return { email, chiTiet };
}

// Kiểm tối thiểu ở biên: định dạng email do API quyết. Mật khẩu KHÔNG trim (hợp đồng A8).
export function validateLoginForm(
  email: string,
  matKhau: string,
): LoginFieldErrors {
  const errors: LoginFieldErrors = {};
  if (email.trim() === '') errors.email = 'Vui lòng nhập email.';
  if (matKhau === '') {
    errors.matKhau = 'Vui lòng nhập mật khẩu.';
  } else if (matKhau.length > PASSWORD_MAX_LENGTH) {
    errors.matKhau = INVALID_PASSWORD_MESSAGE;
  }
  return errors;
}
