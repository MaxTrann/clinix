import { SearchX, ShieldAlert, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';

// Thẻ giữa trang cho các màn lỗi cả trang (doctor UX1, G4): icon, tiêu đề, một câu, nút. 404, 403 và màn 500 (`ServerErrorCard`, doctor UX4) dùng chung.
// Tailwind với token chuẩn, không CSS Module (FG-06), không viền focus riêng (FG-05: lớp base lo). Tiêu đề GIỮ chữ cũ vì nhiều test của các module
// tìm theo tiêu đề; thay đổi chữ là quyết định riêng.

// `min-h-[44px]` chứ không phải `min-h-11`: cỡ chữ gốc của dự án là 15 px nên `min-h-11` (2,75 rem) chỉ ra 41,25 px, thấp hơn cỡ chạm 44 px
// (đo bằng trình duyệt ở doctor UX4, Đại duyệt đổi cho cả ba thẻ 404, 403, 500).
const BUTTON =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors';
// Xuất để màn 500 dùng cùng kiểu nút với 404 và 403
export const PRIMARY_BUTTON = `${BUTTON} bg-brand-strong text-white hover:bg-cyan-800`;
export const SECONDARY_BUTTON = `${BUTTON} border border-gray-200 bg-white text-gray-900 hover:bg-gray-50`;

export interface ErrorPageCardProps {
  icon: LucideIcon;
  title: string;
  message: string;
  // `alert` cho lỗi cần đọc ngay (403, 500); chỉ bọc phần chữ, không bọc nút
  role?: 'alert';
  actions?: ReactNode;
  // Màu nền tròn của icon (cùng bộ token chuẩn); mặc định thương hiệu
  iconClassName?: string;
  // Đưa focus vào tiêu đề MỘT lần khi thẻ hiện (màn 500 thay cả trang nên phần tử đang focus đã bị gỡ). Mặc định tắt: 404 và 403 là trang thường.
  focusTitle?: boolean;
}

export function ErrorPageCard({
  icon: Icon,
  title,
  message,
  role,
  actions,
  iconClassName = 'bg-brand-soft text-brand-strong',
  focusTitle = false,
}: ErrorPageCardProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Chỉ chạy lại khi `focusTitle` đổi: render lại cùng props thì không giật focus khỏi nút người dùng vừa chọn
  useEffect(() => {
    if (focusTitle) titleRef.current?.focus();
  }, [focusTitle]);

  return (
    <main className="grid min-h-[50vh] place-items-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center">
        <span
          className={`mx-auto mb-4 flex size-12 items-center justify-center rounded-full ${iconClassName}`}
        >
          <Icon aria-hidden="true" className="size-6" />
        </span>
        <div role={role}>
          <h1
            ref={titleRef}
            tabIndex={focusTitle ? -1 : undefined}
            className="text-xl font-semibold text-gray-900"
          >
            {title}
          </h1>
          <p className="mt-2 text-sm text-gray-600">{message}</p>
        </div>
        {actions && (
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            {actions}
          </div>
        )}
      </div>
    </main>
  );
}

// "Quay lại" chỉ hiện khi có trang trước trong phiên: trang đầu của phiên có `key` "default", bấm lùi sẽ ra khỏi ứng dụng
function PageActions() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <>
      <Link to="/" className={PRIMARY_BUTTON}>
        Về trang chủ
      </Link>
      {location.key !== 'default' && (
        <button
          type="button"
          className={SECONDARY_BUTTON}
          onClick={() => void navigate(-1)}
        >
          Quay lại
        </button>
      )}
    </>
  );
}

// Dùng cho route không có VÀ cho sai vai trò (cố ý không phân biệt: không lộ trang có tồn tại, quyết định của auth ở `require-auth.tsx`)
export function NotFoundCard() {
  return (
    <ErrorPageCard
      icon={SearchX}
      title="Không tìm thấy trang"
      message="Trang bạn tìm không tồn tại hoặc bạn không thể truy cập trang này."
      actions={<PageActions />}
    />
  );
}

// Chỉ cho người đã đúng vai trò mà ngoài phạm vi (ví dụ Quản trị viên Chi nhánh mở trang chỉ Toàn hệ thống)
export function ForbiddenCard() {
  return (
    <ErrorPageCard
      icon={ShieldAlert}
      title="Không đủ quyền truy cập"
      message="Bạn không có quyền truy cập trang này."
      role="alert"
      iconClassName="bg-warning-soft text-warning"
      actions={<PageActions />}
    />
  );
}
