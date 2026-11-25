import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanUpDetailPage } from '../../../testing/appointment-detail-harness';
import { fakeDay, fakeSlot } from '../../../testing/fake-reschedule-api';
import { renderReschedule } from '../../../testing/reschedule-harness';
import { RESCHEDULE_TEXT } from '../../common/reschedule-text';

// reschedule F1, mã ca WDH-08 (PLAN reschedule 7.11): bàn phím và trình đọc màn hình của trang chọn khung giờ. Chứng cứ là test (tên, vai trò, tiêu điểm, thứ tự); KHÔNG có trình đọc màn hình thật
// nên đây là chứng cứ gián tiếp (số đo trình duyệt ở TRACKING nếu được cấp lượt). Hôm nay giả là 25/11/2026 (thứ Tư). Dữ liệu giả.
const TODAY = '2026-11-25';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T03:00:00Z`));
});
afterEach(cleanUpDetailPage);

const heading = () =>
  screen.getByRole('heading', { level: 1, name: RESCHEDULE_TEXT.title });
const ready = () => screen.findByRole('button', { name: '08:00, còn trống' });

describe('tiêu điểm (WDH-08)', () => {
  it('WDH-08 vào trang ⇒ tiêu điểm ở tiêu đề h1 (tabindex -1, không rơi về body), và vẫn ở đó khi dữ liệu về', async () => {
    renderReschedule();
    expect(heading()).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(heading());
    await ready();
    expect(document.activeElement).toBe(heading());
  });

  it('WDH-08 đổi ngày ⇒ tiêu điểm Ở LẠI thẻ ngày vừa bấm khi lưới thay nội dung (không rơi về body), thẻ đổi `aria-pressed`', async () => {
    renderReschedule();
    await ready();
    const next = screen.getByRole('button', { name: 'Thứ Năm 26/11' });
    next.focus();
    fireEvent.click(next);
    await screen.findByRole('button', { name: '08:00, còn trống' });
    expect(document.activeElement).toBe(next);
    expect(next).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: 'Hôm nay, Thứ Tư 25/11' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('WDH-08 quay lại lưới từ màn xác nhận (liên kết "Chọn khung giờ khác") ⇒ tiêu điểm về tiêu đề trang chọn', async () => {
    renderReschedule();
    fireEvent.click(await ready());
    const confirmHeading = await screen.findByRole('heading', {
      level: 1,
      name: RESCHEDULE_TEXT.confirmTitle,
    });
    // vào màn xác nhận thì tiêu điểm ở tiêu đề của nó
    expect(document.activeElement).toBe(confirmHeading);
    const back = screen.getAllByRole('link', {
      name: RESCHEDULE_TEXT.pickAnother,
    });
    fireEvent.click(back[back.length - 1]);
    await ready();
    expect(document.activeElement).toBe(heading());
  });
});

describe('tên và chữ của ô (WDH-08)', () => {
  it('WDH-08 mọi ô có tên "giờ, trạng thái" và hiện chữ trạng thái (không chỉ màu); chỉ ô còn trống là nút', async () => {
    renderReschedule({
      before: (api) => {
        api.slotsFor = (bacSiId, ngay) =>
          fakeDay(bacSiId, [
            fakeSlot('1', ngay, '08:00'),
            fakeSlot('2', ngay, '08:30', 'DaDat'),
            fakeSlot('3', ngay, '09:00', 'DangGiuCho'),
            fakeSlot('4', ngay, '09:30', 'HetHan'),
          ]);
      },
    });
    await ready();
    const expected: [string, string][] = [
      ['08:00, còn trống', 'Còn trống'],
      ['08:30, đã đặt', 'Đã đặt'],
      ['09:00, đang giữ chỗ', 'Đang giữ chỗ'],
      ['09:30, hết hạn', 'Hết hạn'],
    ];
    for (const [name, label] of expected) {
      const cell = screen.getByLabelText(name);
      expect(cell.textContent).toContain(label);
      expect(cell.textContent).toContain(name.slice(0, 5));
    }
    expect(screen.getAllByRole('button', { name: /còn trống/ })).toHaveLength(
      1,
    );
    expect(screen.getAllByRole('img')).toHaveLength(3);
  });

  it('WDH-08 dòng trạng thái ẩn trực quan báo ngày đang xem và đổi khi đổi ngày', async () => {
    renderReschedule();
    await ready();
    const viewing = () =>
      screen
        .getAllByRole('status')
        .find((node) => node.textContent?.startsWith('Đang xem'));
    expect(viewing()).toHaveTextContent('Đang xem Hôm nay, Thứ Tư 25/11.');
    expect(viewing()).toHaveClass('sr-only');
    fireEvent.click(screen.getByRole('button', { name: 'Thứ Sáu 27/11' }));
    expect(viewing()).toHaveTextContent('Đang xem Thứ Sáu 27/11.');
  });
});

describe('thứ tự Tab và cấu trúc (WDH-08)', () => {
  it('WDH-08 thứ tự Tab theo thứ tự đọc: liên kết quay lại, bảy thẻ ngày, rồi ô còn trống theo giờ; không `tabindex` dương', async () => {
    renderReschedule({
      before: (api) => {
        api.slotsFor = (bacSiId, ngay) =>
          fakeDay(bacSiId, [
            fakeSlot('3', ngay, '09:00'),
            fakeSlot('1', ngay, '08:00'),
            fakeSlot('2', ngay, '08:30', 'DaDat'),
          ]);
      },
    });
    await ready();
    const tabbable = [
      ...document.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]',
      ),
    ].filter((node) => node.getAttribute('tabindex') !== '-1');
    const names = tabbable.map(
      (node) => node.getAttribute('aria-label') ?? node.textContent?.trim(),
    );
    expect(names[0]).toBe(RESCHEDULE_TEXT.backToDetail);
    expect(names.slice(1, 8)).toHaveLength(7);
    expect(names.slice(1, 8)[0]).toBe('Hôm nay, Thứ Tư 25/11');
    expect(names.slice(8)).toEqual(['08:00, còn trống', '09:00, còn trống']);
    for (const node of tabbable) {
      expect(Number(node.getAttribute('tabindex') ?? 0)).toBeLessThanOrEqual(0);
    }
  });

  it('WDH-08 cấu trúc tiêu đề: một h1, hai h2 (lịch hiện tại, chọn khung giờ mới) rồi h3 theo buổi', async () => {
    renderReschedule();
    await ready();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((node) => node.textContent),
    ).toEqual([RESCHEDULE_TEXT.currentTitle, RESCHEDULE_TEXT.pickTitle]);
    expect(
      screen
        .getAllByRole('heading', { level: 3 })
        .map((node) => node.textContent),
    ).toEqual(['Buổi sáng']);
  });
});
