import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { RoleShellLogout } from '../../../shared/ui/role-shell';
import { AccountMenu } from './account-menu';

// UIA-02 (search UI PR-A, G5): menu tên người dùng theo Make `PublicHeader.tsx` dòng 249 đến 268: mục đầu có icon `User`, đường kẻ ngang,
// "Đăng xuất" chữ đỏ. Nhãn "Trang của tôi" giữ (Q19b, Figma ghi "Trang cá nhân"). vitest chạy `css: false` nên chỉ khoá lớp; màu đo ở Chromium.

function logoutState(patch: Partial<RoleShellLogout> = {}): RoleShellLogout {
  return {
    onLogout: vi.fn(),
    pending: false,
    failed: false,
    failedMessage: 'Không đăng xuất được. Thử lại.',
    ...patch,
  };
}

function renderMenu(logout: RoleShellLogout = logoutState()) {
  render(
    <MemoryRouter>
      <AccountMenu
        userName="Nguyễn Văn A"
        homePath="/benh-nhan"
        logout={logout}
      />
    </MemoryRouter>,
  );
  return logout;
}

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: /Nguyễn Văn A/ }));
}

describe('UIA-02 menu tài khoản (G5)', () => {
  it('UIA-02 menu đóng: không có mục nào, không có đường kẻ (ca âm)', () => {
    renderMenu();
    expect(screen.queryByRole('link', { name: 'Trang của tôi' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Đăng xuất' })).toBeNull();
    expect(screen.queryByRole('separator')).toBeNull();
  });

  it('UIA-02 "Trang của tôi" có icon `User` cùng cỡ icon đăng xuất; nhãn giữ "Trang của tôi", không phải "Trang cá nhân" (Q19b)', () => {
    renderMenu();
    openMenu();
    const link = screen.getByRole('link', { name: 'Trang của tôi' });
    expect(link).toHaveAttribute('href', '/benh-nhan');
    expect(screen.queryByText('Trang cá nhân')).toBeNull();
    const userIcon = link.querySelector('svg');
    expect(userIcon).not.toBeNull();
    expect(userIcon).toHaveAttribute('aria-hidden', 'true');
    expect(userIcon).toHaveClass('size-4', 'shrink-0');
    expect(link).toHaveClass('flex', 'items-center', 'gap-2');
    const logoutIcon = screen
      .getByRole('button', { name: 'Đăng xuất' })
      .querySelector('svg');
    expect(logoutIcon).toHaveClass('size-4', 'shrink-0');
    // Hai icon cùng kiểu, nhưng KHÔNG phải cùng một hình (người, và mũi tên ra)
    expect(userIcon?.innerHTML).not.toBe(logoutIcon?.innerHTML);
  });

  it('UIA-02 có đúng MỘT đường kẻ ngang, nằm GIỮA "Trang của tôi" và "Đăng xuất"', () => {
    renderMenu();
    openMenu();
    const separator = screen.getByRole('separator');
    expect(separator.tagName).toBe('HR');
    expect(separator).toHaveClass('border-gray-100');
    const link = screen.getByRole('link', { name: 'Trang của tôi' });
    const logout = screen.getByRole('button', { name: 'Đăng xuất' });
    expect(
      link.compareDocumentPosition(separator) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      separator.compareDocumentPosition(logout) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('UIA-02 "Đăng xuất" chữ đỏ `text-danger` (4,77:1 trên trắng); hover nền đỏ nhạt + chữ `danger-strong` (5,87:1), KHÔNG `text-red-600` trên nền đỏ nhạt', () => {
    renderMenu();
    openMenu();
    const logout = screen.getByRole('button', { name: 'Đăng xuất' });
    expect(logout).toHaveClass(
      'text-danger',
      'hover:bg-danger-soft',
      'hover:text-danger-strong',
    );
    expect(logout).not.toHaveClass('text-gray-700');
    expect(logout).not.toHaveClass('text-red-600');
    expect(logout).not.toHaveClass('hover:bg-gray-50');
    // Mục "Trang của tôi" vẫn xám, không đỏ
    const link = screen.getByRole('link', { name: 'Trang của tôi' });
    expect(link).toHaveClass('text-gray-700');
    expect(link).not.toHaveClass('text-danger');
  });

  it('UIA-02 bấm "Đăng xuất" gọi onLogout một lần', () => {
    const logout = renderMenu();
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(logout.onLogout).toHaveBeenCalledTimes(1);
  });

  it('UIA-02 đang đăng xuất: nút vô hiệu, chữ "Đang đăng xuất…", chữ xám (không đỏ)', () => {
    renderMenu(logoutState({ pending: true }));
    openMenu();
    const logout = screen.getByRole('button', { name: 'Đang đăng xuất…' });
    expect(logout).toBeDisabled();
    expect(logout).toHaveClass('disabled:text-gray-500');
  });

  it('UIA-02 đăng xuất lỗi: thông báo `role="alert"` giữ nguyên chữ và màu lỗi', () => {
    renderMenu(logoutState({ failed: true }));
    openMenu();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Không đăng xuất được. Thử lại.');
    expect(alert).toHaveClass('text-danger');
  });
});
