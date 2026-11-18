import type { RouteObject } from 'react-router';
import { STAFF_ACTIVATION_PATH } from './staff-activation-paths';

// Trang công khai (không cần đăng nhập, không bọc RequireAuth), nằm ngoài PublicLayout như các trang auth. `lazy` phải trả `Component`;
// `index.ts` KHÔNG export trang này, nếu không nó lọt vào chunk chính (ADR 0002).
export const STAFF_ACTIVATION_ROUTES: RouteObject[] = [
  {
    path: STAFF_ACTIVATION_PATH,
    lazy: () =>
      import('./staff-activation-page').then((m) => ({
        Component: m.StaffActivationPage,
      })),
  },
];
