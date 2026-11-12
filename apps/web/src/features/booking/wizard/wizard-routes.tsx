import type { RouteObject } from 'react-router';
import {
  BOOKING_CONFIRM_PATH,
  BOOKING_DONE_ROUTE,
  BOOKING_INFO_PATH,
  BOOKING_PAYMENT_ROUTE,
} from '../../../shared/routes/booking-paths';

// Route Bước 4–6 (ADR 0002: `lazy`, mảng `RouteObject[]` để `router/routes.tsx` ghép). `router/routes.tsx` đặt mảng này trong khung công khai
// và bọc `RequireAuth` chỉ vai Bệnh nhân (Q36); vai khác nhận 404, chưa đăng nhập thì chuyển tới đăng nhập kèm `from`.
export const BOOKING_WIZARD_ROUTES: RouteObject[] = [
  {
    lazy: () =>
      import('./booking-wizard-layout').then((module) => ({
        Component: module.BookingWizardLayout,
      })),
    children: [
      {
        path: BOOKING_INFO_PATH,
        lazy: () =>
          import('./pages').then((module) => ({
            Component: module.BookingInfoPage,
          })),
      },
      {
        path: BOOKING_CONFIRM_PATH,
        lazy: () =>
          import('./pages').then((module) => ({
            Component: module.BookingConfirmPage,
          })),
      },
      {
        path: BOOKING_PAYMENT_ROUTE,
        lazy: () =>
          import('./pages').then((module) => ({
            Component: module.BookingPaymentPage,
          })),
      },
      {
        path: BOOKING_DONE_ROUTE,
        lazy: () =>
          import('./pages').then((module) => ({
            Component: module.BookingDonePage,
          })),
      },
    ],
  },
];
