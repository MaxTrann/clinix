// Bề mặt công khai của lõi xác thực: F2 đến F5 và admin F1 chỉ import từ đây (TRACKING auth mục 5 điểm 22).
export {
  login,
  logout,
  refreshCurrentUser,
  restoreSession,
  retrySession,
} from './auth-session';
export { useAuth } from './auth-store';
export type { AuthState, AuthStatus, AuthUser } from './auth-store';
export { AUTH_PAGE_ROUTES } from './auth-page-routes';
export { RequireAuth } from './require-auth';
export { RolePlaceholderPage } from './role-placeholder-page';
// F5: khối đổi mật khẩu cho các trang hồ sơ và nút Đăng xuất của các khung (TRACKING auth F5-A)
export { ChangePasswordForm } from './change-password/change-password-form';
export type { ChangePasswordFormProps } from './change-password/change-password-form';
export { LOGOUT_FAILED_MESSAGE, useLogout } from './use-logout';
// booking F5 (Đại duyệt 13/11/2026): cờ "trang còn gắn" để lời gọi `POST` tạo lịch hẹn không kéo người dùng đã rời trang quay lại; kiểm sau mỗi `await`
export { usePageActive } from './use-page-active';
// patient P2: trang hồ sơ (F3, F6) kiểm họ tên, SĐT đúng luật đăng ký; `trimAsciiWhitespace` để nhận ra ô rỗng hoặc chỉ có
// khoảng trắng và cắt giống API (không cắt U+00A0). Email ở hồ sơ chỉ đọc nên không xuất `isPlausibleEmail`.
export {
  isValidFullName,
  isValidPhone,
  trimAsciiWhitespace,
} from './validation/account-policy';
export {
  FORGOT_PASSWORD_PATH,
  LOGIN_PATH,
  REGISTER_PATH,
  ROLE_HOME_PATHS,
  ROLE_LABELS,
  VERIFY_EMAIL_PATH,
  homePathFor,
} from './roles';
export type { VaiTro } from './roles';
// admin F10: trang kích hoạt nhân sự (công khai) đặt mật khẩu bằng đúng validator, câu chữ, ô nhập và khung thành công của
// màn Quên mật khẩu, thay vì chép lại (TRACKING admin 9A.7, Đại chọn re-export ở đây)
export { validateNewPassword } from './validation/new-password';
export {
  FIELD_MESSAGES,
  INVALID_DATA_MESSAGE,
  PASSWORD_RULE_MESSAGE,
  SYSTEM_MESSAGE,
} from './register/register-errors';
export { RegisterFieldInput } from './register/register-field';
export { FormAlert, PRIMARY_LINK, SuccessPanel } from './auth-form-parts';
