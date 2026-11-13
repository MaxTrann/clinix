import type { ReactNode } from 'react';
import { Link } from 'react-router';

// Liên kết nội bộ của Bước 5 (booking F5): `Sửa`, "Sửa thông tin người khám", `Quay lại`. Khi `busy` (đang gửi `POST` tạo lịch) KHÔNG điều hướng: rời trang giữa chừng không huỷ
// lời gọi mà máy chủ vẫn xử lý, người dùng sẽ không thấy kết quả. Vẫn là một liên kết (đọc được tên) nhưng không có `href` và `aria-disabled`.
export function StepLink({
  to,
  busy,
  className,
  ariaLabel,
  children,
}: {
  to: string;
  busy: boolean;
  className: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  if (busy) {
    return (
      <span
        role="link"
        aria-disabled="true"
        aria-label={ariaLabel}
        className={`${className} cursor-not-allowed opacity-60`}
      >
        {children}
      </span>
    );
  }
  return (
    <Link to={to} aria-label={ariaLabel} className={className}>
      {children}
    </Link>
  );
}
