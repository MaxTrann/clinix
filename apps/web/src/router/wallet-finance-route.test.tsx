import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN_WITHDRAWALS_PATH } from '../shared/routes/wallet-paths';
import {
  BRANCH_SCOPE,
  cleanUpDepositPolicy,
  renderDepositPolicy,
} from './deposit-policy-harness';

// payment F7 — màn "Quản lý tài chính ví" qua ROUTER THẬT (khung Admin, guard, menu): WQL-03, WQL-10. Tái dùng harness của payment F5 (cùng khung Admin, `/admin/me` giả; mọi API khác
// chuyển cho fake auth, nên API rút tiền ở đây trả lỗi: ca chỉ kiểm cổng và menu, phần màn hình ở `features/wallet/admin/finance-page.test.tsx`). Dữ liệu giả.
afterEach(cleanUpDepositPolicy);

const withdrawalRequests = (requests: { path: string }[]) =>
  requests.filter((r) => r.path.startsWith('/admin/wallet'));

describe('màn Quản lý tài chính ví qua router (payment F7)', () => {
  it('WQL-10 menu "Yêu cầu rút tiền" có `to` với Admin toàn hệ thống, sáng khi ở trang; trang mở đúng tiêu đề', async () => {
    renderDepositPolicy({ path: ADMIN_WITHDRAWALS_PATH });
    const nav = await screen.findByRole('navigation', {
      name: 'Điều hướng Admin',
    });
    const link = await within(nav).findByRole('link', {
      name: 'Yêu cầu rút tiền',
    });
    expect(link).toHaveAttribute('href', ADMIN_WITHDRAWALS_PATH);
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(
      await screen.findByRole('heading', { name: 'Quản lý tài chính ví' }),
    ).toBeVisible();
  });

  it('WQL-03 Admin chi nhánh: mục menu ẩn, mở thẳng đường dẫn thì thấy trang không đủ quyền và KHÔNG gọi API rút tiền (Q10)', async () => {
    const { api } = renderDepositPolicy({
      path: ADMIN_WITHDRAWALS_PATH,
      before: (fake) => {
        fake.scope = BRANCH_SCOPE;
      },
    });
    expect(
      await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' }),
    ).toBeVisible();
    const nav = screen.getByRole('navigation', { name: 'Điều hướng Admin' });
    expect(within(nav).queryByText('Yêu cầu rút tiền')).toBeNull();
    expect(
      screen.queryByRole('heading', { name: 'Quản lý tài chính ví' }),
    ).toBeNull();
    expect(withdrawalRequests(api.requests)).toEqual([]);
    const fetchCalls = (
      globalThis.fetch as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls.map((call) => String(call[0]));
    expect(
      fetchCalls.some((url) => url.includes('/admin/wallet/withdrawals')),
    ).toBe(false);
  });
});
