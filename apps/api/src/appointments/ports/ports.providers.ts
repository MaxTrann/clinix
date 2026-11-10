import type { Provider } from '@nestjs/common';
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
import {
  NoopRefundPort,
  NoopWalletBalancePort,
  REFUND_PORT,
  WALLET_BALANCE_PORT,
} from './wallet.port.js';
import { NoopWaitlistPort, WAITLIST_PORT } from './waitlist.port.js';

// Tám cổng của booking, mỗi cổng gắn bản `Noop` mặc định. `AppointmentsModule` đưa mảng này vào `providers`.
// KHI MODULE THẬT CÓ MÃ (B16, B17): sửa đúng dòng của cổng đó ở `appointments.module.ts`, KHÔNG ở đây (xem comment của module).
const NOOP_BINDINGS = [
  [PAYMENT_PORT, NoopPaymentPort],
  [PAYMENT_SUMMARY_PORT, NoopPaymentSummaryPort],
  [REFUND_PORT, NoopRefundPort],
  [WALLET_BALANCE_PORT, NoopWalletBalancePort],
  [WAITLIST_PORT, NoopWaitlistPort],
  [DOCTOR_LEAVE_PORT, NoopDoctorLeavePort],
  [PENDING_BRANCH_CHANGES_PORT, NoopPendingBranchChangesPort],
  [APPOINTMENT_NOTIFIER, NoopAppointmentNotifier],
] as const;

export const BOOKING_PORT_TOKENS: readonly symbol[] = NOOP_BINDINGS.map(
  ([token]) => token,
);

export const BOOKING_PORT_PROVIDERS: Provider[] = NOOP_BINDINGS.map(
  ([provide, useClass]) => ({ provide, useClass }),
);
