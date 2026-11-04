import { CalendarDays, Stethoscope } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import type { RoleShellLogout } from '../../../shared/ui/role-shell';
import { AccountMenu } from './account-menu';
import { NOT_IMPLEMENTED_TITLE, type PublicNavItem } from './public-nav-types';
import { ServiceMenu, type ServiceGroupLink } from './service-menu';

export interface PublicHeaderUser {
  name: string;
  homePath: string;
  logout: RoleShellLogout;
}

export interface PublicHeaderProps {
  navItems: PublicNavItem[];
  bookingItem: PublicNavItem;
  loginPath: string;
  // null = Khách vãng lai ("Đăng nhập"); có giá trị = nút họ tên + menu tài khoản
  user: PublicHeaderUser | null;
  serviceGroups?: ServiceGroupLink[];
  // Bộ chọn chi nhánh, đặt bên trái nút "Đặt lịch khám" (Q19a)
  branchPicker?: ReactNode;
}

// Số đo theo Figma `257:6` (gốc 15px): cao 60px, chữ 13,125px, mục py 7,5px px 11,25px, bo 7,375px.
const ITEM_CLASS = 'rounded-[0.5rem] px-3 py-2 text-sm font-medium';
const DISABLED_CLASS = `${ITEM_CLASS} text-gray-500`;

function DisabledItem({ item }: { item: PublicNavItem }) {
  return (
    <button
      type="button"
      disabled
      title={NOT_IMPLEMENTED_TITLE}
      className={DISABLED_CLASS}
    >
      {item.label}
      <span className="sr-only"> (chưa được triển khai)</span>
    </button>
  );
}

function NavEntry({
  item,
  serviceGroups,
}: {
  item: PublicNavItem;
  serviceGroups?: ServiceGroupLink[];
}) {
  if (item.hasMenu) {
    return (
      <ServiceMenu
        item={item}
        groups={serviceGroups}
        itemClassName={ITEM_CLASS}
      />
    );
  }
  if (!item.to) return <DisabledItem item={item} />;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `${ITEM_CLASS} ${
          // Figma `#007595` trên `#ecfeff` đạt 4,5:1 trở lên
          isActive
            ? 'bg-brand-soft text-cyan-800'
            : 'text-gray-600 hover:bg-gray-50'
        }`
      }
    >
      {item.label}
    </NavLink>
  );
}

export function PublicHeader({
  navItems,
  bookingItem,
  loginPath,
  user,
  serviceGroups,
  branchPicker,
}: PublicHeaderProps) {
  return (
    <header className="border-b border-gray-100 bg-white shadow-sm">
      <div className="mx-auto flex h-15 max-w-300 items-center justify-between gap-4 px-7.5">
        <Link to="/" className="flex items-center gap-2 rounded-[0.625rem]">
          <span className="flex size-7.5 items-center justify-center rounded-[0.625rem] bg-brand">
            <Stethoscope className="size-4.5 text-white" aria-hidden="true" />
          </span>
          <span className="text-lg font-semibold text-gray-900">CLINIX</span>
        </Link>

        <nav aria-label="Điều hướng chính" className="flex items-center gap-1">
          {navItems.map((item) => (
            <NavEntry
              key={item.label}
              item={item}
              serviceGroups={serviceGroups}
            />
          ))}
        </nav>

        <div className="flex items-center gap-4">
          {branchPicker}
          {bookingItem.to ? (
            <Link
              to={bookingItem.to}
              // Figma: chữ trắng trên cam `#fe9a00` không đạt tương phản (Q26) nên dùng chữ đậm tối trên nền cam
              className="flex items-center gap-1.5 rounded-[0.625rem] bg-amber-500 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-amber-400"
            >
              <CalendarDays className="size-4" aria-hidden="true" />
              {bookingItem.label}
            </Link>
          ) : (
            <button
              type="button"
              disabled
              title={NOT_IMPLEMENTED_TITLE}
              className="flex items-center gap-1.5 rounded-[0.625rem] bg-gray-100 px-4 py-2 text-sm font-medium text-gray-500"
            >
              <CalendarDays className="size-4" aria-hidden="true" />
              {bookingItem.label}
              <span className="sr-only"> (chưa được triển khai)</span>
            </button>
          )}
          {user ? (
            <AccountMenu
              userName={user.name}
              homePath={user.homePath}
              logout={user.logout}
            />
          ) : (
            <Link
              to={loginPath}
              className="rounded-[0.625rem] border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Đăng nhập
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
