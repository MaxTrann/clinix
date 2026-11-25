import { describe, expect, it } from 'vitest';
import { ROLE_HOME_PATHS } from '../../features/auth';
import {
  ADMIN_NOTIFICATIONS_PATH,
  DOCTOR_NOTIFICATIONS_PATH,
  NOTIFICATIONS_SEGMENT,
  PATIENT_NOTIFICATIONS_PATH,
  RECEPTION_NOTIFICATIONS_PATH,
} from './notification-paths';

// notification F1, phần đường dẫn của WTB-05. Mã NP-01 là [đề xuất] (nếp WP-01 của payment).
describe('notification F1 — đường dẫn trang Thông báo', () => {
  it('WTB-05 NP-01 bốn đường dẫn đúng chữ của PLAN 5.10, nằm dưới gốc từng khu, khác mọi gốc khu', () => {
    expect([
      PATIENT_NOTIFICATIONS_PATH,
      RECEPTION_NOTIFICATIONS_PATH,
      DOCTOR_NOTIFICATIONS_PATH,
      ADMIN_NOTIFICATIONS_PATH,
    ]).toEqual([
      '/benh-nhan/thong-bao',
      '/le-tan/thong-bao',
      '/bac-si-portal/thong-bao',
      '/admin/thong-bao',
    ]);
    expect(PATIENT_NOTIFICATIONS_PATH).toBe(
      `${ROLE_HOME_PATHS.BenhNhan}/${NOTIFICATIONS_SEGMENT}`,
    );
    expect(RECEPTION_NOTIFICATIONS_PATH).toBe(
      `${ROLE_HOME_PATHS.LeTan}/${NOTIFICATIONS_SEGMENT}`,
    );
    expect(DOCTOR_NOTIFICATIONS_PATH).toBe(
      `${ROLE_HOME_PATHS.BacSi}/${NOTIFICATIONS_SEGMENT}`,
    );
    expect(ADMIN_NOTIFICATIONS_PATH).toBe(
      `${ROLE_HOME_PATHS.QuanTriVien}/${NOTIFICATIONS_SEGMENT}`,
    );
  });
});
