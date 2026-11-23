import type { Provider } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants.js';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { PendingBranchChangesModule } from '../../admin/branch-change-requests/pending-branch-changes.module.js';
import { PaymentPortsModule } from '../../payment/ports/payment-ports.module.js';
import { PaymentRecorder } from '../../payment/ports/payment-recorder.js';
import { PaymentSummaryReader } from '../../payment/ports/payment-summary.reader.js';
import { WalletBalanceReader } from '../../wallet/balance/wallet-balance.reader.js';
import { RefundService } from '../../wallet/refund/refund.service.js';
import { WalletModule } from '../../wallet/wallet.module.js';
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
import { PendingBranchChangesAdapter } from './pending-branch-changes.adapter.js';
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

// B15 (TRACKING 3.37 B15-J): trong `AppointmentsModule` cổng thông báo là BẢN THẬT (`BookingNotifier`). B16a (TRACKING 3.39 B16a-C): cổng nghỉ phép cũng là BẢN THẬT (`LeaveReader` của `SchedulingModule`, `useExisting`).
// B7 (TRACKING 3.47; payment B7 = B17a lần 1, HDT-06): ba cổng thanh toán và ví cũng là BẢN THẬT, `useExisting` lớp của hai module lá (`PaymentRecorder`, `PaymentSummaryReader` của `PaymentPortsModule`;
// `WalletBalanceReader` của `WalletModule`). B9 (TRACKING 3.48; payment B9 = B17a lần 2, HDT-08): `REFUND_PORT` cũng là BẢN THẬT, `useExisting: RefundService` của `WalletModule` (BPO-08). B16b (TRACKING 3.50):
// `PENDING_BRANCH_CHANGES_PORT` là BẢN THẬT, `useClass: PendingBranchChangesAdapter` (adapter, không `useExisting`; BPO-08, BPO-07). Chỉ còn MỘT bản `Noop`: `WAITLIST_PORT`. Mảng `BOOKING_PORT_PROVIDERS` và lớp `Noop` giữ nguyên (test dựng riêng dùng chúng).
const REAL_IN_MODULE = new Map<symbol, new (...args: never[]) => unknown>([
  [APPOINTMENT_NOTIFIER, BookingNotifier],
  [DOCTOR_LEAVE_PORT, LeaveReader],
  [PAYMENT_PORT, PaymentRecorder],
  [PAYMENT_SUMMARY_PORT, PaymentSummaryReader],
  [WALLET_BALANCE_PORT, WalletBalanceReader],
  [REFUND_PORT, RefundService],
  [PENDING_BRANCH_CHANGES_PORT, PendingBranchChangesAdapter],
]);
const EXPECTED_IN_MODULE = EXPECTED.map(([token, noop]) => {
  const real = REAL_IN_MODULE.get(token);
  return real === undefined
    ? ([token, noop] as const)
    : ([token, real] as const);
});

// Ba cổng của B7: token, lớp thật của module lá mà `useExisting` trỏ tới, và bản `Noop` KHÔNG được còn cấp.
const B7_PORTS = [
  ['PAYMENT_PORT', PAYMENT_PORT, PaymentRecorder, NoopPaymentPort],
  [
    'PAYMENT_SUMMARY_PORT',
    PAYMENT_SUMMARY_PORT,
    PaymentSummaryReader,
    NoopPaymentSummaryPort,
  ],
  [
    'WALLET_BALANCE_PORT',
    WALLET_BALANCE_PORT,
    WalletBalanceReader,
    NoopWalletBalancePort,
  ],
] as const;

// Cổng nào của module cũng thay được bằng `overrideProvider(token).useValue(fake)` (test dựng riêng): bảy cổng thật ở trên.
const OVERRIDABLE = [
  ['APPOINTMENT_NOTIFIER', APPOINTMENT_NOTIFIER],
  ['DOCTOR_LEAVE_PORT', DOCTOR_LEAVE_PORT],
  ['PAYMENT_PORT', PAYMENT_PORT],
  ['PAYMENT_SUMMARY_PORT', PAYMENT_SUMMARY_PORT],
  ['WALLET_BALANCE_PORT', WALLET_BALANCE_PORT],
  ['REFUND_PORT', REFUND_PORT],
  ['PENDING_BRANCH_CHANGES_PORT', PENDING_BRANCH_CHANGES_PORT],
] as const;

// AppointmentsModule có service đọc DB (task B1) nên đòi `DataSource`; app thật có sẵn toàn cục từ DatabaseModule, còn test dựng riêng module cấp một DataSource GIẢ
// (không DB, không ai gọi tới nó trong các ca này) bằng `useMocker`, như `doctor-leave.port.int-spec.ts`. Token nào khác vẫn thiếu thì Nest báo lỗi như cũ.
// Từ B7 module này nhập thêm `WalletModule` và `PaymentPortsModule`: mọi provider của chúng chỉ đòi `DataSource` hoặc provider cùng module nên mocker này vẫn đủ.
const noDatabase = (token: unknown) =>
  token === DataSource ? ({} as DataSource) : undefined;

const metadataOf = (key: string, module: object): unknown[] =>
  (Reflect.getMetadata(key, module) as unknown[] | undefined) ?? [];

describe('BPO-01 token DI và AppointmentsModule', () => {
  it('có đúng tám token, đều là Symbol và khác nhau', () => {
    expect(BOOKING_PORT_TOKENS).toHaveLength(8);
    expect(new Set(BOOKING_PORT_TOKENS).size).toBe(8);
    expect(BOOKING_PORT_TOKENS.every((t) => typeof t === 'symbol')).toBe(true);
    expect([...BOOKING_PORT_TOKENS]).toEqual(EXPECTED.map(([token]) => token));
  });

  it('mảng BOOKING_PORT_PROVIDERS vẫn gắn Noop cho đủ tám token (test dựng riêng dùng nó), kể cả ba cổng đã thật trong module', () => {
    expect(
      BOOKING_PORT_PROVIDERS.map((provider) =>
        'provide' in provider && 'useClass' in provider
          ? [provider.provide, provider.useClass]
          : null,
      ),
    ).toEqual(EXPECTED.map(([token, noop]) => [token, noop]));
  });

  it('AppointmentsModule cấp đủ tám token: MỘT bản Noop (danh sách chờ) và bảy bản THẬT (BookingNotifier, LeaveReader, PaymentRecorder, PaymentSummaryReader, WalletBalanceReader, RefundService, PendingBranchChangesAdapter), không cần DB', async () => {
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

  it.each(B7_PORTS)(
    'HDT-06 %s là BẢN THẬT của module lá (toBe đúng thể hiện của lớp, useExisting), không còn Noop; hai cổng khác không bị kéo theo',
    async (_name, token, real, noop) => {
      const moduleRef = await Test.createTestingModule({
        imports: [AppointmentsModule],
      })
        .useMocker(noDatabase)
        .compile();
      const port = moduleRef.get(token, { strict: false });
      expect(port).toBeInstanceOf(real);
      expect(port).not.toBeInstanceOf(noop);
      expect(port).toBe(moduleRef.get(real, { strict: false }));
      await moduleRef.close();
    },
  );

  it.each(OVERRIDABLE)(
    'overrideProvider(%s).useValue(fake) thay đúng MỘT cổng; sáu cổng còn lại giữ bản của module',
    async (_name, overridden) => {
      const fake = { fake: true };
      const moduleRef = await Test.createTestingModule({
        imports: [AppointmentsModule],
      })
        .overrideProvider(overridden)
        .useValue(fake)
        .useMocker(noDatabase)
        .compile();
      for (const [token, expected] of EXPECTED_IN_MODULE) {
        const resolved = moduleRef.get(token, { strict: false });
        if (token === overridden) expect(resolved).toBe(fake);
        else expect(resolved).toBeInstanceOf(expected);
      }
      await moduleRef.close();
    },
  );

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

describe('BPO-08 REFUND_PORT là RefundService của WalletModule (payment B9, HDT-08, M16)', () => {
  it('toBe đúng thể hiện RefundService (useExisting, không phải bản sao), không phải NoopRefundPort; cổng chưa thật (danh sách chờ) vẫn là Noop, cổng đổi chi nhánh là adapter THẬT (B16b)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppointmentsModule],
    })
      .useMocker(noDatabase)
      .compile();
    const port = moduleRef.get(REFUND_PORT, { strict: false });
    expect(port).toBeInstanceOf(RefundService);
    expect(port).not.toBeInstanceOf(NoopRefundPort);
    expect(port).toBe(moduleRef.get(RefundService, { strict: false }));
    expect(moduleRef.get(WAITLIST_PORT, { strict: false })).toBeInstanceOf(
      NoopWaitlistPort,
    );
    const pending = moduleRef.get(PENDING_BRANCH_CHANGES_PORT, {
      strict: false,
    });
    expect(pending).toBeInstanceOf(PendingBranchChangesAdapter);
    expect(pending).not.toBeInstanceOf(NoopPendingBranchChangesPort);
    await moduleRef.close();
  });
});

describe('BPO-06 mỗi cổng có ĐÚNG MỘT provider trong module (không dựa thứ tự "provider sau thắng")', () => {
  it('mỗi token trong tám token xuất hiện đúng một lần trong providers của AppointmentsModule: bỏ một token khỏi REAL_PORT_TOKENS làm ca này đỏ', () => {
    const providers = metadataOf(
      MODULE_METADATA.PROVIDERS,
      AppointmentsModule,
    ) as Provider[];
    for (const token of BOOKING_PORT_TOKENS) {
      const declared = providers.filter(
        (provider) =>
          typeof provider === 'object' &&
          'provide' in provider &&
          provider.provide === token,
      );
      expect(declared, String(token)).toHaveLength(1);
    }
  });
});

describe('BPO-07 cạnh AppointmentsModule → PaymentPortsModule, WalletModule, PendingBranchChangesModule (HDT-11, M16)', () => {
  it('imports gồm hai module lá và không gồm PaymentModule; hai module lá không nhập ngược AppointmentsModule', () => {
    const own = metadataOf(MODULE_METADATA.IMPORTS, AppointmentsModule);
    expect(own).toContain(PaymentPortsModule);
    expect(own).toContain(WalletModule);
    expect(
      own.map((module) => (module as { name?: string }).name),
    ).not.toContain('PaymentModule');
    for (const leaf of [PaymentPortsModule, WalletModule])
      expect(metadataOf(MODULE_METADATA.IMPORTS, leaf)).not.toContain(
        AppointmentsModule,
      );
  });

  it('B16b: imports có PendingBranchChangesModule của admin; module lá đó KHÔNG nhập gì (nên không thể nhập ngược AppointmentsModule) và xuất cả lớp reader', () => {
    expect(metadataOf(MODULE_METADATA.IMPORTS, AppointmentsModule)).toContain(
      PendingBranchChangesModule,
    );
    expect(
      metadataOf(MODULE_METADATA.IMPORTS, PendingBranchChangesModule),
    ).toEqual([]);
    expect(
      metadataOf(MODULE_METADATA.EXPORTS, PendingBranchChangesModule),
    ).toHaveLength(1);
  });
});
