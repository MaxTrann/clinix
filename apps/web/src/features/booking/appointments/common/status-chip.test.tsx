import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  APPOINTMENT_STATES,
  appointmentStateLabel,
} from './appointment-status';
import { StatusChip } from './status-chip';

// booking F1, phần chip của LHL-02 (PLAN booking mục 7.31 sau khi duyệt; ADR 0004, PLAN 4.4): chip luôn có chữ, không chỉ dựa vào màu. Tương phản chữ trên nền
// KHÔNG kiểm được ở jsdom hay happy-dom: số đo từng cặp ghi ở TRACKING booking 3.25 (F1-Q) và chú thích đầu `status-chip.tsx`.
describe('booking F1 — chip trạng thái', () => {
  it.each(APPOINTMENT_STATES)(
    'LHL-02 chip %s có chữ nhãn; chấm màu chỉ là trang trí (aria-hidden)',
    (state) => {
      const { container } = render(<StatusChip status={state} />);

      expect(
        screen.getByText(appointmentStateLabel(state)),
      ).toBeInTheDocument();
      expect(container.textContent).toBe(appointmentStateLabel(state));
      const dot = container.querySelector('span > span');
      expect(dot).toHaveAttribute('aria-hidden', 'true');
      expect(dot?.textContent).toBe('');
    },
  );

  it('LHL-02 mỗi trạng thái một kiểu màu riêng (không hai trạng thái trùng bộ màu)', () => {
    const styles = APPOINTMENT_STATES.map((state) => {
      const { container, unmount } = render(<StatusChip status={state} />);
      const className = container.firstElementChild?.className ?? '';
      unmount();
      return className;
    });
    expect(new Set(styles).size).toBe(APPOINTMENT_STATES.length);
  });

  it('LHL-02 mã lạ ⇒ chip trung tính "Chưa xác định", không lộ mã thô', () => {
    for (const code of ['DaDoiLich', 'MaLaXyz', '']) {
      const { container, unmount } = render(<StatusChip status={code} />);
      expect(container.textContent).toBe('Chưa xác định');
      if (code !== '') expect(container.textContent).not.toContain(code);
      unmount();
    }
  });
});
