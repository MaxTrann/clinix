import { CalendarDays, Stethoscope } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import type { RoleShellLogout } from '../../../shared/ui/role-shell';
import { AccountMenu } from './account-menu';
import { NOT_IMPLEMENTED_TITLE, type PublicNavItem } from './public-nav-types';
import { PUBLIC_CONTAINER } from '../layout';
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
  menuButton?: ReactNode;
}

// Số đo theo Figma `257:6` (gốc 15px): cao 60px (`h-16`), chữ 13,125px, mục py 7,5px px 11,25px, bo 7,375px, khe 3,75px.
// `whitespace-nowrap shrink-0`: Figma để mỗi mục MỘT dòng; thiếu hai lớp này thì khi chật mục bị xuống hai dòng (search F14, UIS-02).
const ITEM_CLASS =
  'shrink-0 whitespace-nowrap rounded-[0.5rem] px-3 py-2 text-sm font-medium';
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

export function NavEntry({
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

export function PublicActions({
  bookingItem,
  loginPath,
  user,
  branchPicker,
  compact = false,
}: Pick<
  PublicHeaderProps,
  'bookingItem' | 'loginPath' | 'user' | 'branchPicker'
> & { compact?: boolean }) {
  // Hàng ngang: `min-w-0` (cả hộp này và hộp bọc bộ chọn, menu tài khoản) để nhãn `truncate` co lại khi chật; thiếu nó,
  // `whitespace-nowrap` của nhãn làm bề rộng tối thiểu bằng cả chuỗi và hàng tràn khung (đo 1280 px, search F14 M5).
  // Trần bề rộng (150 và 210 px) đặt ở hộp bọc, còn nút dùng `max-w-full`: <button> co theo nội dung chứ không theo hộp bọc.
  // `gap-3` (11,25 px, Figma không có ba hành động này): tổng bề rộng đã đăng nhập, tên ngắn, từ 1202 xuống 1194,5 ≤ 1200.
  return (
    <div
      className={`flex ${compact ? 'flex-col items-stretch gap-4' : 'min-w-0 items-center gap-3'}`}
    >
      {branchPicker}
      {bookingItem.to ? (
        <Link
          to={bookingItem.to}
          // Figma: chữ trắng trên cam không đạt tương phản (2,13:1) nên dùng chữ gray-900 trên nền cam token `cta` (10,30:1; search UI PR-A, G1)
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[0.625rem] bg-cta px-4 py-2 text-sm font-medium text-gray-900 hover:bg-cta-hover"
        >
          <CalendarDays className="size-4" aria-hidden="true" />
          {bookingItem.label}
        </Link>
      ) : (
        <button
          type="button"
          disabled
          title={NOT_IMPLEMENTED_TITLE}
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[0.625rem] bg-gray-100 px-4 py-2 text-sm font-medium text-gray-500"
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
          className="shrink-0 whitespace-nowrap rounded-[0.625rem] border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Đăng nhập
        </Link>
      )}
    </div>
  );
}

export function PublicHeader({
  navItems,
  bookingItem,
  loginPath,
  user,
  serviceGroups,
  branchPicker,
  menuButton,
}: PublicHeaderProps) {
  return (
    <header className="border-b border-gray-100 bg-white shadow-sm">
      <div
        className={`${PUBLIC_CONTAINER} flex h-16 items-center justify-between gap-4`}
      >
        <Link to="/" className="flex items-center gap-2.5 rounded-[0.625rem]">
          <span className="flex size-8 items-center justify-center rounded-[0.625rem] bg-brand">
            <Stethoscope className="size-5 text-white" aria-hidden="true" />
          </span>
          <span className="text-xl font-semibold text-gray-900">CLINIX</span>
        </Link>

        {!menuButton && (
          <nav
            aria-label="Điều hướng chính"
            className="flex items-center gap-1"
          >
            {navItems.map((item) => (
              <NavEntry
                key={item.label}
                item={item}
                serviceGroups={serviceGroups}
              />
            ))}
          </nav>
        )}

        {!menuButton && (
          <PublicActions
            bookingItem={bookingItem}
            loginPath={loginPath}
            user={user}
            branchPicker={branchPicker}
          />
        )}
        {menuButton}
      </div>
    </header>
  );
}
