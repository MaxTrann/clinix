import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BRANCH_SCOPE,
  cleanUpAdminRequests,
  CODE_A,
  renderAdminRequests,
  tabsNav,
} from '../../../../../router/admin-reschedule-requests-harness';
import {
  ADMIN_RESCHEDULE_REQUESTS_PATH,
  adminRescheduleRequestDetailPath,
} from '../../../../../shared/routes/booking-paths';
import { loaded } from '../../../testing/reschedule-requests-harness';
import { REQUEST_TEXT } from '../../common/reschedule-requests/request-text';

// reschedule F5 `[ĐỤNG router]` `[ĐỤNG doctor]`: tab "Yêu cầu đổi lịch" của trang "Duyệt yêu cầu" ghép vào khung Admin của router thật (WXD-11, WXD-12 theo PLAN reschedule 7.11; WXD-129…WXD-131 `[đề xuất]`;
// đúng và sai vai trò theo AGENTS mục 4). API giả cho đường dẫn Admin và route công khai; mọi đường dẫn khác chuyển cho fake auth.
afterEach(cleanUpAdminRequests);

const LEAVE_PATH = '/admin/duyet-yeu-cau/nghi-phep';

const rescheduleTab = () =>
  within(tabsNav()).getByRole('link', { name: 'Yêu cầu đổi lịch' });
const leaveTab = () =>
  within(tabsNav()).getByRole('link', { name: 'Yêu cầu nghỉ phép' });
const menuLink = () =>
  within(
    screen.getByRole('navigation', { name: 'Điều hướng Admin' }),
  ).getByRole('link', { name: 'Duyệt yêu cầu' });

const requestUrls = () =>
  vi
    .mocked(fetch)
    .mock.calls.map(([input]) => String(input))
    .filter((url) => url.includes('/admin/reschedule-requests'));

describe('route "Yêu cầu đổi lịch" trong "Duyệt yêu cầu"', () => {
  it('WXD-11 ở khung thật, tab "Yêu cầu đổi lịch" là liên kết đúng `href`, không còn vô hiệu hay chữ "chưa được triển khai"', async () => {
    renderAdminRequests('/admin/duyet-yeu-cau');
    await screen.findByRole('navigation', { name: 'Loại yêu cầu' });
    expect(rescheduleTab()).toHaveAttribute(
      'href',
      ADMIN_RESCHEDULE_REQUESTS_PATH,
    );
    expect(rescheduleTab()).not.toHaveAttribute('aria-disabled');
    expect(
      within(tabsNav()).queryByText(/chưa được triển khai/),
    ).not.toBeInTheDocument();
    expect(within(tabsNav()).queryByRole('button')).not.toBeInTheDocument();
  });

  it('WXD-12 `/admin/duyet-yeu-cau` vẫn về tab nghỉ phép; bấm tab đổi lịch mở danh sách trong khung host (h1 host, tab đổi lịch sáng, mục menu "Duyệt yêu cầu" sáng); bấm tab nghỉ phép quay lại', async () => {
    const { router } = renderAdminRequests('/admin/duyet-yeu-cau');
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(LEAVE_PATH),
    );
    await screen.findByRole('navigation', { name: 'Loại yêu cầu' });
    expect(leaveTab()).toHaveAttribute('aria-current', 'page');
    expect(rescheduleTab()).not.toHaveAttribute('aria-current');

    fireEvent.click(rescheduleTab());
    await loaded();
    expect(router.state.location.pathname).toBe(ADMIN_RESCHEDULE_REQUESTS_PATH);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Duyệt yêu cầu' }),
    ).toBeVisible();
    expect(screen.getByText(CODE_A)).toBeInTheDocument();
    expect(rescheduleTab()).toHaveAttribute('aria-current', 'page');
    expect(leaveTab()).not.toHaveAttribute('aria-current');
    expect(menuLink()).toHaveAttribute('href', '/admin/duyet-yeu-cau');
    expect(menuLink()).toHaveAttribute('aria-current', 'page');

    fireEvent.click(leaveTab());
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(LEAVE_PATH),
    );
    expect(leaveTab()).toHaveAttribute('aria-current', 'page');
    expect(rescheduleTab()).not.toHaveAttribute('aria-current');
  });

  it.each([
    ['Toàn hệ thống', undefined],
    ['Chi nhánh', BRANCH_SCOPE],
  ])(
    'WXD-129 Quản trị viên %s mở thẳng đường dẫn đổi lịch (như tải lại trang): trang trong khung Admin',
    async (_name, scope) => {
      const { router } = renderAdminRequests(ADMIN_RESCHEDULE_REQUESTS_PATH, {
        scope,
      });
      await loaded();
      expect(router.state.location.pathname).toBe(
        ADMIN_RESCHEDULE_REQUESTS_PATH,
      );
      expect(rescheduleTab()).toHaveAttribute('aria-current', 'page');
      expect(menuLink()).toHaveAttribute('aria-current', 'page');
    },
  );

  it.each(
    (['BenhNhan', 'BacSi', 'LeTan'] as const).flatMap((vaiTro) => [
      [vaiTro, ADMIN_RESCHEDULE_REQUESTS_PATH] as const,
      [vaiTro, adminRescheduleRequestDetailPath('101')] as const,
    ]),
  )(
    'WXD-129 %s mở %s: 404, không thấy trang lẫn khung Admin, KHÔNG gọi route yêu cầu đổi lịch của Quản trị viên',
    async (vaiTro, path) => {
      renderAdminRequests(path, { vaiTro });
      expect(
        await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
      ).toBeVisible();
      expect(
        screen.queryByRole('navigation', { name: 'Loại yêu cầu' }),
      ).not.toBeInTheDocument();
      expect(requestUrls()).toEqual([]);
    },
  );

  it('WXD-129 chưa đăng nhập: về /dang-nhap, không lộ trang, không gọi route của Quản trị viên', async () => {
    const { router } = renderAdminRequests(ADMIN_RESCHEDULE_REQUESTS_PATH, {
      vaiTro: null,
    });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dang-nhap'),
    );
    expect(
      screen.queryByRole('navigation', { name: 'Loại yêu cầu' }),
    ).not.toBeInTheDocument();
    expect(requestUrls()).toEqual([]);
  });

  it('WXD-130 menu Admin không thêm mục: chỉ một liên kết "Duyệt yêu cầu" trỏ trang host, không có mục "Yêu cầu đổi lịch"', async () => {
    renderAdminRequests();
    await loaded();
    const menu = screen.getByRole('navigation', { name: 'Điều hướng Admin' });
    expect(
      within(menu).getAllByRole('link', { name: 'Duyệt yêu cầu' }),
    ).toHaveLength(1);
    expect(
      within(menu).queryByRole('link', { name: 'Yêu cầu đổi lịch' }),
    ).not.toBeInTheDocument();
  });

  it('WXD-131 trang chi tiết vẫn trong khung host: tab đổi lịch và mục menu còn sáng', async () => {
    const { router } = renderAdminRequests(
      adminRescheduleRequestDetailPath('101'),
    );
    await screen.findByRole('region', { name: REQUEST_TEXT.summary });
    expect(router.state.location.pathname).toBe(
      `${ADMIN_RESCHEDULE_REQUESTS_PATH}/101`,
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Duyệt yêu cầu' }),
    ).toBeVisible();
    expect(rescheduleTab()).toHaveAttribute('aria-current', 'page');
    expect(leaveTab()).not.toHaveAttribute('aria-current');
    expect(menuLink()).toHaveAttribute('aria-current', 'page');
  });
});
