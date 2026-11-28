import type { RouteObject } from 'react-router';
import { AdminScopeGuard } from './admin-scope-guard';
import { LoadingState } from '../../shared/ui/loading-state';
import { SpecialtyPage } from './specialties/specialty-page';

export const ADMIN_ROUTES: RouteObject[] = [
  {
    element: <AdminScopeGuard policy="Any" />,
    children: [
      // Route `index` (`/admin`, trang Tổng quan) do module dashboard làm (dashboard F1), router ghép `ADMIN_OVERVIEW_ROUTES`
      { path: 'chuyen-khoa', element: <SpecialtyPage /> },
      // admin F7: Hồ sơ bác sĩ, cả hai phạm vi (Chi nhánh chỉ thấy bác sĩ chi nhánh mình, không đổi được chi nhánh)
      {
        path: 'bac-si',
        hydrateFallbackElement: (
          <LoadingState message="Đang tải danh sách bác sĩ…" />
        ),
        lazy: () =>
          import('./doctor-profiles/doctor-profiles-page').then((module) => ({
            Component: module.DoctorProfilesPage,
          })),
      },
      {
        path: 'dich-vu-kham',
        lazy: () =>
          import('./service-catalog/service-catalog-page').then((module) => ({
            Component: module.ServiceCatalogPage,
          })),
      },
    ],
  },
  {
    element: <AdminScopeGuard policy="Any" />,
    children: [
      {
        path: 'thong-tin-phong-kham',
        hydrateFallbackElement: (
          <LoadingState message="Đang tải thông tin phòng khám…" />
        ),
        lazy: () =>
          import('./clinic-info/clinic-info-page').then((module) => ({
            Component: module.ClinicInfoPage,
          })),
      },
    ],
  },
  // admin F5: Cài đặt hệ thống, chỉ Toàn hệ thống (Admin Chi nhánh mở thẳng đường dẫn thì thấy trang "không đủ quyền")
  {
    element: <AdminScopeGuard policy="ToanHeThong" />,
    children: [
      {
        path: 'cai-dat-he-thong',
        hydrateFallbackElement: (
          <LoadingState message="Đang tải cấu hình hệ thống…" />
        ),
        lazy: () =>
          import('./system-config/system-config-page').then((module) => ({
            Component: module.SystemConfigPage,
          })),
      },
    ],
  },
  // admin F9: Tài khoản bệnh nhân, cả hai phạm vi (Admin Chi nhánh chỉ xem: không bộ lọc no-show, không nút hành động; API vẫn kiểm lại)
  {
    element: <AdminScopeGuard policy="Any" />,
    children: [
      {
        path: 'tai-khoan-benh-nhan',
        hydrateFallbackElement: (
          <LoadingState message="Đang tải danh sách bệnh nhân…" />
        ),
        lazy: () =>
          import('./patient-accounts/patient-accounts-page').then((module) => ({
            Component: module.PatientAccountsPage,
          })),
      },
    ],
  },
  // admin F8: Nhân sự (tab của "Nhân sự & Tài khoản"), cả hai phạm vi (Admin Chi nhánh chỉ thấy Bác sĩ và Lễ tân của chi nhánh mình, không thấy Quản trị viên: Q27; API vẫn kiểm lại)
  {
    element: <AdminScopeGuard policy="Any" />,
    children: [
      {
        path: 'nhan-su',
        hydrateFallbackElement: (
          <LoadingState message="Đang tải danh sách nhân sự…" />
        ),
        lazy: () =>
          import('./staff-accounts/staff-accounts-page').then((module) => ({
            Component: module.StaffAccountsPage,
          })),
      },
    ],
  },
];
