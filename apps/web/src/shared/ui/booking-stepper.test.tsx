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

// search UI PR-B, câu (c) = B (Đại, 17/11/2026): hình học theo Figma `444:67` và `446:67`. Mã UIB-09 là [đề xuất].
// `css: false` nên chỉ khoá TÊN LỚP phần có ý nghĩa; kích thước thật (đường nối, khoảng hở 9,375 px) chỉ Chromium thấy.
describe('search UI PR-B — hình học thanh bước theo Figma (UIB-09)', () => {
  const FIGMA_LINKS: StepLinks = { 1: '/a', 2: '/b' };
  // Vành 4 px của vòng đang chọn là bóng trang trí (Figma `shadow-[0px_0px_0px_4px_#cefafe]`), không phải `ring-*` (FG-05 cấm)
  const HALO = 'shadow-[0_0_0_4px_var(--color-cyan-100)]';

  function circleOf(item: HTMLElement): HTMLElement {
    return item.querySelector('span[aria-hidden="true"]') as HTMLElement;
  }

  it('UIB-09 năm mục đầu chia đều flex-[147_0_0]; mục cuối rộng 75 px, không co; ô vòng và nhãn rộng 75 px', () => {
    const nav = renderStepper(3, FIGMA_LINKS);
    const items = within(nav).getAllByRole('listitem');
    items.slice(0, 5).forEach((item) => {
      expect(item).toHaveClass('flex-[147_0_0]');
      expect(item).toHaveClass('min-w-px');
    });
    expect(items[5]).toHaveClass('w-[75px]');
    expect(items[5]).toHaveClass('shrink-0');
    expect(items[5]).not.toHaveClass('flex-[147_0_0]');
    items.forEach((item) => {
      expect(item.firstElementChild).toHaveClass('w-[75px]');
    });
  });

  it('UIB-09 vòng 33,75 px (size-9) số đậm; đang chọn: viền 1,6 px, vành 4 px (bóng cyan-100), nền trắng; đã qua và chưa tới không có vành', () => {
    const nav = renderStepper(3, FIGMA_LINKS);
    const circles = within(nav).getAllByRole('listitem').map(circleOf);
    circles.forEach((circle) => {
      expect(circle).toHaveClass('size-9');
      // Vòng nằm TRÊN đường nối: ở màn hẹp (375 px) đường nối đè vòng vài px nếu thiếu `relative z-10` (Chromium thấy, test không thấy)
      expect(circle).toHaveClass('relative');
      expect(circle).toHaveClass('z-10');
      expect(circle).toHaveClass('rounded-full');
      expect(circle).toHaveClass('font-semibold');
    });
    expect(circles[2]).toHaveClass('border-[1.6px]');
    expect(circles[2]).toHaveClass('bg-white');
    expect(circles[2]).toHaveClass(HALO);
    [0, 1, 3, 4, 5].forEach((index) => {
      expect(circles[index]).not.toHaveClass(HALO);
      expect(circles[index]).not.toHaveClass('border-[1.6px]');
    });
    expect(circles[0]).toHaveClass('bg-brand-strong');
    expect(circles[3]).toHaveClass('bg-gray-100');
  });

  it('UIB-09 nhãn 13 px dòng 16,25, rộng bằng ô; đang chọn đậm cyan-800, đã qua thường brand-strong, chưa tới thường gray-600', () => {
    const nav = renderStepper(3, FIGMA_LINKS);
    const items = within(nav).getAllByRole('listitem');
    const labels = items.map((item, index) =>
      within(item).getByText(LABELS[index]),
    );
    labels.forEach((label) => {
      expect(label).toHaveClass('text-[13px]');
      expect(label).toHaveClass('leading-[16.25px]');
      expect(label).toHaveClass('w-full');
      expect(label).toHaveClass('text-center');
      expect(label).toHaveClass('mt-2');
    });
    expect(labels[2]).toHaveClass('font-semibold');
    expect(labels[2]).toHaveClass('text-cyan-800');
    [0, 1].forEach((index) => {
      expect(labels[index]).toHaveClass('text-brand-strong');
      expect(labels[index]).not.toHaveClass('font-semibold');
    });
    [3, 4, 5].forEach((index) => {
      expect(labels[index]).toHaveClass('text-gray-600');
      expect(labels[index]).not.toHaveClass('font-semibold');
    });
  });

  it('UIB-09 đường nối chỉ giữa hai bước: đậm (brand) khi bước trước đã qua, xám khi chưa; mục cuối không có; không phải mục danh sách', () => {
    const nav = renderStepper(3, FIGMA_LINKS);
    const items = within(nav).getAllByRole('listitem');
    expect(items).toHaveLength(6);
    expect(items[5].children).toHaveLength(1);
    items.slice(0, 5).forEach((item, index) => {
      expect(item.children).toHaveLength(2);
      const connector = item.children[1] as HTMLElement;
      expect(connector).toHaveAttribute('aria-hidden', 'true');
      const line = connector.firstElementChild as HTMLElement;
      if (index + 1 < 3) {
        expect(line).toHaveClass('bg-brand');
        expect(line).not.toHaveClass('bg-gray-200');
      } else {
        expect(line).toHaveClass('bg-gray-200');
        expect(line).not.toHaveClass('bg-brand');
      }
    });
  });
});
