import { Test } from '@nestjs/testing';
import { AppointmentsModule } from '../appointments.module.js';
import {
  APPOINTMENT_NOTIFIER,
  NoopAppointmentNotifier,
} from './appointment-notifier.port.js';
import { DOCTOR_LEAVE_PORT, NoopDoctorLeavePort } from './doctor-leave.port.js';
import {
  NoopPaymentPort,
  NoopPaymentSummaryPort,
  PAYMENT_PORT,
  PAYMENT_SUMMARY_PORT,
} from './payment.port.js';
import {
  NoopPendingBranchChangesPort,
  PENDING_BRANCH_CHANGES_PORT,
} from './pending-branch-changes.port.js';
import { BOOKING_PORT_TOKENS } from './ports.providers.js';
import {
  NoopRefundPort,
  NoopWalletBalancePort,
  REFUND_PORT,
  WALLET_BALANCE_PORT,
} from './wallet.port.js';
import { NoopWaitlistPort, WAITLIST_PORT } from './waitlist.port.js';

// Task P2 — BPO-01 (PLAN booking 7.19; TRACKING 3.6 P2-B, P2-D): token DI và vỏ module. Nest testing, không DB.
const EXPECTED = [
  [PAYMENT_PORT, NoopPaymentPort],
  [PAYMENT_SUMMARY_PORT, NoopPaymentSummaryPort],
  [REFUND_PORT, NoopRefundPort],
  [WALLET_BALANCE_PORT, NoopWalletBalancePort],
  [WAITLIST_PORT, NoopWaitlistPort],
  [DOCTOR_LEAVE_PORT, NoopDoctorLeavePort],
  [PENDING_BRANCH_CHANGES_PORT, NoopPendingBranchChangesPort],
  [APPOINTMENT_NOTIFIER, NoopAppointmentNotifier],
] as const;

describe('BPO-01 token DI và AppointmentsModule', () => {
  it('có đúng tám token, đều là Symbol và khác nhau', () => {
    expect(BOOKING_PORT_TOKENS).toHaveLength(8);
    expect(new Set(BOOKING_PORT_TOKENS).size).toBe(8);
    expect(BOOKING_PORT_TOKENS.every((t) => typeof t === 'symbol')).toBe(true);
    expect([...BOOKING_PORT_TOKENS]).toEqual(EXPECTED.map(([token]) => token));
  });

  it('AppointmentsModule cấp đủ tám token bằng đúng bản Noop (không cần DB)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppointmentsModule],
    }).compile();
    for (const [token, noop] of EXPECTED)
      expect(moduleRef.get(token, { strict: false })).toBeInstanceOf(noop);
    await moduleRef.close();
  });

  it('overrideProvider(token).useValue(fake) thay đúng MỘT cổng; bảy cổng còn lại vẫn là Noop', async () => {
    const fake = { findBlockingLeave: () => Promise.resolve(null) };
    const moduleRef = await Test.createTestingModule({
      imports: [AppointmentsModule],
    })
      .overrideProvider(DOCTOR_LEAVE_PORT)
      .useValue(fake)
      .compile();
    for (const [token, noop] of EXPECTED) {
      const resolved = moduleRef.get(token, { strict: false });
      if (token === DOCTOR_LEAVE_PORT) expect(resolved).toBe(fake);
      else expect(resolved).toBeInstanceOf(noop);
    }
    await moduleRef.close();
  });

  it('mỗi token được cấp một thể hiện riêng (cờ cảnh báo một lần không dùng chung giữa các cổng)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppointmentsModule],
    }).compile();
    const instances = BOOKING_PORT_TOKENS.map((t) =>
      moduleRef.get(t, { strict: false }),
    );
    expect(new Set(instances).size).toBe(8);
    await moduleRef.close();
  });
});
