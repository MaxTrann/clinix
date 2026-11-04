import type { LucideIcon } from 'lucide-react';
import { ChevronRight, LogOut, Stethoscope, User } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';

// Khung dùng chung của Bệnh nhân, Lễ tân (patient F1, F2) và Bác sĩ (module doctor), theo Figma `416:2`, `483:2`.
// Thuần hiển thị: không đọc phiên, không gọi API. Nơi dùng (PatientLayout…) nối `useAuth()` và `useLogout()` rồi truyền vào.
// Số đo và token: docs/features/patient/TRACKING.md F1-C. Mọi giá trị `[...]` dưới đây là chỗ thang Tailwind trên gốc 15px không khớp Figma.

export interface RoleNavItem {
  label: string;
  icon: LucideIcon;
  // Không có `to` = trang chưa làm: hiện nút vô hiệu "Chưa được triển khai" (Q21a)
  to?: string;
  // Chỉ sáng khi đúng đường dẫn này, không sáng ở trang con
  end?: boolean;
}

export interface RoleShellLogout {
  onLogout: () => void;
  pending: boolean;
  failed: boolean;
  failedMessage: string;
}

export interface RoleShellProps {
  // Tên của vùng thanh bên, ví dụ "Điều hướng Bệnh nhân"
  navLabel: string;
  userName: string;
  userSubtitle: string;
  items: RoleNavItem[];
  // Mục dưới cùng, trên nút Đăng xuất (Bệnh nhân có "Về trang chủ", Lễ tân không có)
  footerItems?: RoleNavItem[];
  logout: RoleShellLogout;
  children: ReactNode;
}

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

export function RoleShell({
  navLabel,
  userName,
  userSubtitle,
  items,
  footerItems = [],
  logout,
  children,
}: RoleShellProps) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* [...]: Figma rộng 224px + viền 1px; w-56 trên gốc 15px chỉ 210px */}
      <aside
        aria-label={navLabel}
        className="sticky top-0 flex h-screen w-[225px] shrink-0 flex-col border-r border-gray-100 bg-white"
      >
        <div className="border-b border-gray-100 p-4">
          <Link
            to="/"
            aria-label="CLINIX – Trang chủ"
            className="flex w-fit items-center gap-2 rounded-[0.625rem]"
          >
            <span className="flex size-7 items-center justify-center rounded-[0.625rem] bg-brand">
              <Stethoscope className="size-4 text-white" aria-hidden="true" />
            </span>
            <span className="text-base font-semibold text-gray-900">
              CLINIX
            </span>
          </Link>
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
          {logout.failed && (
            <div
              role="alert"
              className="rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong"
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
          )}
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
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Chuông và số đếm ẩn tới khi module notification có (Q21b) */}
        <header className="flex h-14 shrink-0 items-center justify-end gap-4 border-b border-gray-100 bg-white px-4">
          <button
            type="button"
            disabled={logout.pending}
            onClick={logout.onLogout}
            // h-8 (30px): chữ của Figma chỉ cao 19px, dưới vùng bấm tối thiểu 24px (WCAG 2.5.8)
            className="flex h-8 items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            <LogOut className="size-4" aria-hidden="true" />
            <span>Đăng xuất</span>
          </button>
        </header>
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
