import { LogOut, User } from 'lucide-react';
import { Link } from 'react-router';
import type { RoleShellLogout } from '../../../shared/ui/role-shell';
import { useDismissible } from './use-dismissible';

export interface AccountMenuProps {
  userName: string;
  // Đường dẫn "Trang của tôi" của vai trò đang đăng nhập (homePathFor)
  homePath: string;
  logout: RoleShellLogout;
}

// Nút họ tên thay cho "Đăng nhập" khi đã đăng nhập (Q19b): mở menu "Trang của tôi" và "Đăng xuất".
export function AccountMenu({ userName, homePath, logout }: AccountMenuProps) {
  const { open, setOpen, containerRef, triggerRef } = useDismissible();

  return (
    <div ref={containerRef} className="relative min-w-0 max-w-56">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls="public-account-menu"
        onClick={() => setOpen((value) => !value)}
        className="flex max-w-full items-center gap-2 rounded-[0.625rem] border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
      >
        <User className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{userName}</span>
      </button>
      {open && (
        <div
          id="public-account-menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-52 rounded-xl border border-gray-100 bg-white p-2 shadow-lg"
        >
          {/* Make PublicHeader dòng 249 đến 268: mục đầu có icon `User`, đường kẻ ngang, "Đăng xuất" chữ đỏ (search UI PR-A, G5).
              Hover của Make (`text-red-600` trên `bg-red-50`) chỉ 4,36:1 nên hover đổi chữ sang `danger-strong` (5,87:1). */}
          <Link
            to={homePath}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <User className="size-4 shrink-0" aria-hidden="true" />
            Trang của tôi
          </Link>
          <hr className="my-1 border-gray-100" />
          <button
            type="button"
            disabled={logout.pending}
            onClick={logout.onLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-danger-soft hover:text-danger-strong disabled:text-gray-500"
          >
            <LogOut className="size-4 shrink-0" aria-hidden="true" />
            {logout.pending ? 'Đang đăng xuất…' : 'Đăng xuất'}
          </button>
          {logout.failed && (
            <p role="alert" className="px-3 py-2 text-sm text-danger">
              {logout.failedMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
