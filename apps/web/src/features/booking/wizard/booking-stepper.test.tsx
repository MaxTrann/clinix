import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { BookingStepper, type StepLinks } from './booking-stepper';
import { WIZARD_STEPS, type StepNumber } from './wizard-steps';

// booking F3. Mã ca BWZ-03 là [đề xuất] (PLAN booking mục 7.27); WZ-14 (PLAN 7.15) phần thanh bước.
// Nhãn lấy NGUYÊN VĂN từ Figma `449:2`, `451:2`, `452:2`, `453:2`.
const LABELS = [
  'Nhóm dịch vụ',
  'Dịch vụ khám',
  'Bác sĩ & giờ',
  'Người khám',
  'Xác nhận',
  'Hoàn tất',
];

function renderStepper(current: StepNumber, links?: StepLinks) {
  render(
    <MemoryRouter>
      <BookingStepper current={current} links={links} />
    </MemoryRouter>,
  );
  return screen.getByRole('navigation', { name: 'Các bước đặt lịch' });
}

describe('booking F3 — thanh bước', () => {
  it('BWZ-03 đúng sáu nhãn Figma theo thứ tự, đánh số 1 đến 6', () => {
    expect(WIZARD_STEPS.map((step) => step.label)).toEqual(LABELS);
    expect(WIZARD_STEPS.map((step) => step.number)).toEqual([1, 2, 3, 4, 5, 6]);

    const nav = renderStepper(4);
    const items = within(nav).getAllByRole('listitem');
    expect(items).toHaveLength(6);
    items.forEach((item, index) => {
      expect(within(item).getByText(LABELS[index])).toBeInTheDocument();
    });
  });

  it('BWZ-03 mỗi bước từ 1 đến 6: đúng MỘT mục aria-current="step", các bước trước là "đã hoàn thành", sau là "chưa thực hiện"', () => {
    for (const current of [1, 2, 3, 4, 5, 6] as StepNumber[]) {
      const nav = renderStepper(current);
      const items = within(nav).getAllByRole('listitem');
      const active = items.filter(
        (item) => item.getAttribute('aria-current') === 'step',
      );
      expect(active).toHaveLength(1);
      expect(active[0]).toBe(items[current - 1]);
      items.forEach((item, index) => {
        const text = item.textContent ?? '';
        if (index < current - 1) expect(text).toContain('đã hoàn thành');
        else if (index === current - 1)
          expect(text).toContain('đang thực hiện');
        else expect(text).toContain('chưa thực hiện');
      });
      cleanup();
    }
  });

  it('BWZ-03 bước đã qua có liên kết khi có `links` (tên "Quay lại bước N: nhãn"); bước hiện tại và chưa tới không bao giờ là liên kết', () => {
    const nav = renderStepper(5, {
      1: '/dat-lich',
      4: '/dat-lich/thong-tin',
      5: '/x',
      6: '/y',
    });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
      'Quay lại bước 1: Nhóm dịch vụ',
      'Quay lại bước 4: Người khám',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/dat-lich',
      '/dat-lich/thong-tin',
    ]);
  });

  it('BWZ-03 bước đã qua mà không có đường dẫn: vẫn "đã hoàn thành" nhưng không bấm được; Bước 6 không có liên kết nào', () => {
    let nav = renderStepper(4, { 1: '/dat-lich' });
    expect(within(nav).getAllByRole('link')).toHaveLength(1);
    const items = within(nav).getAllByRole('listitem');
    expect(items[1].textContent).toContain('đã hoàn thành');
    expect(within(items[1]).queryByRole('link')).toBeNull();
    cleanup();

    nav = renderStepper(6);
    expect(within(nav).queryAllByRole('link')).toHaveLength(0);
    expect(within(nav).getAllByRole('listitem')[5]).toHaveAttribute(
      'aria-current',
      'step',
    );
  });

  // WZ-14 (phần thanh bước): thứ tự Tab theo thứ tự DOM; mục không bấm được không nhận focus; nhãn đọc được cho trình đọc màn hình.
  // Phần còn lại của WZ-14: `aria-live` theo mốc là của đếm ngược (F6); máy đọc màn hình thật là kiểm tay (M).
  it('WZ-14 thứ tự Tab là thứ tự các bước; mục không bấm được không có tabindex; nhãn có chữ cho trình đọc màn hình', () => {
    const nav = renderStepper(5, { 1: '/dat-lich', 4: '/dat-lich/thong-tin' });
    const focusable = Array.from(
      nav.querySelectorAll<HTMLElement>('a[href], button, [tabindex]'),
    );
    expect(focusable.map((el) => el.getAttribute('aria-label'))).toEqual([
      'Quay lại bước 1: Nhóm dịch vụ',
      'Quay lại bước 4: Người khám',
    ]);
    expect(nav.querySelector('[tabindex]')).toBeNull();

    const items = within(nav).getAllByRole('listitem');
    // Chữ cho trình đọc màn hình: số bước, nhãn, trạng thái; số và dấu tích trang trí bị ẩn
    expect(items[4].textContent).toContain('Bước 5: ');
    expect(items[4].textContent).toContain('Xác nhận');
    expect(items[4].textContent).toContain('đang thực hiện');
    expect(items[0].querySelector('[aria-hidden="true"]')).not.toBeNull();
    // Điều hướng có tên để người dùng trình đọc màn hình nhảy tới được
    expect(screen.getByRole('navigation', { name: 'Các bước đặt lịch' })).toBe(
      nav,
    );
  });
});
