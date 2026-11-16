import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { ROLE_HOME_PATHS, type AuthUser, type VaiTro } from '../../../auth';
import { resetAuthForTest } from '../../../auth/auth-session';
import { setAuthState } from '../../../auth/auth-store';
import { createAppRoutes } from '../../../../router/routes';
import { createFakeAuthApi } from '../../../../test/fake-auth-api';
import {
  PATIENT_EXAM_RECORDS_PATH,
  PATIENT_EXAM_RECORDS_SEGMENT,
} from './patient-exam-paths';
import { createFakePatientExamApi } from './testing/fake-patient-exam-api';
import { figmaData, useFixedClock } from './testing/render-exam-page';

// doctor-exam F5, WXH-01 (phần route): trang "Hồ sơ khám bệnh" được ghép vào router thật ở khối Bệnh nhân. Mục menu có `to`, sáng ở route (kể cả khi mở thẳng `?ca=`), đường dẫn khớp gốc khu Bệnh nhân; Bệnh nhân mở được trang THẬT;
// vai trò khác và khách không vào (cổng `RequireAuth` của `createRoleRoutes`). PL-01 (số mục vô hiệu) ở `router/role-routes.test.tsx`.
let auth: ReturnType<typeof createFakeAuthApi>;
let exam: ReturnType<typeof createFakePatientExamApi>;

function signedInAs(vaiTro: VaiTro) {
  const user: AuthUser = {
    vaiTro,
    hoTen: `Họ tên ${vaiTro}`,
    daXacMinhEmail: true,
  };
  setAuthState({ status: 'authenticated', user });
}

function renderAt(path: string, routes: RouteObject[] = createAppRoutes()) {
  const router = createMemoryRouter(routes, {
    initialEntries: ['/', path],
    initialIndex: 1,
  });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  useFixedClock();
  resetAuthForTest();
  auth = createFakeAuthApi();
  exam = createFakePatientExamApi(figmaData());
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes('/patient/exam-records')
        ? exam.fetch(input, init)
        : auth.fetch(input, init),
    ),
  );
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const sidebar = () =>
  screen.findByRole('complementary', { name: 'Điều hướng Bệnh nhân' });

describe('doctor-exam F5 — route và menu "Hồ sơ khám bệnh" ở khung Bệnh nhân', () => {
  it('WXH-01 đường dẫn của trang khớp gốc khu Bệnh nhân (`ROLE_HOME_PATHS.BenhNhan`)', () => {
    expect(PATIENT_EXAM_RECORDS_SEGMENT).toBe('ho-so-kham-benh');
    expect(PATIENT_EXAM_RECORDS_PATH).toBe(
      `${ROLE_HOME_PATHS.BenhNhan}/ho-so-kham-benh`,
    );
    expect(PATIENT_EXAM_RECORDS_PATH).toBe('/benh-nhan/ho-so-kham-benh');
  });

  it('WXH-01 Bệnh nhân mở route: trang THẬT (tiêu đề, lưới, danh sách tháng); mục menu "Hồ sơ khám bệnh" có `href` đúng và sáng (`aria-current="page"`), mục khác không sáng', async () => {
    signedInAs('BenhNhan');
    const router = renderAt(PATIENT_EXAM_RECORDS_PATH);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hồ sơ khám bệnh' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('region', { name: 'Tháng 10 2026' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(PATIENT_EXAM_RECORDS_PATH);

    const menu = within(await sidebar()).getByRole('navigation', {
      name: 'Menu chính',
    });
    const link = within(menu).getByRole('link', { name: 'Hồ sơ khám bệnh' });
    expect(link).toHaveAttribute('href', PATIENT_EXAM_RECORDS_PATH);
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(
      within(menu).getByRole('link', { name: 'Hồ sơ người khám' }),
    ).not.toHaveAttribute('aria-current');
    expect(
      within(menu).getByRole('link', { name: 'Lịch hẹn của tôi' }),
    ).not.toHaveAttribute('aria-current');
  });

  it('WXH-01 mở thẳng `?ca=<mã>`: mục menu vẫn sáng và chi tiết ca tải ngay', async () => {
    signedInAs('BenhNhan');
    renderAt(`${PATIENT_EXAM_RECORDS_PATH}?ca=CLX-A2`);
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Tiêu hóa' }),
    ).toBeInTheDocument();
    const menu = within(await sidebar()).getByRole('navigation', {
      name: 'Menu chính',
    });
    expect(
      within(menu).getByRole('link', { name: 'Hồ sơ khám bệnh' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(exam.detailCalls()).toHaveLength(1);
  });

  it.each(['LeTan', 'BacSi', 'QuanTriVien'] as const)(
    'WXH-01 %s mở route của Bệnh nhân: 404, không thấy khung Bệnh nhân, không lời gọi API hồ sơ khám',
    async (vaiTro) => {
      signedInAs(vaiTro);
      renderAt(PATIENT_EXAM_RECORDS_PATH);
      expect(
        await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('complementary', { name: 'Điều hướng Bệnh nhân' }),
      ).toBeNull();
      expect(
        screen.queryByRole('heading', { name: 'Hồ sơ khám bệnh' }),
      ).toBeNull();
      expect(exam.calls).toHaveLength(0);
    },
  );

  it('WXH-01 khách mở route: về /dang-nhap bằng replace, không lộ khung, không lời gọi API hồ sơ khám', async () => {
    setAuthState({ status: 'unauthenticated' });
    const router = renderAt(PATIENT_EXAM_RECORDS_PATH);
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/dang-nhap'),
    );
    expect(router.state.historyAction).toBe('REPLACE');
    expect(
      screen.queryByRole('complementary', { name: 'Điều hướng Bệnh nhân' }),
    ).toBeNull();
    expect(exam.calls).toHaveLength(0);
  });
});
