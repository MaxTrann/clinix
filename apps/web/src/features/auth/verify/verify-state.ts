import { readReturnTo } from '../return-to';
import { textFrom } from '../route-state';

const UNVERIFIED_NOTICE =
  'Email của bạn chưa được xác minh. Nhập mã OTP đã nhận hoặc bấm "Gửi lại mã".';

// Câu cho `trangThaiMa` (N2). HetHan dùng câu `OTP_HET_HAN` của 5.5; hai câu còn lại là [đề xuất].
const CODE_STATUS_NOTICES: Record<string, string> = {
  HetHan: 'Mã OTP đã hết hạn. Vui lòng bấm "Gửi lại mã".',
  DaThuHoi: 'Mã OTP đã bị thu hồi. Vui lòng bấm "Gửi lại mã".',
  ChuaGui: 'Mã OTP chưa được gửi. Vui lòng bấm "Gửi lại mã".',
};

export interface RegisterDraft {
  hoTen: string;
  email: string;
  soDienThoai: string;
}

// Giữ trong `location.state` nên tải lại vẫn còn. KHÔNG BAO GIỜ có mật khẩu.
export interface PendingVerification {
  email: string;
  // Id của lần gửi thành công gần nhất, dùng để xác minh; null khi chưa có mã nào đi được
  verifyId: string | null;
  // Id mới nhất, dùng để gửi lại. Sau 503 đây là hàng gửi lỗi, verify bằng nó ra OTP_SAI nên phải tách khỏi verifyId.
  resendId: string;
  hetHanLuc: string | null;
  coTheGuiLaiLuc: string | null;
  // true khi vừa nhận từ API: đếm theo hiệu hai mốc; false (tải lại, bàn giao) thì theo đồng hồ máy
  fresh: boolean;
  notice: string | null;
  draft: RegisterDraft | null;
  // Trang cần đăng nhập người dùng đã rời (booking F3), đi qua xác minh để đăng nhập xong quay lại; chỉ có khi đã được kiểm hợp lệ
  from?: string;
}

export type VerifyRouteState =
  { verified: true; email: string; from?: string } | PendingVerification;

function fromHandoff(state: object, email: string): PendingVerification | null {
  const { chiTiet } = state as { chiTiet?: unknown };
  const id = textFrom(chiTiet, 'maXacThucId');
  const status = textFrom(chiTiet, 'trangThaiMa');
  if (id === null || status === null) return null;

  const canVerify = status === 'ConHan';
  if (!canVerify && !(status in CODE_STATUS_NOTICES)) return null;
  return {
    email,
    verifyId: canVerify ? id : null,
    resendId: id,
    hetHanLuc: canVerify ? textFrom(chiTiet, 'hetHanLuc') : null,
    coTheGuiLaiLuc: null,
    fresh: false,
    notice: canVerify ? UNVERIFIED_NOTICE : CODE_STATUS_NOTICES[status],
    draft: null,
  };
}

function isDraft(value: unknown): value is RegisterDraft {
  return (
    textFrom(value, 'email') !== null &&
    typeof (value as RegisterDraft).hoTen === 'string' &&
    typeof (value as RegisterDraft).soDienThoai === 'string'
  );
}

// null: không đủ dữ liệu để ở lại trang này. `from` (nếu hợp lệ) được gắn vào mọi nhánh; không có thì kết quả y như trước.
export function parseVerifyState(state: unknown): VerifyRouteState | null {
  const parsed = parseVerifyFields(state);
  const from = readReturnTo(state);
  return parsed === null || from === null ? parsed : { ...parsed, from };
}

function parseVerifyFields(state: unknown): VerifyRouteState | null {
  const email = textFrom(state, 'email');
  if (email === null) return null;
  const value = state as Record<string, unknown>;
  if (value.verified === true) return { verified: true, email };

  const resendId = textFrom(state, 'resendId');
  if (resendId === null) return fromHandoff(value, email);
  return {
    email,
    verifyId: textFrom(state, 'verifyId'),
    resendId,
    hetHanLuc: textFrom(state, 'hetHanLuc'),
    coTheGuiLaiLuc: textFrom(state, 'coTheGuiLaiLuc'),
    fresh: value.fresh === true,
    notice: textFrom(state, 'notice'),
    draft: isDraft(value.draft) ? value.draft : null,
  };
}
