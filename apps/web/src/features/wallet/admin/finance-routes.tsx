import type { RouteObject } from 'react-router';
import { ADMIN_WITHDRAWALS_SEGMENT } from '../../../shared/routes/wallet-paths';
import { AdminScopeGuard } from '../../admin';

// Route con của khung Admin (đường dẫn tương đối với `/admin`; ADR 0002: `lazy`), nếp payment F5. Bọc `AdminScopeGuard policy="ToanHeThong"` (Q10, WQL-03): Admin chi nhánh mở thẳng
// đường dẫn thì thấy trang "không có quyền"; mục menu cũng ẩn với họ (`systemOnly`). Máy chủ vẫn trả 403 nếu bị gọi thẳng (B12, QTT-06).
export const ADMIN_FINANCE_ROUTES: RouteObject[] = [
  {
    element: <AdminScopeGuard policy="ToanHeThong" />,
    children: [
      {
        path: ADMIN_WITHDRAWALS_SEGMENT,
        lazy: () =>
          import('./finance-page').then((module) => ({
            Component: module.FinancePage,
          })),
      },
    ],
  },
];
