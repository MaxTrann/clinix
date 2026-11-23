import { useRouteError } from 'react-router';
import { ServerErrorCard } from '../shared/ui/server-error-card';

// `errorElement` dùng chung cho route gốc và route Admin (doctor UX4, G18): thay `RouteErrorPage` và `AdminErrorBoundary`. Màn 500 cả trang,
// không lộ chi tiết lỗi (chỉ phân loại theo loại lỗi). "Thử lại" tải lại trang: thoát chắc chắn cả lỗi nạp chunk `lazy` mà trình duyệt đã nhớ là hỏng;
// phiên đăng nhập được khôi phục bằng cookie làm mới. Ba khung có thanh bên dùng `ShellContentError` (dạng gọn) nên không đi qua đây.
export function RouteErrorElement() {
  const error = useRouteError();
  return (
    <ServerErrorCard error={error} onRetry={() => window.location.reload()} />
  );
}
