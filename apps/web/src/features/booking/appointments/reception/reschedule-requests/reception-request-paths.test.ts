import { describe, expect, it } from 'vitest';
import { ROLE_HOME_PATHS } from '../../../../auth';
import { RECEPTION_PATHS } from '../../../../patient';
import {
  RECEPTION_APPOINTMENT_DETAIL_ROUTE,
  RECEPTION_APPOINTMENTS_PATH,
  RECEPTION_RESCHEDULE_REQUEST_DETAIL_ROUTE,
  RECEPTION_RESCHEDULE_REQUEST_DETAIL_SEGMENT,
  RECEPTION_RESCHEDULE_REQUESTS_PATH,
  RECEPTION_RESCHEDULE_REQUESTS_SEGMENT,
  receptionRescheduleRequestDetailPath,
} from '../../../../../shared/routes/booking-paths';
import { RECEPTION_NOTIFICATIONS_PATH } from '../../../../../shared/routes/notification-paths';

// reschedule F4, WXD-74 `[đề xuất]` (cùng nếp BP-11 của booking F8): đường dẫn "Yêu cầu đổi lịch" của Lễ tân nằm dưới gốc khu Lễ tân (gốc `/le-tan` viết chữ ở `booking-paths.ts` nên ca này giữ nó khớp
// `ROLE_HOME_PATHS.LeTan`), đoạn đường là nhãn menu không dấu, chi tiết dùng id trên đường dẫn (có mã hoá), khác mọi đường dẫn đã có của Lễ tân.
describe('đường dẫn "Yêu cầu đổi lịch" của Lễ tân', () => {
  it('WXD-74 nằm dưới gốc khu Lễ tân; đoạn đường là nhãn menu không dấu; mẫu tương đối khớp mẫu đầy đủ', () => {
    expect(RECEPTION_RESCHEDULE_REQUESTS_SEGMENT).toBe('yeu-cau-doi-lich');
    expect(RECEPTION_RESCHEDULE_REQUESTS_PATH).toBe(
      `${ROLE_HOME_PATHS.LeTan}/yeu-cau-doi-lich`,
    );
    expect(RECEPTION_RESCHEDULE_REQUEST_DETAIL_SEGMENT).toBe(
      'yeu-cau-doi-lich/:yeuCauId',
    );
    expect(RECEPTION_RESCHEDULE_REQUEST_DETAIL_ROUTE).toBe(
      `${ROLE_HOME_PATHS.LeTan}/${RECEPTION_RESCHEDULE_REQUEST_DETAIL_SEGMENT}`,
    );
  });

  it('WXD-74 hàm dựng đường dẫn chi tiết khớp mẫu; id BIGINT lớn hơn 2^53 giữ nguyên chuỗi', () => {
    expect(receptionRescheduleRequestDetailPath('101')).toBe(
      '/le-tan/yeu-cau-doi-lich/101',
    );
    expect(receptionRescheduleRequestDetailPath('9007199254740993')).toBe(
      '/le-tan/yeu-cau-doi-lich/9007199254740993',
    );
  });

  it('WXD-74 ca âm: id có ký tự đặc biệt được mã hoá, không thoát khỏi đoạn đường', () => {
    expect(receptionRescheduleRequestDetailPath('A/B?c#d e')).toBe(
      '/le-tan/yeu-cau-doi-lich/A%2FB%3Fc%23d%20e',
    );
  });

  it('WXD-74 khác mọi đường dẫn đã có của Lễ tân (không ghi đè trang nào, không trùng chi tiết lịch hẹn)', () => {
    const taken = [
      ...Object.values(ROLE_HOME_PATHS),
      ...Object.values(RECEPTION_PATHS),
      RECEPTION_APPOINTMENTS_PATH,
      RECEPTION_APPOINTMENT_DETAIL_ROUTE,
      RECEPTION_NOTIFICATIONS_PATH,
    ];
    expect(taken).not.toContain(RECEPTION_RESCHEDULE_REQUESTS_PATH);
    expect(taken).not.toContain(RECEPTION_RESCHEDULE_REQUEST_DETAIL_ROUTE);
    // Trang con của "Quản lý lịch hẹn" không bị bắt nhầm: hai gốc khác nhau
    expect(
      RECEPTION_RESCHEDULE_REQUESTS_PATH.startsWith(
        `${RECEPTION_APPOINTMENTS_PATH}/`,
      ),
    ).toBe(false);
  });
});
