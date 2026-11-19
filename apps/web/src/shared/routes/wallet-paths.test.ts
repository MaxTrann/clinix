import { describe, expect, it } from 'vitest';
import { ROLE_HOME_PATHS } from '../../features/auth';
import { PATIENT_APPOINTMENTS_PATH } from './booking-paths';
import {
  ADMIN_DEPOSIT_POLICY_PATH,
  ADMIN_DEPOSIT_POLICY_SEGMENT,
  ADMIN_WITHDRAWALS_PATH,
  ADMIN_WITHDRAWALS_SEGMENT,
  PATIENT_WALLET_PATH,
  PATIENT_WALLET_SEGMENT,
} from './wallet-paths';

// payment F1, phần của WVI-03. Mã WP-01 là [đề xuất]: khoá đường dẫn "Ví của tôi" nằm dưới gốc khu Bệnh nhân (nếp BP-09 của booking).
describe('payment F1 — đường dẫn "Ví của tôi"', () => {
  it('WVI-03 WP-01 nằm dưới gốc khu Bệnh nhân, đoạn đường là nhãn menu không dấu, không trùng trang đã có', () => {
    expect(PATIENT_WALLET_SEGMENT).toBe('vi-cua-toi');
    expect(PATIENT_WALLET_PATH).toBe(
      `${ROLE_HOME_PATHS.BenhNhan}/${PATIENT_WALLET_SEGMENT}`,
    );
    expect(PATIENT_WALLET_PATH).not.toBe(PATIENT_APPOINTMENTS_PATH);
    for (const home of Object.values(ROLE_HOME_PATHS)) {
      expect(PATIENT_WALLET_PATH).not.toBe(home);
    }
  });
});

describe('payment F5 — đường dẫn "Đặt cọc & Hoàn tiền" của Quản trị viên', () => {
  it('WCP-05 WP-02 nằm dưới gốc khu Quản trị viên, đoạn đường là nhãn menu không dấu, khác mọi gốc khu', () => {
    expect(ADMIN_DEPOSIT_POLICY_SEGMENT).toBe('dat-coc-hoan-tien');
    expect(ADMIN_DEPOSIT_POLICY_PATH).toBe(
      `${ROLE_HOME_PATHS.QuanTriVien}/${ADMIN_DEPOSIT_POLICY_SEGMENT}`,
    );
    for (const home of Object.values(ROLE_HOME_PATHS)) {
      expect(ADMIN_DEPOSIT_POLICY_PATH).not.toBe(home);
    }
  });
});

describe('payment F7 — đường dẫn "Yêu cầu rút tiền" của Quản trị viên', () => {
  it('WQL-10 WP-03 nằm dưới gốc khu Quản trị viên, đoạn đường là nhãn menu không dấu, khác trang Đặt cọc và mọi gốc khu', () => {
    expect(ADMIN_WITHDRAWALS_SEGMENT).toBe('yeu-cau-rut-tien');
    expect(ADMIN_WITHDRAWALS_PATH).toBe(
      `${ROLE_HOME_PATHS.QuanTriVien}/${ADMIN_WITHDRAWALS_SEGMENT}`,
    );
    expect(ADMIN_WITHDRAWALS_PATH).not.toBe(ADMIN_DEPOSIT_POLICY_PATH);
    for (const home of Object.values(ROLE_HOME_PATHS)) {
      expect(ADMIN_WITHDRAWALS_PATH).not.toBe(home);
    }
  });
});
