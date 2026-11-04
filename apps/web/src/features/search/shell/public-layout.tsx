import { useEffect, useState } from 'react';
import { Outlet } from 'react-router';
import {
  LOGIN_PATH,
  LOGOUT_FAILED_MESSAGE,
  homePathFor,
  useAuth,
  useLogout,
} from '../../auth';
import { getClinicInfo } from '../api/search-service';
import type { ClinicInfo } from '../api/search-types';
import type { PublicNavConfig } from './public-nav-types';
import { PublicFooter } from './public-footer';
import { PublicHeader } from './public-header';

export interface PublicLayoutProps {
  // Cấu hình mục điều hướng do lớp router giữ (router/public-nav.ts): module khác chỉ đặt `to` ở đó
  nav: PublicNavConfig;
}

// Khung công khai = header + trang con + footer (PLAN search 5.7). Người đã đăng nhập vẫn xem được trang công khai (KC-03).
export function PublicLayout({ nav }: PublicLayoutProps) {
  const { user } = useAuth();
  // MỘT hook cho nút Đăng xuất trong menu tài khoản
  const { run, pending, failed } = useLogout();
  const [clinicInfo, setClinicInfo] = useState<ClinicInfo | null>(null);

  // Lấy liên hệ chân trang một lần; lỗi/mất mạng thì chân trang giữ phần tĩnh, không báo lỗi (KC-05)
  useEffect(() => {
    const controller = new AbortController();
    getClinicInfo(controller.signal)
      .then(setClinicInfo)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader
        navItems={nav.navItems}
        bookingItem={nav.bookingItem}
        loginPath={LOGIN_PATH}
        user={
          user
            ? {
                name: user.hoTen,
                homePath: homePathFor(user.vaiTro),
                logout: {
                  onLogout: () => void run(),
                  pending,
                  failed,
                  failedMessage: LOGOUT_FAILED_MESSAGE,
                },
              }
            : null
        }
      />
      <div className="flex-1">
        <Outlet />
      </div>
      <PublicFooter
        links={nav.footerLinks}
        legalLinks={nav.legalLinks}
        clinicInfo={clinicInfo}
      />
    </div>
  );
}
