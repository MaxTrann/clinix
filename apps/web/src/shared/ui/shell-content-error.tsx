import { useRouteError } from 'react-router';
import { ErrorState } from './error-state';

// `errorElement` của route bọc các trang con trong một khung (RoleShell): trang con lỗi thì thanh bên, thanh trên và nút
// Đăng xuất vẫn còn. Không có `<main>` riêng (khung đã có) và không lộ chi tiết lỗi (ErrorState chỉ hiện câu chung).
export function ShellContentError() {
  const error = useRouteError();
  return <ErrorState error={error} />;
}
