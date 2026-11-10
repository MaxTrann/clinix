import type {
  AppointmentEvent,
  AppointmentNotifier,
} from '../ports/appointment-notifier.port.js';
import type { DoctorLeavePort } from '../ports/doctor-leave.port.js';
import type { PaymentPort, PaymentSummaryPort } from '../ports/payment.port.js';
import type { PendingBranchChangesPort } from '../ports/pending-branch-changes.port.js';
import type { RefundPort, WalletBalancePort } from '../ports/wallet.port.js';
import type { WaitlistPort } from '../ports/waitlist.port.js';

// Bản Fake LẬP TRÌNH ĐƯỢC của tám cổng (PLAN booking 5.15; TRACKING 3.6 P2-E), dùng cho DL, HL, HG, CT, DT và X1 từ B6 trở đi. Để ở `testing/` (không ở `ports/`):
// không vào mã chạy thật, không bị AR-04 quét. Mỗi Fake là vỏ mỏng quanh `ScriptedCall` nên tám lớp không chép nhau (jscpd quét file `testing/`).

type AsyncFn = (...args: never[]) => Promise<unknown>;

/**
 * Một lời gọi lập trình được: ghi lại mọi lần gọi (tham số, KỂ CẢ `EntityManager` nhận vào, để test kiểm "gọi dưới khoá bac_si" hay "sau commit"), đếm,
 * trả kết quả đặt sẵn (hoặc tính theo tham số), ném lỗi một lần hay mọi lần, và chạy hook `onCall` TRƯỚC khi trả (test dùng hook để đọc DB từ một kết nối khác
 * ngay lúc cổng bị gọi). Thứ tự trong `call`: ghi lại, chạy hook, ném lỗi (nếu có), trả kết quả.
 */
export class ScriptedCall<M extends AsyncFn> {
  readonly calls: Parameters<M>[] = [];

  private answer: (...args: Parameters<M>) => Awaited<ReturnType<M>>;
  private failuresOnce: unknown[] = [];
  private failureAlways: { error: unknown } | null = null;
  private hook: ((...args: Parameters<M>) => void | Promise<void>) | null =
    null;

  constructor(private readonly initial: Awaited<ReturnType<M>>) {
    this.answer = () => initial;
  }

  get count(): number {
    return this.calls.length;
  }

  returns(value: Awaited<ReturnType<M>>): this {
    this.answer = () => value;
    return this;
  }

  answers(compute: (...args: Parameters<M>) => Awaited<ReturnType<M>>): this {
    this.answer = compute;
    return this;
  }

  /** Lần gọi kế tiếp ném `error`, các lần sau bình thường (có thể gọi nhiều lần để xếp hàng lỗi). */
  throwsOnce(error: unknown): this {
    this.failuresOnce.push(error);
    return this;
  }

  throwsAlways(error: unknown): this {
    this.failureAlways = { error };
    return this;
  }

  onCall(hook: (...args: Parameters<M>) => void | Promise<void>): this {
    this.hook = hook;
    return this;
  }

  /** Xoá lịch sử gọi, lỗi và hook; kết quả về giá trị ban đầu. */
  reset(): this {
    this.calls.length = 0;
    this.failuresOnce = [];
    this.failureAlways = null;
    this.hook = null;
    this.answer = () => this.initial;
    return this;
  }

  async call(...args: Parameters<M>): Promise<Awaited<ReturnType<M>>> {
    this.calls.push(args);
    await this.hook?.(...args);
    if (this.failuresOnce.length > 0) throw this.failuresOnce.shift();
    if (this.failureAlways) throw this.failureAlways.error;
    return this.answer(...args);
  }
}

const same = (a: unknown, b: unknown): boolean =>
  a instanceof Date && b instanceof Date
    ? a.getTime() === b.getTime()
    : Object.is(a, b);

/** Mọi khoá của `match` phải bằng khoá cùng tên của `actual` (khoá không nêu thì bỏ qua). */
function matches<T extends object>(match: Partial<T>, actual: T): boolean {
  return Object.entries(match).every(([key, value]) =>
    same(value, actual[key as keyof T]),
  );
}

export class FakePaymentPort implements PaymentPort {
  readonly recordZeroPaymentCall = new ScriptedCall<
    PaymentPort['recordZeroPayment']
  >(undefined);

  recordZeroPayment(
    ...args: Parameters<PaymentPort['recordZeroPayment']>
  ): Promise<void> {
    return this.recordZeroPaymentCall.call(...args);
  }
}

export class FakePaymentSummaryPort implements PaymentSummaryPort {
  readonly amountPaidCall = new ScriptedCall<PaymentSummaryPort['amountPaid']>(
    '0.00',
  );
  readonly remainingCall = new ScriptedCall<
    PaymentSummaryPort['remainingToCollect']
  >('0.00');

  amountPaid(
    ...args: Parameters<PaymentSummaryPort['amountPaid']>
  ): Promise<string> {
    return this.amountPaidCall.call(...args);
  }

  remainingToCollect(
    ...args: Parameters<PaymentSummaryPort['remainingToCollect']>
  ): Promise<string> {
    return this.remainingCall.call(...args);
  }

  /** Số đã thu theo `lichHenId`; id không nêu ⇒ `fallback`. */
  paid(byLichHenId: Record<string, string>, fallback = '0.00'): this {
    this.amountPaidCall.answers(
      (_em, lichHenId) => byLichHenId[lichHenId] ?? fallback,
    );
    return this;
  }

  /** Số còn phải thu theo `lichHenId`; id không nêu ⇒ `fallback`. */
  remaining(byLichHenId: Record<string, string>, fallback = '0.00'): this {
    this.remainingCall.answers(
      (_em, lichHenId) => byLichHenId[lichHenId] ?? fallback,
    );
    return this;
  }
}

export class FakeRefundPort implements RefundPort {
  readonly refundCall = new ScriptedCall<RefundPort['refund']>({
    kind: 'Refunded',
  });

  refund(...args: Parameters<RefundPort['refund']>) {
    return this.refundCall.call(...args);
  }

  /** Kết quả của mọi lần gọi tiếp theo. */
  result(kind: 'Refunded' | 'Failed' | 'NotNeeded'): this {
    this.refundCall.returns({ kind });
    return this;
  }
}

export class FakeWalletBalancePort implements WalletBalancePort {
  readonly availableCall = new ScriptedCall<WalletBalancePort['available']>(
    null,
  );

  available(
    ...args: Parameters<WalletBalancePort['available']>
  ): Promise<string | null> {
    return this.availableCall.call(...args);
  }
}

export class FakeWaitlistPort implements WaitlistPort {
  readonly onSlotReleasedCall = new ScriptedCall<
    WaitlistPort['onSlotReleased']
  >(undefined);

  onSlotReleased(
    ...args: Parameters<WaitlistPort['onSlotReleased']>
  ): Promise<void> {
    return this.onSlotReleasedCall.call(...args);
  }

  /** Các `khungGioId` đã được báo, theo thứ tự gọi. */
  get releasedSlotIds(): string[] {
    return this.onSlotReleasedCall.calls.map(([khungGioId]) => khungGioId);
  }
}

export class FakeAppointmentNotifier implements AppointmentNotifier {
  readonly notifyCall = new ScriptedCall<AppointmentNotifier['notify']>(
    undefined,
  );

  notify(...args: Parameters<AppointmentNotifier['notify']>): Promise<void> {
    return this.notifyCall.call(...args);
  }

  /** Các sự kiện đã ghi, theo thứ tự gọi. */
  get events(): AppointmentEvent[] {
    return this.notifyCall.calls.map(([, event]) => event);
  }
}

type LeaveInput = Parameters<DoctorLeavePort['findBlockingLeave']>[1];

export class FakeDoctorLeavePort implements DoctorLeavePort {
  readonly findBlockingLeaveCall = new ScriptedCall<
    DoctorLeavePort['findBlockingLeave']
  >(null);

  findBlockingLeave(...args: Parameters<DoctorLeavePort['findBlockingLeave']>) {
    return this.findBlockingLeaveCall.call(...args);
  }

  /** Chặn khi lời gọi khớp `match` (khoá không nêu thì bỏ qua; `{}` = chặn mọi lời gọi); không khớp ⇒ `null`. */
  blocks(
    match: Partial<LeaveInput> = {},
    trangThai: 'ChoDuyet' | 'DaDuyet' = 'DaDuyet',
    yeuCauNghiPhepId = '1',
  ): this {
    this.findBlockingLeaveCall.answers((_em, input) =>
      matches(match, input) ? { yeuCauNghiPhepId, trangThai } : null,
    );
    return this;
  }

  allows(): this {
    this.findBlockingLeaveCall.returns(null);
    return this;
  }
}

type BranchChangeInput = Parameters<
  PendingBranchChangesPort['findBlocking']
>[1];

export class FakePendingBranchChangesPort implements PendingBranchChangesPort {
  readonly findBlockingCall = new ScriptedCall<
    PendingBranchChangesPort['findBlocking']
  >(null);

  findBlocking(...args: Parameters<PendingBranchChangesPort['findBlocking']>) {
    return this.findBlockingCall.call(...args);
  }

  /** Chặn khi lời gọi khớp `match` (`ngayGio` so theo mili giây); không khớp ⇒ `null`. */
  blocks(
    match: Partial<BranchChangeInput> = {},
    yeuCauThayDoiChiNhanhId = '1',
  ): this {
    this.findBlockingCall.answers((_em, input) =>
      matches(match, input) ? { yeuCauThayDoiChiNhanhId } : null,
    );
    return this;
  }

  allows(): this {
    this.findBlockingCall.returns(null);
    return this;
  }
}

/** Một bộ đủ tám Fake (mỗi test tạo mới). */
export function createFakePorts() {
  return {
    payment: new FakePaymentPort(),
    paymentSummary: new FakePaymentSummaryPort(),
    refund: new FakeRefundPort(),
    walletBalance: new FakeWalletBalancePort(),
    waitlist: new FakeWaitlistPort(),
    doctorLeave: new FakeDoctorLeavePort(),
    pendingBranchChanges: new FakePendingBranchChangesPort(),
    notifier: new FakeAppointmentNotifier(),
  };
}
