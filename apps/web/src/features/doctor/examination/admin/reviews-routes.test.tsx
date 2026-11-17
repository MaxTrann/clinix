import { isValidElement, type ReactElement } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminScopeGuard } from '../../../admin';
import { ROLE_HOME_PATHS } from '../../../auth';
import { ADMIN_REVIEWS_PATH, ADMIN_REVIEWS_SEGMENT } from './reviews-paths';
import { ADMIN_REVIEWS_ROUTES } from './reviews-routes';
import {
  BRANCH_ADMIN,
  setupReviewsHarness,
} from './testing/render-reviews-page';

// doctor-exam F7: WKD-01. Menu "Kiểm duyệt đánh giá" có `to`, route bọc `AdminScopeGuard`, vai trò khác bị chặn. Cấu trúc route kiểm trực tiếp; hành vi qua app thật (`createAppRoutes`). Dữ liệu giả.
const { renderPage, listCalls } = setupReviewsHarness();

const sidebar = () =>
  screen.findByRole('complementary', { name: 'Điều hướng Admin' });

describe('doctor-exam F7 — menu, route và vai trò (WKD-01)', () => {
  it('WKD-01 đường dẫn nằm dưới gốc khu Quản trị viên, đoạn đường là nhãn menu không dấu, khác mọi đường dẫn Admin đã có', () => {
    expect(ADMIN_REVIEWS_SEGMENT).toBe('kiem-duyet-danh-gia');
    expect(ADMIN_REVIEWS_PATH).toBe('/admin/kiem-duyet-danh-gia');
    // Khớp gốc khu Quản trị viên của auth: đổi `ROLE_HOME_PATHS.QuanTriVien` mà quên file này thì ca đỏ
    expect(ADMIN_REVIEWS_PATH).toBe(
      `${ROLE_HOME_PATHS.QuanTriVien}/${ADMIN_REVIEWS_SEGMENT}`,
    );
    const taken = [
      '/admin/lich-hen',
      '/admin/lich-lam-viec-bac-si',
      '/admin/duyet-yeu-cau',
      '/admin/chuyen-khoa',
      '/admin/thong-tin-phong-kham',
      '/admin/dich-vu-kham',
      '/admin/thong-tin-ca-nhan',
      ...Object.values(ROLE_HOME_PATHS),
    ];
    expect(taken).not.toContain(ADMIN_REVIEWS_PATH);
  });

  it('WKD-01 route bọc `AdminScopeGuard policy="Any"` và có đúng MỘT route con theo đoạn đường (cấu trúc)', () => {
    expect(ADMIN_REVIEWS_ROUTES).toHaveLength(1);
    const [route] = ADMIN_REVIEWS_ROUTES;
    expect(isValidElement(route.element)).toBe(true);
    const guard = route.element as ReactElement<{ policy: string }>;
    expect(guard.type).toBe(AdminScopeGuard);
    expect(guard.props.policy).toBe('Any');
    expect(route.children).toHaveLength(1);
    expect(route.children![0].path).toBe(ADMIN_REVIEWS_SEGMENT);
  });

  it('WKD-01 Toàn hệ thống: mục menu "Kiểm duyệt đánh giá" là liên kết tới đúng đường dẫn và sáng (`aria-current`) khi ở trang; trang hiện tiêu đề', async () => {
    await renderPage();
    const link = within(await sidebar()).getByRole('link', {
      name: 'Kiểm duyệt đánh giá',
    });
    expect(link).toHaveAttribute('href', ADMIN_REVIEWS_PATH);
    expect(await screen.findByRole('table')).toBeVisible();
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(
      screen.getByRole('heading', { name: 'Kiểm duyệt đánh giá' }),
    ).toBeVisible();
  });

  it('WKD-01 Admin Chi nhánh cũng vào được (chính sách `Any`) và thấy mục menu', async () => {
    await renderPage({ scope: BRANCH_ADMIN });
    expect(
      within(await sidebar()).getByRole('link', {
        name: 'Kiểm duyệt đánh giá',
      }),
    ).toHaveAttribute('href', ADMIN_REVIEWS_PATH);
    expect(await screen.findByRole('table')).toBeVisible();
  });

  it('WKD-01 mở từ trang tổng quan: bấm mục menu chuyển tới trang (không tải lại cả app)', async () => {
    const router = await renderPage({ path: ROLE_HOME_PATHS.QuanTriVien });
    const link = within(await sidebar()).getByRole('link', {
      name: 'Kiểm duyệt đánh giá',
    });
    expect(link).not.toHaveAttribute('aria-current');
    fireEvent.click(link);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(ADMIN_REVIEWS_PATH),
    );
    expect(await screen.findByRole('table')).toBeVisible();
  });

  it.each(['BenhNhan', 'BacSi', 'LeTan'])(
    'WKD-01 vai trò %s mở trang: 404, không lộ trang, không gọi API đánh giá',
    async (vaiTro) => {
      await renderPage({ vaiTro });
      expect(
        await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
      ).toBeVisible();
      expect(
        screen.queryByRole('heading', { name: 'Kiểm duyệt đánh giá' }),
      ).toBeNull();
      expect(screen.queryByRole('table')).toBeNull();
      expect(listCalls()).toHaveLength(0);
    },
  );

  it('WKD-01 khách mở trang: về /dang-nhap, không lộ trang, không gọi API đánh giá', async () => {
    const router = await renderPage({ guest: true });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dang-nhap'),
    );
    expect(
      screen.queryByRole('heading', { name: 'Kiểm duyệt đánh giá' }),
    ).toBeNull();
    expect(listCalls()).toHaveLength(0);
  });
});
