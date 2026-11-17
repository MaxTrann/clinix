import type { RouteObject } from 'react-router';
import { ADMIN_DEPOSIT_POLICY_SEGMENT } from '../../../shared/routes/wallet-paths';
import { AdminScopeGuard } from '../../admin';

// Route con của khung Admin (đường dẫn tương đối với `/admin`; ADR 0002: `lazy`). Bọc `AdminScopeGuard policy="ToanHeThong"` (Q10, WCP-05): Admin chi nhánh mở thẳng đường dẫn thì thấy trang
// "không có quyền" thay vì trang trống; mục menu cũng đã ẩn với họ (`systemOnly`). Cổng vai trò do `RequireAuth roles={['QuanTriVien']}` của `createRoleRoutes` bọc cả khối.
export const ADMIN_DEPOSIT_POLICY_ROUTES: RouteObject[] = [
  {
    element: <AdminScopeGuard policy="ToanHeThong" />,
    children: [
      {
        path: ADMIN_DEPOSIT_POLICY_SEGMENT,
        lazy: () =>
          import('./deposit-policy-page').then((module) => ({
            Component: module.DepositPolicyPage,
          })),
      },
    ],
  },
];
