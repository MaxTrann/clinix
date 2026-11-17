import type { DataSource } from 'typeorm';
import { BookingNotifier } from '../../appointments/notifications/booking-notifier.js';
import { NoopWaitlistPort } from '../../appointments/ports/waitlist.port.js';
import { SlotHoldService } from '../../appointments/slots/slot-hold.service.js';
import { AppointmentTransitionService } from '../../appointments/state/appointment-transition.service.js';
import { WalletBalanceReader } from '../../wallet/balance/wallet-balance.reader.js';
import { WalletBalanceRepository } from '../../wallet/balance/wallet-balance.repository.js';
import { WalletLedger } from '../../wallet/ledger/wallet-ledger.js';
import { DepositPaymentService } from '../deposit/deposit-payment.service.js';
import { DepositRepository } from '../deposit/deposit.repository.js';
import { PaymentChain } from '../ports/payment-chain.js';

// Hạ tầng test dùng chung của thanh toán cọc bằng ví (payment B5; PLAN 5.15): `DepositPaymentService` THẬT với `AppointmentTransitionService` THẬT (cùng `SlotHoldService`, `BookingNotifier` thật
// để có `thong_bao`), ví và chuỗi lịch thật. Dựng bằng tay (không qua Nest) để test chủ động bọc `DataSource`. Gom một chỗ vì int-spec, int-spec đồng thời và e2e cùng cần (jscpd quét `*.int-spec.ts`).
// `balance` cho phép ĐẶT thay bản đọc số dư sơ bộ (TLK-03: bản đọc thường nói đủ tiền, nhưng dưới khoá ví thì thiếu).
export function depositStack(
  db: DataSource,
  options: { balance?: Pick<WalletBalanceReader, 'available'> } = {},
) {
  const transitions = new AppointmentTransitionService(
    db,
    new SlotHoldService(),
    new NoopWaitlistPort(),
    new BookingNotifier(),
  );
  const ledger = new WalletLedger();
  const balance =
    options.balance ??
    new WalletBalanceReader(db, new WalletBalanceRepository());
  const service = new DepositPaymentService(
    db,
    new DepositRepository(),
    transitions,
    ledger,
    balance as WalletBalanceReader,
    new PaymentChain(),
  );
  return { service, transitions, ledger, balance };
}
