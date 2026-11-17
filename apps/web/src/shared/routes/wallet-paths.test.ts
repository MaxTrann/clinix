import { describe, expect, it } from 'vitest';
import { ROLE_HOME_PATHS } from '../../features/auth';
import { PATIENT_APPOINTMENTS_PATH } from './booking-paths';
import { PATIENT_WALLET_PATH, PATIENT_WALLET_SEGMENT } from './wallet-paths';

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
