import { Link } from 'react-router';
import {
  ErrorPageCard,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from './error-page-card';
import {
  ERROR_VARIANTS,
  errorVariantOf,
  pageMessageFor,
} from './error-variant';

// Màn lỗi 500 cả trang (doctor UX4, G18, T9): thay trang lỗi trơ trọi của router. Chữ và icon chọn theo LOẠI lỗi (xem error-variant.ts);
// `error` chỉ dùng để phân loại, KHÔNG bao giờ được in ra (không thông điệp máy chủ, không stack, không mã nội bộ).
// `role="alert"` bọc phần chữ (không bọc nút); focus vào tiêu đề để trình đọc màn hình và bàn phím biết trang đã đổi.
interface ServerErrorCardProps {
  error: unknown;
  // Không truyền thì không có nút "Thử lại" (chỉ còn "Về trang chủ")
  onRetry?: () => void;
}

export function ServerErrorCard({ error, onRetry }: ServerErrorCardProps) {
  const { icon, title } = ERROR_VARIANTS[errorVariantOf(error)];
  return (
    <ErrorPageCard
      icon={icon}
      title={title}
      message={pageMessageFor(error)}
      role="alert"
      focusTitle
      iconClassName="bg-danger-soft text-danger"
      actions={
        <>
          {onRetry && (
            <button type="button" className={PRIMARY_BUTTON} onClick={onRetry}>
              Thử lại
            </button>
          )}
          <Link to="/" className={onRetry ? SECONDARY_BUTTON : PRIMARY_BUTTON}>
            Về trang chủ
          </Link>
        </>
      }
    />
  );
}
