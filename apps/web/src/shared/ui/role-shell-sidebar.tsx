import { ChevronRight, LogOut, Stethoscope, User } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import type { RoleNavItem, RoleShellLogout } from './role-shell';

// Thân thanh bên của RoleShell (tách ở patient F11): dùng nguyên cho thanh bên màn rộng (trong `aside`) và cho ngăn kéo màn hẹp
// (trong `role="dialog"`), nên lúc nào trang cũng chỉ có MỘT bản. Chỉ dùng trong `role-shell.tsx`.
// Số đo và token: docs/features/patient/TRACKING.md F1-C. Mọi giá trị `[...]` dưới đây là chỗ thang Tailwind trên gốc 15px không khớp Figma.

const NOT_IMPLEMENTED_TITLE = 'Chưa được triển khai';

// [...]: bo 9,375px của Figma nằm giữa rounded-lg (7,5px) và rounded-xl (11,25px)
const ITEM_BASE =
  'flex h-10 w-full items-center gap-3 rounded-[0.625rem] px-3 text-left text-sm';

function NavItemLink({ item }: { item: RoleNavItem }) {
  const Icon = item.icon;
  if (!item.to) {
    // `disabled` như AdminSidebar: không vào được bằng Tab nên chữ ẩn đọc cho trình đọc màn hình
    return (
      <button
        type="button"
        disabled
        title={NOT_IMPLEMENTED_TITLE}
        className={`${ITEM_BASE} text-gray-500`}
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span>{item.label}</span>
        <span className="sr-only"> (chưa được triển khai)</span>
      </button>
    );
  }
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `${ITEM_BASE} ${
          // Figma `#0092b8` chữ trắng chỉ 3,62:1, dùng brand-strong 5,28:1 (ADR 0004)
          isActive
            ? 'bg-brand-strong text-white'
            : 'text-gray-600 hover:bg-gray-50'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate">{item.label}</span>
          {isActive && (
            <ChevronRight
              className="ml-auto size-3 shrink-0"
              aria-hidden="true"
            />
          )}
        </>
      )}
    </NavLink>
  );
}

function NavItemList({ items }: { items: RoleNavItem[] }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => (
        <li key={item.label}>
          <NavItemLink item={item} />
        </li>
      ))}
    </ul>
  );
}

// Hộp lỗi đăng xuất (G5): ở cuối thanh bên, hoặc ở dải dưới thanh trên khi màn hẹp và ngăn kéo đóng (TRACKING F11-E)
export function LogoutAlert({
  logout,
  className = '',
}: {
  logout: RoleShellLogout;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong ${className}`.trim()}
    >
      <p>{logout.failedMessage}</p>
      <button
        type="button"
        disabled={logout.pending}
        onClick={logout.onLogout}
        className="mt-1 py-1 font-medium underline"
      >
        Thử lại
      </button>
    </div>
  );
}

export interface RoleShellSidebarProps {
  userName: string;
  userSubtitle: string;
  items: RoleNavItem[];
  footerItems: RoleNavItem[];
  logout: RoleShellLogout;
  // Hộp lỗi đăng xuất nằm ở đây hay ở dải dưới thanh trên (nơi gọi quyết định để trang chỉ có một hộp)
  showLogoutAlert: boolean;
  // Nút "Đóng menu" của ngăn kéo, đặt ở góc phải khối logo; màn rộng không có
  closeButton?: ReactNode;
}

export function RoleShellSidebar({
  userName,
  userSubtitle,
  items,
  footerItems,
  logout,
  showLogoutAlert,
  closeButton,
}: RoleShellSidebarProps) {
  return (
    <>
      <div
        className={
          closeButton
            ? 'flex items-center justify-between border-b border-gray-100 p-4'
            : 'border-b border-gray-100 p-4'
        }
      >
        <Link
          to="/"
          aria-label="CLINIX – Trang chủ"
          className="flex w-fit items-center gap-2 rounded-[0.625rem]"
        >
          <span className="flex size-7 items-center justify-center rounded-[0.625rem] bg-brand">
            <Stethoscope className="size-4 text-white" aria-hidden="true" />
          </span>
          <span className="text-base font-semibold text-gray-900">CLINIX</span>
        </Link>
        {closeButton}
      </div>

      <div className="border-b border-gray-100 p-3">
        <div className="flex items-center gap-3 rounded-[0.625rem] bg-brand-soft p-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand">
            <User className="size-4 text-white" aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span
              className="truncate text-sm font-medium text-gray-900"
              title={userName}
            >
              {userName}
            </span>
            {/* Figma `#0092b8` trên brand-soft chỉ 3,48:1, dùng brand-strong 5,07:1 */}
            <span className="truncate text-xs text-brand-strong">
              {userSubtitle}
            </span>
          </span>
        </div>
      </div>

      <nav aria-label="Menu chính" className="flex-1 overflow-y-auto p-3">
        <NavItemList items={items} />
      </nav>

      <div className="flex flex-col gap-1 border-t border-gray-100 p-3">
        {footerItems.length > 0 && <NavItemList items={footerItems} />}
        {showLogoutAlert && logout.failed && <LogoutAlert logout={logout} />}
        <button
          type="button"
          disabled={logout.pending}
          onClick={logout.onLogout}
          className={`${ITEM_BASE} font-medium text-danger hover:bg-danger-soft disabled:opacity-50`}
        >
          <LogOut className="size-4 shrink-0" aria-hidden="true" />
          <span>Đăng xuất</span>
        </button>
      </div>
    </>
  );
}
