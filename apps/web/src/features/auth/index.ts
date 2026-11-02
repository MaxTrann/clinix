// Bề mặt công khai của lõi xác thực: F2 đến F5 và admin F1 chỉ import từ đây (TRACKING auth mục 5 điểm 22).
export { login, logout, restoreSession, retrySession } from './auth-session';
export { useAuth } from './auth-store';
export type { AuthState, AuthStatus, AuthUser } from './auth-store';
export { AUTH_PAGE_ROUTES } from './auth-page-routes';
export { RequireAuth } from './require-auth';
export { RolePlaceholderPage } from './role-placeholder-page';
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
