import { describe, expect, it } from 'vitest';
import {
  APPOINTMENT_STATES,
  APPOINTMENT_STATE_LABELS,
  UNKNOWN_STATE_LABEL,
  appointmentStateLabel,
  isAppointmentState,
} from './appointment-status';

// booking F1, phần nhãn của LHL-02 (PLAN booking mục 7.31 sau khi duyệt; phần chip luôn có chữ và màu thuộc giai đoạn trang). Chữ lấy từ Figma
// `411:2` và 2.4 (PLAN 4.4, Q33): `Đã tiếp đón`, `Hoàn thành`, không phải `Đã check-in`, `Đã hoàn thành` của Figma Bác sĩ.
describe('booking F1 — nhãn trạng thái lịch hẹn', () => {
  it('LHL-02 sáu trạng thái đúng thứ tự thẻ lọc và đúng chữ Figma 411:2', () => {
    expect(APPOINTMENT_STATES).toEqual([
      'ChoThanhToan',
      'DaXacNhan',
      'DaTiepDon',
      'HoanThanh',
      'DaHuy',
      'VangMat',
    ]);
    expect(APPOINTMENT_STATES.map(appointmentStateLabel)).toEqual([
      'Chờ thanh toán',
      'Đã xác nhận',
      'Đã tiếp đón',
      'Hoàn thành',
      'Đã hủy',
      'Vắng mặt',
    ]);
    expect(Object.keys(APPOINTMENT_STATE_LABELS)).toEqual([
      ...APPOINTMENT_STATES,
    ]);
  });

  it('LHL-02 mỗi trạng thái có nhãn khác nhau (không trùng chữ giữa hai thẻ lọc)', () => {
    const labels = APPOINTMENT_STATES.map(appointmentStateLabel);
    expect(new Set(labels).size).toBe(APPOINTMENT_STATES.length);
  });

  // Ca âm: mã lạ không bao giờ lộ mã thô và không ném lỗi; `DaDoiLich` (backend ẩn, L2) cũng là mã lạ ở phía Bệnh nhân
  it('LHL-02 mã lạ, `DaDoiLich`, chuỗi rỗng, sai hoa thường và tên thuộc tính của Object ⇒ "Chưa xác định"', () => {
    for (const code of [
      'DaDoiLich',
      '',
      'chothanhtoan',
      'DaXacNhan ',
      'constructor',
      'toString',
      '__proto__',
      'hasOwnProperty',
    ]) {
      expect(appointmentStateLabel(code)).toBe(UNKNOWN_STATE_LABEL);
      expect(isAppointmentState(code)).toBe(false);
    }
    expect(UNKNOWN_STATE_LABEL).toBe('Chưa xác định');
  });

  it('LHL-02 isAppointmentState nhận đúng sáu mã', () => {
    for (const code of APPOINTMENT_STATES) {
      expect(isAppointmentState(code)).toBe(true);
    }
  });
});
