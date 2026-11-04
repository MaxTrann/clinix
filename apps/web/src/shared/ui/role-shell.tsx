import type { LucideIcon } from 'lucide-react';
import { LogOut, Menu, X } from 'lucide-react';
import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useMediaQuery } from '../hooks/use-media-query';
import { useModalDialog } from '../hooks/use-modal-dialog';
import { LogoutAlert, RoleShellSidebar } from './role-shell-sidebar';

// Khung dùng chung của Bệnh nhân, Lễ tân (patient F1, F2) và Bác sĩ (module doctor), theo Figma `416:2`, `483:2`.
// Thuần hiển thị: không đọc phiên, không gọi API. Nơi dùng (PatientLayout…) nối `useAuth()` và `useLogout()` rồi truyền vào.
// Màn hẹp (patient F11, Q21c): dưới 1024px thanh bên thành ngăn kéo mở bằng nút "Mở menu", bố cục bám mã Make `DashboardLayout.tsx`
// (TRACKING F11-B, lệch có chủ ý ở F11-I). Thân thanh bên ở `role-shell-sidebar.tsx`.

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

// Ngưỡng của Q21c. Chỉ JS quyết định (không dùng `lg:`): một nguồn đúng cho cả trình duyệt và test (`css: false`)
const WIDE_QUERY = '(min-width: 1024px)';

export function RoleShell({
  navLabel,
  userName,
  userSubtitle,
  items,
  footerItems = [],
  logout,
  children,
}: RoleShellProps) {
  const wide = useMediaQuery(WIDE_QUERY);
  const location = useLocation();
  // Ngăn kéo mở gắn với khoá của đường dẫn lúc mở: đổi đường dẫn (chọn mục, bấm logo, Back) là tự đóng, không cần effect
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Xoá khoá ngay khi render (chỉnh state lúc render) khi chuyển sang màn rộng hoặc đường dẫn đã đổi:
  // giữ khoá cũ thì thu hẹp lại ở cùng trang, hoặc Back về đúng trang lúc mở, sẽ tự mở lại (TRACKING F11-C, F11-K mục 11)
  if (openKey !== null && (wide || openKey !== location.key)) setOpenKey(null);
  const open = !wide && openKey === location.key;
  const close = useCallback(() => setOpenKey(null), []);

  const drawerId = useId();
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  useModalDialog({
    open,
    dialogRef: drawerRef,
    initialFocusRef: closeButtonRef,
    returnFocusRef: menuButtonRef,
    onClose: close,
  });

  // Hộp lỗi đăng xuất ở thanh bên khi thanh bên nhìn thấy được; màn hẹp mà ngăn kéo đóng thì ở dải dưới thanh trên.
  // Luôn chỉ một hộp, tính khi render (TRACKING F11-E, phương án B)
  const alertInSidebar = wide || open;
  const sidebarProps = {
    userName,
    userSubtitle,
    items,
    footerItems,
    logout,
    showLogoutAlert: alertInSidebar,
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {wide ? (
        // [...]: Figma rộng 224px + viền 1px; w-56 trên gốc 15px chỉ 210px
        <aside
          aria-label={navLabel}
          className="sticky top-0 flex h-screen w-[225px] shrink-0 flex-col border-r border-gray-100 bg-white"
        >
          <RoleShellSidebar {...sidebarProps} />
        </aside>
      ) : (
        <>
          {/* Nền mờ như Make (`bg-black/50`); không nhận focus, bàn phím đóng bằng Esc hoặc "Đóng menu" */}
          {open && (
            <div
              aria-hidden="true"
              onClick={close}
              className="fixed inset-0 z-40 bg-black/50"
            />
          )}
          {/* Make: panel `w-64` (240px trên gốc 15px); [...]: 85vw để ở 320px vẫn còn nền mờ để bấm.
              Trượt vào chỉ bằng CSS (`starting:`), đóng thì tắt ngay; tắt khi người dùng giảm chuyển động */}
          <div
            ref={drawerRef}
            id={drawerId}
            role="dialog"
            aria-modal="true"
            aria-label={navLabel}
            hidden={!open}
            className="fixed inset-y-0 left-0 z-50 flex w-64 max-w-[85vw] flex-col bg-white motion-safe:transition-transform motion-safe:duration-150 motion-safe:starting:-translate-x-full"
          >
            <RoleShellSidebar
              {...sidebarProps}
              closeButton={
                // size-7 (26,25px) bằng ô logo nên khối logo giữ cao như màn rộng; vùng bấm vẫn ≥ 24px (WCAG 2.5.8)
                <button
                  ref={closeButtonRef}
                  type="button"
                  aria-label="Đóng menu"
                  onClick={close}
                  className="flex size-7 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-50"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              }
            />
          </div>
        </>
      )}

      {/* Ngăn kéo mở thì phần còn lại không nhận focus, không bấm được */}
      <div className="flex min-w-0 flex-1 flex-col" inert={open}>
        {/* Chuông và số đếm ẩn tới khi module notification có (Q21b).
            Màn hẹp: thanh trên dính đỉnh để nút "Mở menu" luôn thấy và đóng ngăn kéo không kéo trang về đầu (F11-K mục 10).
            Lớp z: thanh trên 30 < nền mờ 40 < ngăn kéo 50. Màn rộng giữ như F1, F2 */}
        <header
          className={`flex h-14 shrink-0 items-center ${wide ? 'justify-end' : 'sticky top-0 z-30 justify-between'} gap-4 border-b border-gray-100 bg-white px-4`}
        >
          {!wide && (
            // Make: `p-1.5` + biểu tượng 20 ⇒ size-8 (30px) + size-5 (18,75px) trên gốc 15px
            <button
              ref={menuButtonRef}
              type="button"
              aria-label="Mở menu"
              aria-expanded={open}
              aria-controls={drawerId}
              onClick={() => setOpenKey(location.key)}
              className="flex size-8 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-50"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
          )}
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
        {/* Dải lỗi dính ngay dưới thanh trên (`top-14` = `h-14`): đang cuộn mà bấm Đăng xuất lỗi vẫn thấy câu lỗi */}
        {logout.failed && !alertInSidebar && (
          <LogoutAlert
            logout={logout}
            className="sticky top-14 z-30 mx-4 mt-4"
          />
        )}
        {/* Make: `p-4 md:p-6`; ở đây đổi theo cùng ngưỡng 1024px */}
        <main className={`min-w-0 flex-1 ${wide ? 'p-6' : 'p-4'}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
