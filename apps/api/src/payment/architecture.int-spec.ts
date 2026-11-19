import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module.js';
import { AppointmentsModule } from '../appointments/appointments.module.js';
import { DOCTOR_LEAVE_PORT } from '../appointments/ports/doctor-leave.port.js';
import { walkModuleTree } from '../doctor/testing/architecture-scan.js';
import { PaymentModule } from './payment.module.js';
import { PaymentChain } from './ports/payment-chain.js';
import { PaymentRecorder } from './ports/payment-recorder.js';
import { PaymentSummaryReader } from './ports/payment-summary.reader.js';
import { PaymentPortsModule } from './ports/payment-ports.module.js';
import { WalletBalanceReader } from '../wallet/balance/wallet-balance.reader.js';
import { RefundService } from '../wallet/refund/refund.service.js';
import { WalletLedger } from '../wallet/ledger/wallet-ledger.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { RbacModule } from '../rbac/rbac.module.js';

// payment P4 — QTT-11 (cây import của AppModule) và HDT-11 (AppointmentsModule dựng được cùng hai module lá, không forwardRef; M16). Phần quét mã nguồn của QTT-11: architecture.spec.ts.
// Nằm ở *.int-spec.ts vì import AppModule cần biến môi trường test (như AR-03 của booking); không dùng DB (DataSource giả ở HDT-11).
// Từ payment P3 có WalletModule: ca "WalletModule nhập PaymentPortsModule một chiều" và đưa WalletModule vào HDT-11 (M16) nằm ở đây.
const noDatabase = (token: unknown) =>
  token === DataSource ? ({} as DataSource) : undefined;

const importsOf = (module: unknown): unknown[] =>
  (Reflect.getMetadata('imports', module as object) as unknown[] | undefined) ??
  [];

describe('QTT-11 cây import của AppModule có payment', () => {
  it('AppModule đăng ký PaymentModule đúng một lần; cây không chu trình; PaymentPortsModule có trong cây', async () => {
    const tree = await walkModuleTree(AppModule);
    expect(tree.cycle).toBeNull();
    expect(
      importsOf(AppModule).filter((m) => m === PaymentModule),
    ).toHaveLength(1);
    expect(tree.references.has(PaymentModule)).toBe(true);
    expect(tree.references.has(PaymentPortsModule)).toBe(true);
    expect(importsOf(AppModule).filter((m) => m === WalletModule)).toHaveLength(
      1,
    );
    expect(tree.references.has(WalletModule)).toBe(true);
  });

  it('PaymentPortsModule là lá: không nhập module nào; xuất PaymentChain, PaymentRecorder, PaymentSummaryReader (B2)', () => {
    expect(importsOf(PaymentPortsModule)).toEqual([]);
    expect(
      Reflect.getMetadata('exports', PaymentPortsModule) as unknown[],
    ).toEqual([PaymentChain, PaymentRecorder, PaymentSummaryReader]);
  });

  it('chiều phụ thuộc: PaymentModule nhập PaymentPortsModule; không module lá nào nhập PaymentModule hay AppointmentsModule', () => {
    expect(importsOf(PaymentModule)).toContain(PaymentPortsModule);
    for (const leaf of [PaymentPortsModule, WalletModule]) {
      expect(importsOf(leaf)).not.toContain(PaymentModule);
      expect(importsOf(leaf)).not.toContain(AppointmentsModule);
    }
  });

  it('WalletModule nhập PaymentPortsModule MỘT chiều (Q22): PaymentPortsModule không nhập lại WalletModule; WalletModule chỉ xuất WalletLedger, WalletBalanceReader (B1) và RefundService (B8)', () => {
    // B12: thêm hai module LÁ cho route Quản trị viên (RbacModule: guard phạm vi; AuditModule: nhật ký duyệt rút); cả hai không nhập ngược WalletModule
    expect(importsOf(WalletModule)).toEqual([
      PaymentPortsModule,
      RbacModule,
      AuditModule,
    ]);
    expect(importsOf(RbacModule)).not.toContain(WalletModule);
    expect(importsOf(AuditModule)).not.toContain(WalletModule);
    expect(importsOf(PaymentPortsModule)).not.toContain(WalletModule);
    expect(Reflect.getMetadata('exports', WalletModule) as unknown[]).toEqual([
      WalletLedger,
      WalletBalanceReader,
      RefundService,
    ]);
  });
});

describe('HDT-11 AppointmentsModule dựng được cùng hai module lá, không forwardRef (M16)', () => {
  it('dựng AppointmentsModule, PaymentModule, WalletModule và PaymentPortsModule cùng lúc: Nest compile được, PaymentChain và WalletLedger tiêm được (không cần DB)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AppointmentsModule,
        PaymentModule,
        WalletModule,
        PaymentPortsModule,
      ],
    })
      .useMocker(noDatabase)
      .compile();
    expect(moduleRef.get(PaymentChain, { strict: false })).toBeInstanceOf(
      PaymentChain,
    );
    expect(moduleRef.get(WalletLedger, { strict: false })).toBeInstanceOf(
      WalletLedger,
    );
    await moduleRef.close();
  });

  it('overrideProvider thay được một cổng của AppointmentsModule khi có hai module lá trong cây (M16)', async () => {
    const fake = { findBlockingLeave: () => Promise.resolve(null) };
    const moduleRef = await Test.createTestingModule({
      imports: [AppointmentsModule, PaymentModule, WalletModule],
    })
      .overrideProvider(DOCTOR_LEAVE_PORT)
      .useValue(fake)
      .useMocker(noDatabase)
      .compile();
    expect(moduleRef.get(DOCTOR_LEAVE_PORT, { strict: false })).toBe(fake);
    await moduleRef.close();
  });
});
