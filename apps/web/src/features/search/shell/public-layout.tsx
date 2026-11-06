import { useEffect, useState } from 'react';
import { Outlet } from 'react-router';
import {
  LOGIN_PATH,
  LOGOUT_FAILED_MESSAGE,
  homePathFor,
  useAuth,
  useLogout,
} from '../../auth';
import { getBranchDetail, getClinicInfo } from '../api/search-service';
import type { BranchDetail, ClinicInfo } from '../api/search-types';
import { groupWeeklyHours } from '../format/weekly-hours';
import { useSelectedBranch } from '../../../shared/branch-selection';
import { BranchPicker } from './branch-picker';
import type { PublicNavConfig } from './public-nav-types';
import { PublicFooter } from './public-footer';
import { PublicHeader } from './public-header';
import { usePublicBranches } from './use-public-branches';

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
  const branchList = usePublicBranches();
  const { selection } = useSelectedBranch();
  const selectedId = selection?.chiNhanhId ?? null;
  const [detail, setDetail] = useState<BranchDetail | null>(null);

  // Lấy liên hệ chân trang một lần; lỗi/mất mạng thì chân trang giữ phần tĩnh, không báo lỗi (KC-05)
  useEffect(() => {
    const controller = new AbortController();
    getClinicInfo(controller.signal)
      .then(setClinicInfo)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  // Giờ chân trang theo chi nhánh đang chọn; "Toàn quốc" hoặc lỗi ⇒ ẩn khối giờ (Q19e). Chỉ đặt state trong callback bất đồng bộ.
  useEffect(() => {
    if (selectedId === null) return;
    const controller = new AbortController();
    getBranchDetail(selectedId, controller.signal)
      .then(setDetail)
      .catch(() => undefined);
    return () => controller.abort();
  }, [selectedId]);

  // Bỏ kết quả của chi nhánh đã chọn trước đó (chưa kịp thay)
  const hoursSource =
    selectedId !== null &&
    detail?.chiNhanhId === selectedId &&
    Array.isArray(detail.lichHoatDong)
      ? detail
      : null;

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader
        navItems={nav.navItems}
        bookingItem={nav.bookingItem}
        loginPath={LOGIN_PATH}
        branchPicker={
          <BranchPicker
            branches={branchList.branches}
            loaded={branchList.loaded}
            selectedId={selectedId}
            locating={branchList.locating}
            notice={branchList.notice}
            canLocate={branchList.canLocate}
            onSelect={branchList.select}
            onLocate={branchList.locate}
            allBranchesTo={nav.allBranchesTo}
          />
        }
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
        hours={
          hoursSource
            ? {
                branchName: hoursSource.ten,
                groups: groupWeeklyHours(hoursSource.lichHoatDong),
              }
            : null
        }
      />
    </div>
  );
}
