import type { RouteObject } from 'react-router';
import {
  PATIENT_TOPUP_RESULT_SEGMENT,
  PATIENT_WALLET_SEGMENT,
} from '../../../shared/routes/wallet-paths';

// Route con của khung Bệnh nhân (đường dẫn tương đối với `/benh-nhan`; ADR 0002: `lazy`, mảng `RouteObject[]` để `router/role-routes.tsx` ghép cạnh
// `PATIENT_ROUTES`). Cổng vai trò do `RequireAuth roles={['BenhNhan']}` của `createRoleRoutes` bọc cả khối nên vai khác không vào.
// F2 (trang kết quả nạp) và F6 thêm route vào CHÍNH mảng này nên không phải chạm `router/` lần nữa.
export const PATIENT_WALLET_ROUTES: RouteObject[] = [
  {
    path: PATIENT_WALLET_SEGMENT,
    lazy: () =>
      import('./wallet-page').then((module) => ({
        Component: module.WalletPage,
      })),
  },
  // payment F2: trang kết quả nạp (cổng đưa Bệnh nhân quay về). Thành phần của `payment`, lấy QUA `features/payment/index.ts`.
  {
    path: PATIENT_TOPUP_RESULT_SEGMENT,
    lazy: () =>
      import('../../payment').then((module) => ({
        Component: module.TopupResultPage,
      })),
  },
];
