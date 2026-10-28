import {
  OTP_MAX_PER_WINDOW,
  OTP_RESEND_MIN_INTERVAL_MS,
  OTP_WINDOW_MS,
} from '../auth.constants.js';
import type { MaXacThuc } from '../entities/ma-xac-thuc.entity.js';
import type { OtpFailure, OtpState, OtpStatusLabel } from './otp.types.js';

// Quy tắc nghiệp vụ OTP dưới dạng HÀM THUẦN (không DB, không đồng hồ thật): dễ kiểm bằng đồng hồ giả và là nơi duy nhất
// ghi các biên (hết hạn, 60 giây, 5 mã/giờ). OtpService chỉ lo đọc/ghi DB rồi gọi các hàm này.

type StateFacts = Pick<
  MaXacThuc,
  | 'loai'
  | 'daDungLuc'
  | 'daGuiLuc'
  | 'thuHoiLuc'
  | 'hetHanLuc'
  | 'hoTenDangKy'
  | 'soDienThoaiDangKy'
  | 'matKhauBamDangKy'
>;

/**
 * Suy ra trạng thái của một hàng OTP (bảng ở PLAN mục 5.2). `replaced` = tồn tại hàng cùng tài khoản/loại ĐÃ GỬI THÀNH CÔNG
 * với id lớn hơn (N1). Thứ tự ưu tiên (cái đứng trước thắng):
 *   đã dùng > phải đăng ký lại (N3) > bị thay thế > chưa gửi > thu hồi do sai > hết hạn > đang dùng được.
 * Hạn là nửa mở: đúng thời điểm `hetHanLuc` thì đã hết hạn (cùng quy ước với phiên đăng nhập ở A3).
 */
export function deriveOtpState(
  row: StateFacts,
  now: Date,
  replaced: boolean,
): OtpState {
  if (row.daDungLuc !== null) return 'DA_DUNG';
  // Hàng DangKy không còn dữ liệu đăng ký (đã bị xoá khi đặt lại mật khẩu, N3) thì không còn gì để xác minh hay gửi lại.
  // Hàng chưa dùng, chưa thu hồi mà cũng không có dữ liệu thì là trạng thái hỏng: xử lý như vậy cho an toàn.
  if (
    row.loai === 'DangKy' &&
    (row.hoTenDangKy === null ||
      row.soDienThoaiDangKy === null ||
      row.matKhauBamDangKy === null)
  ) {
    return 'CAN_DANG_KY_LAI';
  }
  if (replaced) return 'BI_THAY_THE';
  if (row.daGuiLuc === null) return 'CHUA_GUI';
  if (row.thuHoiLuc !== null) return 'THU_HOI_SAI';
  if (now.getTime() >= row.hetHanLuc.getTime()) return 'HET_HAN';
  return 'DANG_DUNG';
}

/** Trạng thái không cho xác minh thì trả lỗi tương ứng (không đếm lần sai); `null` nghĩa là được so mã. */
export function refusalFor(state: OtpState): OtpFailure | null {
  switch (state) {
    case 'DANG_DUNG':
      return null;
    case 'HET_HAN':
      return { code: 'OTP_HET_HAN', reason: 'EXPIRED' };
    case 'THU_HOI_SAI':
      return { code: 'OTP_HET_LUOT', reason: 'ATTEMPTS_EXHAUSTED' };
    case 'BI_THAY_THE':
      return { code: 'OTP_BI_THAY_THE', reason: 'REPLACED' };
    case 'CAN_DANG_KY_LAI':
      return { code: 'CAN_DANG_KY_LAI', reason: 'REGISTRATION_VOID' };
    // Dùng chung OTP_SAI để không lộ trạng thái của hàng cho người dò mã
    case 'CHUA_GUI':
      return { code: 'OTP_SAI', reason: 'NOT_SENT' };
    case 'DA_DUNG':
      return { code: 'OTP_SAI', reason: 'USED' };
  }
}

/**
 * Gửi lại từ hàng này được không (cột cuối của bảng 5.2)? `null` = được (chưa gửi/gửi lỗi, đang dùng, hết hạn, thu hồi do sai);
 * còn lại trả lỗi: bị thay thế, phải đăng ký lại, hoặc đã dùng.
 */
export function resendRefusalFor(state: OtpState): OtpFailure | null {
  switch (state) {
    case 'BI_THAY_THE':
      return { code: 'OTP_BI_THAY_THE', reason: 'REPLACED' };
    case 'CAN_DANG_KY_LAI':
      return { code: 'CAN_DANG_KY_LAI', reason: 'REGISTRATION_VOID' };
    case 'DA_DUNG':
      return { code: 'OTP_SAI', reason: 'USED' };
    case 'CHUA_GUI':
    case 'DANG_DUNG':
    case 'HET_HAN':
    case 'THU_HOI_SAI':
      return null;
  }
}

/** Nhãn `trangThaiMa` của đáp ứng đăng nhập chưa xác minh (PLAN 5.3, N2). */
export function statusLabelOf(state: OtpState): OtpStatusLabel {
  switch (state) {
    case 'DANG_DUNG':
      return 'ConHan';
    case 'HET_HAN':
      return 'HetHan';
    case 'CHUA_GUI':
      return 'ChuaGui';
    case 'CAN_DANG_KY_LAI':
      return 'CanDangKyLai';
    // THU_HOI_SAI là trường hợp thật. Hai trạng thái dưới không thể là hàng "đã gửi mới nhất" của tài khoản chưa xác minh
    // (bị thay thế thì đã có hàng mới hơn; đã dùng thì tài khoản đã xác minh), nên gộp vào DaThuHoi cho hàm đầy đủ.
    case 'THU_HOI_SAI':
    case 'BI_THAY_THE':
    case 'DA_DUNG':
      return 'DaThuHoi';
  }
}

export type IssueDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: 'TOO_SOON' | 'HOURLY_LIMIT';
      retryAfterSeconds: number;
    };

/**
 * Giới hạn gửi lại (ĐK A2/4d, quy tắc 17), theo (tài khoản, loại). `createdAt` là `tao_luc` của MỌI hàng của cặp đó,
 * KỂ CẢ hàng gửi lỗi. Được phép khi cùng lúc:
 *   - cách hàng mới nhất ≥ 60 giây (đúng 60 giây thì được, DK-14);
 *   - số hàng trong 1 giờ gần nhất < 5 (đang có 4 thì hàng thứ 5 được, có 5 thì hàng thứ 6 bị từ chối, DK-15).
 * Cửa sổ nửa mở: hàng đúng 1 giờ tuổi không còn được đếm. Vi phạm cả hai thì trả thời gian chờ LỚN hơn.
 */
export function decideIssue(
  createdAt: readonly Date[],
  now: Date,
): IssueDecision {
  const nowMs = now.getTime();
  const times = createdAt.map((d) => d.getTime()).sort((a, b) => a - b);
  const inWindow = times.filter((t) => nowMs - t < OTP_WINDOW_MS);

  const latest = times.length > 0 ? times[times.length - 1] : undefined;
  const waitForInterval =
    latest === undefined
      ? 0
      : Math.max(0, latest + OTP_RESEND_MIN_INTERVAL_MS - nowMs);

  // Cần (số hàng - 4) hàng cũ nhất rời khỏi cửa sổ thì mới còn dưới 5: hàng quyết định là hàng thứ (số hàng - 5) tính từ cũ nhất
  const decisive = inWindow[inWindow.length - OTP_MAX_PER_WINDOW];
  const waitForWindow =
    inWindow.length >= OTP_MAX_PER_WINDOW && decisive !== undefined
      ? Math.max(0, decisive + OTP_WINDOW_MS - nowMs)
      : 0;

  if (waitForInterval === 0 && waitForWindow === 0) return { allowed: true };
  const tooSoonIsLonger = waitForInterval >= waitForWindow;
  return {
    allowed: false,
    reason: tooSoonIsLonger ? 'TOO_SOON' : 'HOURLY_LIMIT',
    retryAfterSeconds: Math.ceil(
      Math.max(waitForInterval, waitForWindow) / 1000,
    ),
  };
}
