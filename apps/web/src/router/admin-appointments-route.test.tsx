import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ADMIN_CODE,
  BRANCH_SCOPE,
  cleanUpAdminAppointments,
  renderAdminAppointments,
} from './admin-appointments-harness';
import { ADMIN_APPOINTMENTS_PATH } from '../shared/routes/booking-paths';

// booking F10 `[ĐỤNG router]` `[ĐỤNG admin]`: trang "Lịch hẹn" của Quản trị viên ghép vào khung Admin của router thật (AQR-01…AQR-05; đúng/sai vai trò theo AGENTS mục 4). Mã AQR là [đề xuất] (PLAN booking
// mục 7.41). API giả CHỈ cho các đường dẫn Admin và route công khai; mọi đường dẫn khác chuyển cho fake auth.
afterEach(cleanUpAdminAppointments);

const sidebarLink = () =>
  within(
    screen.getByRole('navigation', { name: 'Điều hướng Admin' }),
  ).getByRole('link', { name: 'Lịch hẹn' });

const adminCalls = () =>
  vi
    .mocked(fetch)
    .mock.calls.map(([input]) => String(input))
    .filter((url) => url.includes('/admin/appointments'));

describe('route "Lịch hẹn" của Quản trị viên', () => {
  it('AQR-01 Quản trị viên TOÀN HỆ THỐNG mở /admin/lich-hen: trang trong khung Admin, mục menu `Lịch hẹn` là liên kết sáng đúng `href` (khớp hằng ở shared/), bảng có dữ liệu', async () => {
    const { router } = renderAdminAppointments(ADMIN_APPOINTMENTS_PATH);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Lịch hẹn' }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/admin/lich-hen');
    const link = sidebarLink();
    // Hai nơi ghi đường dẫn (sidebar bằng chữ, shared/ bằng hằng) phải khớp nhau
    expect(link).toHaveAttribute('href', ADMIN_APPOINTMENTS_PATH);
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByText(ADMIN_CODE)).toBeInTheDocument();
  });

  it('AQR-02 Quản trị viên CHI NHÁNH cũng vào được: thấy trang trong khung Admin và ô `Chi nhánh` là chữ cố định', async () => {
    renderAdminAppointments(ADMIN_APPOINTMENTS_PATH, { scope: BRANCH_SCOPE });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Lịch hẹn' }),
    ).toBeVisible();
    expect(sidebarLink()).toHaveAttribute('aria-current', 'page');
    expect(screen.getByLabelText('Chi nhánh')).toHaveValue(
      'CLINIX Chi nhánh Quận 3',
    );
  });

  it.each(['BenhNhan', 'BacSi', 'LeTan'] as const)(
    'AQR-03 %s mở /admin/lich-hen: 404, không thấy trang lẫn khung Admin, không gọi route của Quản trị viên',
    async (vaiTro) => {
      renderAdminAppointments(ADMIN_APPOINTMENTS_PATH, { vaiTro });
      expect(
        await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
      ).toBeVisible();
      expect(
        screen.queryByRole('heading', { level: 1, name: 'Lịch hẹn' }),
      ).toBeNull();
      expect(
        screen.queryByRole('navigation', { name: 'Điều hướng Admin' }),
      ).toBeNull();
      expect(adminCalls()).toEqual([]);
    },
  );

  it.each(['BenhNhan', 'BacSi', 'LeTan'] as const)(
    'AQR-03 %s mở trang chi tiết /admin/lich-hen/:ma: 404 và không gọi route của Quản trị viên',
    async (vaiTro) => {
      renderAdminAppointments(`/admin/lich-hen/${ADMIN_CODE}`, { vaiTro });
      expect(
        await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
      ).toBeVisible();
      expect(adminCalls()).toEqual([]);
    },
  );

  it('AQR-04 khách mở đường dẫn: về /dang-nhap, không lộ trang', async () => {
    const { router } = renderAdminAppointments(ADMIN_APPOINTMENTS_PATH, {
      vaiTro: null,
    });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dang-nhap'),
    );
    expect(
      screen.queryByRole('heading', { level: 1, name: 'Lịch hẹn' }),
    ).toBeNull();
    expect(adminCalls()).toEqual([]);
  });

  it('AQR-05 mở thẳng trang chi tiết /admin/lich-hen/:ma: trang chi tiết trong khung Admin, mục menu `Lịch hẹn` vẫn sáng (mục cha)', async () => {
    const { router } = renderAdminAppointments(`/admin/lich-hen/${ADMIN_CODE}`);
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Chi tiết lịch hẹn',
      }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe(
      `/admin/lich-hen/${ADMIN_CODE}`,
    );
    expect(sidebarLink()).toHaveAttribute('aria-current', 'page');
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Thông tin lịch hẹn',
      }),
    ).toBeVisible();
  });
});
