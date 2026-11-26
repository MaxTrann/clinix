import { describe, expect, it } from 'vitest';
import {
  ADMIN_APPOINTMENTS_PATH,
  ADMIN_RESCHEDULE_REQUEST_DETAIL_ROUTE,
  ADMIN_RESCHEDULE_REQUEST_ID_SEGMENT,
  ADMIN_RESCHEDULE_REQUESTS_PATH,
  ADMIN_RESCHEDULE_REQUESTS_SEGMENT,
  adminRescheduleRequestDetailPath,
  RECEPTION_RESCHEDULE_REQUESTS_PATH,
} from '../../../../../shared/routes/booking-paths';
import { ROLE_HOME_PATHS } from '../../../../auth';
import { ADMIN_APPROVALS_PATH, ADMIN_SCHEDULE_PATH } from '../../../../doctor';

// reschedule F5, WXD-101…WXD-103 (`[đề xuất]`): đường dẫn của tab "Yêu cầu đổi lịch" phải khớp trang host "Duyệt yêu cầu" của doctor (hai nơi khai báo riêng vì file đường dẫn không import gì và doctor không
// được import booking; WHT-10).
describe('đường dẫn yêu cầu đổi lịch của Quản trị viên', () => {
  it('WXD-101 là con trực tiếp của trang "Duyệt yêu cầu" của doctor, nằm dưới gốc khu Quản trị viên, đoạn `doi-lich`, mẫu chi tiết có `:yeuCauId`', () => {
    expect(ADMIN_RESCHEDULE_REQUESTS_SEGMENT).toBe('doi-lich');
    expect(ADMIN_RESCHEDULE_REQUESTS_PATH).toBe(
      `${ADMIN_APPROVALS_PATH}/${ADMIN_RESCHEDULE_REQUESTS_SEGMENT}`,
    );
    expect(ADMIN_RESCHEDULE_REQUESTS_PATH).toBe(
      `${ROLE_HOME_PATHS.QuanTriVien}/duyet-yeu-cau/doi-lich`,
    );
    expect(ADMIN_RESCHEDULE_REQUEST_ID_SEGMENT).toBe(':yeuCauId');
    expect(ADMIN_RESCHEDULE_REQUEST_DETAIL_ROUTE).toBe(
      '/admin/duyet-yeu-cau/doi-lich/:yeuCauId',
    );
  });

  it('WXD-102 hàm đường dẫn chi tiết giữ id BIGINT là chuỗi nguyên vẹn (lớn hơn 2^53) và mã hoá ký tự đặc biệt', () => {
    expect(adminRescheduleRequestDetailPath('9007199254740993')).toBe(
      '/admin/duyet-yeu-cau/doi-lich/9007199254740993',
    );
    // ca âm: không để ký tự đặc biệt phá đường dẫn
    expect(adminRescheduleRequestDetailPath('A/B?c#d e')).toBe(
      '/admin/duyet-yeu-cau/doi-lich/A%2FB%3Fc%23d%20e',
    );
  });

  it('WXD-103 không trùng đường dẫn nào đã có (lịch hẹn, lịch làm việc, nghỉ phép, gốc các vai, đổi lịch của Lễ tân)', () => {
    const taken: string[] = [
      ADMIN_APPOINTMENTS_PATH,
      ADMIN_SCHEDULE_PATH,
      ADMIN_APPROVALS_PATH,
      `${ADMIN_APPROVALS_PATH}/nghi-phep`,
      ...Object.values(ROLE_HOME_PATHS),
      RECEPTION_RESCHEDULE_REQUESTS_PATH,
    ];
    expect(taken).not.toContain(ADMIN_RESCHEDULE_REQUESTS_PATH);
    expect(
      ADMIN_RESCHEDULE_REQUESTS_PATH.startsWith(`${ADMIN_APPROVALS_PATH}/`),
    ).toBe(true);
  });
});
