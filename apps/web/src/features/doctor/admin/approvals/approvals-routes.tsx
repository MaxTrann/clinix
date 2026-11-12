import { Navigate, type RouteObject } from 'react-router';
import { AdminScopeGuard } from '../../../admin';
import {
  ADMIN_APPROVALS_SEGMENT,
  ADMIN_LEAVE_APPROVALS_SEGMENT,
} from './approvals-paths';

// Route con của khung Admin (tương đối với `/admin`); router/role-routes.tsx ghép cạnh ADMIN_ROUTES. Bọc `AdminScopeGuard policy="Any"`:
// cả Toàn hệ thống lẫn Chi nhánh vào được (phạm vi dữ liệu do server ép). `/duyet-yeu-cau` là trang host: chuyển tới tab nghỉ phép (Q36).
export const ADMIN_APPROVALS_ROUTES: RouteObject[] = [
  {
    element: <AdminScopeGuard policy="Any" />,
    children: [
      {
        path: ADMIN_APPROVALS_SEGMENT,
        lazy: () =>
          import('./approvals-host-page').then((module) => ({
            Component: module.ApprovalsHostPage,
          })),
        children: [
          {
            index: true,
            element: <Navigate to={ADMIN_LEAVE_APPROVALS_SEGMENT} replace />,
          },
          {
            path: ADMIN_LEAVE_APPROVALS_SEGMENT,
            lazy: () =>
              import('./leave-approval-page').then((module) => ({
                Component: module.LeaveApprovalPage,
              })),
          },
        ],
      },
    ],
  },
];
