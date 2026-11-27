import {
  FORGOT_PASSWORD_PATH,
  LOGIN_PATH,
  REGISTER_PATH,
  type AuthStatus,
  type VaiTro,
} from '../../auth';

// Trang kích hoạt tài khoản nhân sự: chép giá trị `STAFF_ACTIVATION_PATH` của `features/staff-activation` (chatbot không import module
// đó, PLAN 1.2); `router/chatbot-widget-route.test.tsx` khoá hai hằng này bằng nhau.
export const STAFF_ACTIVATION_PATH_COPY = '/kich-hoat';

// Nút KHÔNG hiện ở các trang này (PLAN MH1). `REGISTER_PATH` đã phủ cả trang xác minh email (`/dang-ky/xac-minh`).
export const HIDDEN_PATH_PREFIXES: readonly string[] = [
  LOGIN_PATH,
  REGISTER_PATH,
  FORGOT_PASSWORD_PATH,
  STAFF_ACTIVATION_PATH_COPY,
];

function isHiddenPath(pathname: string): boolean {
  // Bộ định tuyến khớp đường dẫn không phân biệt hoa thường
  const path = pathname.toLowerCase();
  return HIDDEN_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export interface VisibilityInput {
  status: AuthStatus;
  vaiTro: VaiTro | undefined;
  pathname: string;
}

// Nút nổi "Trợ lý AI" hiện cho khách và Bệnh nhân (Q14, Đại duyệt 27/11/2026). Chưa biết vai (`checking`, `error`) thì ẩn, để Bác sĩ,
// Lễ tân, Quản trị viên không thấy nút nhấp nháy lúc tải trang. Chỉ ẩn giao diện: API hỏi đáp công khai nên không có quyền để kiểm.
export function isWidgetVisible({
  status,
  vaiTro,
  pathname,
}: VisibilityInput): boolean {
  if (isHiddenPath(pathname)) return false;
  if (status === 'unauthenticated') return true;
  return status === 'authenticated' && vaiTro === 'BenhNhan';
}
