import type { RouteObject } from 'react-router';
import { LOGIN_PATH, REGISTER_PATH, VERIFY_EMAIL_PATH } from './roles';

// Trang thật của auth (ADR 0002). `lazy` phải trả `Component`; `index.ts` KHÔNG export các trang này, nếu không chúng lọt vào chunk chính.
export const AUTH_PAGE_ROUTES: RouteObject[] = [
  {
    path: LOGIN_PATH,
    lazy: () =>
      import('./login/login-page').then((m) => ({ Component: m.LoginPage })),
  },
  {
    path: REGISTER_PATH,
    lazy: () =>
      import('./register/register-page').then((m) => ({
        Component: m.RegisterPage,
      })),
  },
  {
    path: VERIFY_EMAIL_PATH,
    lazy: () =>
      import('./verify/verify-email-page').then((m) => ({
        Component: m.VerifyEmailPage,
      })),
  },
];
