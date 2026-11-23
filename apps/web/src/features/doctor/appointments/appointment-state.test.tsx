import { render } from '@testing-library/react';
import {
  APPOINTMENT_STATE_LABELS as BOOKING_LABELS,
  APPOINTMENT_STATES as BOOKING_STATES,
  UNKNOWN_STATE_LABEL as BOOKING_UNKNOWN,
} from '../../booking/appointments/common/appointment-status';
import { StatusChip as BookingChip } from '../../booking/appointments/common/status-chip';
import {
  APPOINTMENT_STATE_LABELS,
  APPOINTMENT_STATES,
  stateLabel,
  UNKNOWN_STATE_LABEL,
} from './appointment-state';
import { AppointmentStateChip } from './state-chip';

// doctor UX6, DUX6-18 và DUX6-19 [đề xuất]: bảng nhãn và màu sáu trạng thái lịch hẹn ở doctor là BẢN CHÉP của booking (WHT-10 cấm import `features/booking`
// ở mã chạy). Test hợp đồng này (import booking, chỉ ở file test) làm hai bản không thể lệch nhau mà không ai biết. RỦI RO: test phụ thuộc tên file và export
// nội bộ của booking, xem TRACKING 9A.18 mục 1.5.

describe('nhãn trạng thái lịch hẹn: bản của doctor bằng bản của booking', () => {
  it('DUX6-18 cùng sáu trạng thái, cùng nhãn, cùng nhãn cho mã lạ', () => {
    expect([...APPOINTMENT_STATES]).toEqual([...BOOKING_STATES]);
    expect(APPOINTMENT_STATE_LABELS).toEqual(BOOKING_LABELS);
    expect(UNKNOWN_STATE_LABEL).toBe(BOOKING_UNKNOWN);
    expect(stateLabel('DaDoiLich')).toBe(BOOKING_UNKNOWN);
    expect(stateLabel('HoanThanh')).toBe('Hoàn thành');
  });
});

describe('chip trạng thái: bản của doctor có đúng lớp màu của booking', () => {
  it('DUX6-19 với từng trạng thái và mã lạ: cùng className và cùng chữ (luôn có chữ, không chỉ màu)', () => {
    for (const status of [...BOOKING_STATES, 'DaDoiLich', 'MaLa']) {
      const theirs = render(<BookingChip status={status} />);
      const theirChip = theirs.container.firstElementChild as HTMLElement;
      const mine = render(<AppointmentStateChip status={status} />);
      const myChip = mine.container.firstElementChild as HTMLElement;
      expect(myChip.className).toBe(theirChip.className);
      expect(myChip.textContent).toBe(theirChip.textContent);
      expect(myChip.textContent).not.toBe('');
      theirs.unmount();
      mine.unmount();
    }
  });
});
