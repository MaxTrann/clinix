import { TRANG_THAI_LICH_HEN } from '../admin/entities/enums.js';
import {
  ACTIVE_APPOINTMENT_STATES,
  isActiveAppointmentState,
} from './active-appointment-states.js';

// Task B5 — tập trạng thái lịch hẹn "đang hoạt động" (PLAN patient Q12; TRACKING B5-B, B5-G). Mã ca RDA-nn là [đề xuất].
// Tập kỳ vọng được VIẾT TAY ở đây (không import từ chính hằng) để đột biến đổi hằng làm ca đỏ.
const ACTIVE = ['ChoThanhToan', 'DaXacNhan', 'DaTiepDon'];
const NOT_ACTIVE = ['HoanThanh', 'DaHuy', 'VangMat', 'DaDoiLich'];

describe('ACTIVE_APPOINTMENT_STATES', () => {
  it('RDA-01 (Q12, NT-11, NT-12) đúng ba trạng thái theo thứ tự, mỗi giá trị là trạng thái thật của lich_hen; bốn trạng thái còn lại (kể cả DaDoiLich) không thuộc', () => {
    expect([...ACTIVE_APPOINTMENT_STATES]).toEqual(ACTIVE);
    for (const state of ACTIVE) {
      expect(TRANG_THAI_LICH_HEN as readonly string[]).toContain(state);
    }
    // Ba cộng bốn là đủ bảy trạng thái của enum: không sót, không thừa
    expect([...ACTIVE, ...NOT_ACTIVE].sort()).toEqual(
      [...TRANG_THAI_LICH_HEN].sort(),
    );
    for (const state of NOT_ACTIVE) {
      expect(ACTIVE_APPOINTMENT_STATES as readonly string[]).not.toContain(
        state,
      );
    }
  });

  it.each(ACTIVE)('RDA-01 isActiveAppointmentState(%s) là true', (state) => {
    expect(isActiveAppointmentState(state)).toBe(true);
  });

  it.each([...NOT_ACTIVE, '', 'chothanhtoan', 'DangHoatDong'])(
    'RDA-01 isActiveAppointmentState(%j) là false',
    (state) => {
      expect(isActiveAppointmentState(state)).toBe(false);
    },
  );
});
