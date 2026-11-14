import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
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
import { BookingNotifier } from '../notifications/booking-notifier.js';
import { LeaveReader } from '../../scheduling/leave/leave.reader.js';
import {
  BOOKING_PORT_PROVIDERS,
  BOOKING_PORT_TOKENS,
} from './ports.providers.js';
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

// B15 (TRACKING 3.37 B15-J): trong `AppointmentsModule` cổng thông báo là BẢN THẬT (`BookingNotifier`). B16a (TRACKING 3.39 B16a-C): cổng nghỉ phép cũng là BẢN THẬT (`LeaveReader` của `SchedulingModule`, `useExisting`), sáu cổng
// còn lại vẫn là `Noop`. Mảng `BOOKING_PORT_PROVIDERS` và lớp `Noop` giữ nguyên (test dựng riêng dùng chúng).
const REAL_IN_MODULE = new Map<symbol, new (...args: never[]) => unknown>([
  [APPOINTMENT_NOTIFIER, BookingNotifier],
  [DOCTOR_LEAVE_PORT, LeaveReader],
]);
const EXPECTED_IN_MODULE = EXPECTED.map(([token, noop]) => {
  const real = REAL_IN_MODULE.get(token);
  return real === undefined
    ? ([token, noop] as const)
    : ([token, real] as const);
});

// AppointmentsModule có service đọc DB (task B1) nên đòi `DataSource`; app thật có sẵn toàn cục từ DatabaseModule, còn test dựng riêng module cấp một DataSource GIẢ
// (không DB, không ai gọi tới nó trong các ca này) bằng `useMocker`, như `doctor-leave.port.int-spec.ts`. Token nào khác vẫn thiếu thì Nest báo lỗi như cũ.
const noDatabase = (token: unknown) =>
  token === DataSource ? ({} as DataSource) : undefined;

describe('BPO-01 token DI và AppointmentsModule', () => {
  it('có đúng tám token, đều là Symbol và khác nhau', () => {
    expect(BOOKING_PORT_TOKENS).toHaveLength(8);
    expect(new Set(BOOKING_PORT_TOKENS).size).toBe(8);
    expect(BOOKING_PORT_TOKENS.every((t) => typeof t === 'symbol')).toBe(true);
    expect([...BOOKING_PORT_TOKENS]).toEqual(EXPECTED.map(([token]) => token));
  });

  it('mảng BOOKING_PORT_PROVIDERS vẫn gắn Noop cho đủ tám token (test dựng riêng dùng nó), kể cả AppointmentNotifier', () => {
    expect(
      BOOKING_PORT_PROVIDERS.map((provider) =>
        'provide' in provider && 'useClass' in provider
          ? [provider.provide, provider.useClass]
          : null,
      ),
    ).toEqual(EXPECTED.map(([token, noop]) => [token, noop]));
  });

  it('AppointmentsModule cấp đủ tám token: sáu bản Noop, BookingNotifier THẬT cho AppointmentNotifier và LeaveReader THẬT (đúng thể hiện của SchedulingModule) cho DoctorLeavePort (không cần DB)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppointmentsModule],
    })
      .useMocker(noDatabase)
      .compile();
    for (const [token, expected] of EXPECTED_IN_MODULE)
      expect(moduleRef.get(token, { strict: false })).toBeInstanceOf(expected);
    expect(
      moduleRef.get(APPOINTMENT_NOTIFIER, { strict: false }),
    ).not.toBeInstanceOf(NoopAppointmentNotifier);
    const leave = moduleRef.get(DOCTOR_LEAVE_PORT, { strict: false });
    expect(leave).not.toBeInstanceOf(NoopDoctorLeavePort);
    // `useExisting`: cùng MỘT thể hiện với `LeaveReader` của SchedulingModule, không phải bản sao
    expect(leave).toBe(moduleRef.get(LeaveReader, { strict: false }));
    await moduleRef.close();
  });

  it('overrideProvider(token).useValue(fake) thay đúng MỘT cổng; bảy cổng còn lại giữ bản của module', async () => {
    const fake = { findBlockingLeave: () => Promise.resolve(null) };
    const moduleRef = await Test.createTestingModule({
      imports: [AppointmentsModule],
    })
      .overrideProvider(DOCTOR_LEAVE_PORT)
      .useValue(fake)
      .useMocker(noDatabase)
      .compile();
    for (const [token, expected] of EXPECTED_IN_MODULE) {
      const resolved = moduleRef.get(token, { strict: false });
      if (token === DOCTOR_LEAVE_PORT) expect(resolved).toBe(fake);
      else expect(resolved).toBeInstanceOf(expected);
    }
    await moduleRef.close();
  });

  it('mỗi token được cấp một thể hiện riêng (cờ cảnh báo một lần không dùng chung giữa các cổng)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppointmentsModule],
    })
      .useMocker(noDatabase)
      .compile();
    const instances = BOOKING_PORT_TOKENS.map((t) =>
      moduleRef.get(t, { strict: false }),
    );
    expect(new Set(instances).size).toBe(8);
    await moduleRef.close();
  });
});
