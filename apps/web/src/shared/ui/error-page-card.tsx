import { SearchX, ShieldAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';

// Thẻ giữa trang cho các màn lỗi cả trang (doctor UX1, G4): icon, tiêu đề, một câu, nút. 404 và 403 dùng ngay; màn 500 của UX4 dùng lại `ErrorPageCard`.
// Tailwind với token chuẩn, không CSS Module (FG-06), không viền focus riêng (FG-05: lớp base lo). Tiêu đề GIỮ chữ cũ vì nhiều test của các module
// tìm theo tiêu đề; thay đổi chữ là quyết định riêng.

const BUTTON =
  'inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors';
const PRIMARY = `${BUTTON} bg-brand-strong text-white hover:bg-cyan-800`;
const SECONDARY = `${BUTTON} border border-gray-200 bg-white text-gray-900 hover:bg-gray-50`;

export interface ErrorPageCardProps {
  icon: LucideIcon;
  title: string;
  message: string;
  // `alert` cho lỗi cần đọc ngay (403); chỉ bọc phần chữ, không bọc nút
  role?: 'alert';
  actions?: ReactNode;
  // Màu nền tròn của icon (cùng bộ token chuẩn); mặc định thương hiệu
  iconClassName?: string;
}

export function ErrorPageCard({
  icon: Icon,
  title,
  message,
  role,
  actions,
  iconClassName = 'bg-brand-soft text-brand-strong',
}: ErrorPageCardProps) {
  return (
    <main className="grid min-h-[50vh] place-items-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center">
        <span
          className={`mx-auto mb-4 flex size-12 items-center justify-center rounded-full ${iconClassName}`}
        >
          <Icon aria-hidden="true" className="size-6" />
        </span>
        <div role={role}>
          <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
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
      <Link to="/" className={PRIMARY}>
        Về trang chủ
      </Link>
      {location.key !== 'default' && (
        <button
          type="button"
          className={SECONDARY}
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
