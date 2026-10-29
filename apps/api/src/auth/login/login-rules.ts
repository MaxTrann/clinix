import { LOGIN_LOCK_MS, LOGIN_MAX_FAILURES } from '../auth.constants.js';
import type { TaiKhoan } from '../entities/tai-khoan.entity.js';
import type { OtpLatestStatus, OtpStatusLabel } from '../otp/otp.types.js';
import { isExpiredUnverifiedPatient } from '../register/unverified-account-rules.js';

// Quy tắc đăng nhập dưới dạng HÀM THUẦN (task A8; quy tắc nghiệp vụ 18 và 23 của docs/database, PLAN 5.3): không DB, không đồng hồ thật.
// Mọi hàm nhận `now` từ nơi gọi (currentSecond() của OtpService: MỘT nguồn đồng hồ như A2 đến A7) nên test kiểm biên từng giây bằng đồng hồ truyền vào.

export type LoginFacts = Pick<
  TaiKhoan,
  | 'loaiTaiKhoan'
  | 'trangThai'
  | 'daXacMinhEmail'
  | 'thoiDiemTao'
  | 'soLanDangNhapSai'
  | 'khoaDangNhapDen'
>;

export type LoginRefusal =
  | { kind: 'PENDING_ACTIVATION' }
  | { kind: 'SUSPENDED' }
  | { kind: 'LOCKED'; lockedUntil: Date; remainingSeconds: number };

/**
 * Đang bị khoá đăng nhập khi `khoa_dang_nhap_den` còn Ở TƯƠNG LAI (đúng như ghi chú cột). Nửa mở: đúng mốc thì đã hết khoá, cùng quy ước
 * "đúng mốc là hết" của OTP, phiên và hạn 24 giờ. Cả hai vế đều cắt giây nên không có khe nửa giây.
 */
export function isLockedAt(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

/**
 * Lý do TỪ CHỐI đăng nhập TRƯỚC khi so mật khẩu (quy tắc 23), theo đúng thứ tự: trạng thái rồi mới tới khoá tạm.
 * ChoKichHoat và NgungHoatDong từ chối dù đang khoá hay không (DN-16); `null` nghĩa là được so mật khẩu.
 */
export function loginRefusalFor(
  account: Pick<LoginFacts, 'trangThai' | 'khoaDangNhapDen'>,
  now: Date,
): LoginRefusal | null {
  if (account.trangThai === 'ChoKichHoat')
    return { kind: 'PENDING_ACTIVATION' };
  if (account.trangThai === 'NgungHoatDong') return { kind: 'SUSPENDED' };
  const { khoaDangNhapDen } = account;
  if (khoaDangNhapDen !== null && isLockedAt(khoaDangNhapDen, now)) {
    return {
      kind: 'LOCKED',
      lockedUntil: khoaDangNhapDen,
      remainingSeconds: Math.ceil(
        (khoaDangNhapDen.getTime() - now.getTime()) / 1000,
      ),
    };
  }
  return null;
}

export interface FailureState {
  failures: number;
  lockedUntil: Date | null;
}

/**
 * Trạng thái sau MỘT lần sai (quy tắc 18). Chỉ gọi khi tài khoản KHÔNG đang bị khoá (đã kiểm dưới khoá hàng).
 * Khoá đã hết hạn thì coi bộ đếm là 0: khoá 15 phút là án đã chịu xong, nên lần sai kế tiếp đếm lại từ 1 và giá trị khoá cũ bị xoá (DN-13, A8-C).
 * Đủ LOGIN_MAX_FAILURES lần liên tiếp thì khoá LOGIN_LOCK_MS kể từ lúc này.
 */
export function nextFailureState(
  account: Pick<LoginFacts, 'soLanDangNhapSai' | 'khoaDangNhapDen'>,
  now: Date,
): FailureState {
  const lockExpired =
    account.khoaDangNhapDen !== null &&
    account.khoaDangNhapDen.getTime() <= now.getTime();
  const failures = (lockExpired ? 0 : account.soLanDangNhapSai) + 1;
  return {
    failures,
    lockedUntil:
      failures >= LOGIN_MAX_FAILURES
        ? new Date(now.getTime() + LOGIN_LOCK_MS)
        : null,
  };
}

/** Đăng nhập đúng: chỉ cần ghi khi bộ đếm hoặc khoá còn giá trị (đăng nhập đúng song song không phải giành nhau ghi). */
export function needsFailureReset(
  account: Pick<LoginFacts, 'soLanDangNhapSai' | 'khoaDangNhapDen'>,
): boolean {
  return account.soLanDangNhapSai !== 0 || account.khoaDangNhapDen !== null;
}

export interface UnverifiedStatus {
  /** `null` khi không còn mã nào để nhập (CanDangKyLai) */
  maXacThucId: string | null;
  trangThaiMa: OtpStatusLabel;
  hetHanLuc: Date | null;
}

/**
 * `trangThaiMa` của đáp ứng "đúng mật khẩu nhưng chưa xác minh email" (PLAN 5.3, N2). `latest` là kết quả `OtpService.latestStatus`.
 * Ba trường hợp cùng là CanDangKyLai, kèm `maXacThucId` và `hetHanLuc` là `null` vì không có mã nào để nhập:
 *  - tài khoản Bệnh nhân đã quá 24 giờ mà job dọn chưa chạy (TECH_DEBT 32: latestStatus chỉ nhìn hàng OTP, không biết hạn 24 giờ);
 *  - mã bị thu hồi do đặt lại mật khẩu (N3, latestStatus đã trả CanDangKyLai);
 *  - không có hàng OTP đăng ký nào (chỉ gặp khi dữ liệu không nhất quán, ví dụ nhân sự có cờ chưa xác minh).
 */
export function unverifiedStatusFor(
  account: Pick<
    LoginFacts,
    'loaiTaiKhoan' | 'daXacMinhEmail' | 'trangThai' | 'thoiDiemTao'
  >,
  latest: OtpLatestStatus | null,
  now: Date,
): UnverifiedStatus {
  if (
    latest === null ||
    latest.trangThaiMa === 'CanDangKyLai' ||
    isExpiredUnverifiedPatient(account, now)
  ) {
    return { maXacThucId: null, trangThaiMa: 'CanDangKyLai', hetHanLuc: null };
  }
  return {
    maXacThucId: latest.maXacThucId,
    trangThaiMa: latest.trangThaiMa,
    hetHanLuc: latest.hetHanLuc,
  };
}
